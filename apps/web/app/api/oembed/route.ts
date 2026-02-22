import { NextRequest, NextResponse } from "next/server"
import { lookup } from "dns/promises"

// Simple Open Graph scraper — fetches a URL and returns title, description, image, siteName
// Runs server-side to avoid CORS issues and to not expose the target URL to analytics.

const TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 256 * 1024 // 256 KB — enough to find <head> tags

/** Returns true if the IP falls in a private/reserved range (SSRF guard). */
function isPrivateIp(ip: string): boolean {
  // Unwrap IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4mapped) return isPrivateIp(v4mapped[1])

  const parts = ip.split(".").map(Number)
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts
    if (a === 10) return true                           // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true   // 172.16.0.0/12
    if (a === 192 && b === 168) return true             // 192.168.0.0/16
    if (a === 127) return true                          // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true             // 169.254.0.0/16 link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true  // 100.64.0.0/10 CGNAT
    if (a === 0) return true                            // 0.0.0.0/8
    return false
  }

  // IPv6 checks
  if (ip === "::1") return true                        // loopback
  if (/^f[cd]/i.test(ip)) return true                  // fc00::/7 unique local
  if (/^fe[89ab]/i.test(ip)) return true               // fe80::/10 link-local
  return false
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  // Only allow http/https
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("bad protocol")
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  // SSRF guard: resolve hostname and block private/reserved IPs
  try {
    const addresses = await lookup(parsedUrl.hostname, { all: true })
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 })
      }
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const resp = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VortexChatBot/1.0 (link preview)",
        Accept: "text/html",
      },
    })

    if (!resp.ok) {
      clearTimeout(timer)
      return NextResponse.json({ error: "fetch failed" }, { status: 502 })
    }

    const contentType = resp.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) {
      clearTimeout(timer)
      return NextResponse.json({ error: "not html" }, { status: 422 })
    }

    // Read only first MAX_BODY_BYTES to avoid huge pages
    const reader = resp.body?.getReader()
    let html = ""
    let bytesRead = 0
    if (reader) {
      const decoder = new TextDecoder()
      while (bytesRead < MAX_BODY_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
        bytesRead += value.byteLength
        // Stop once we've passed </head>
        if (html.includes("</head>")) break
      }
      reader.cancel()
    }
    // Clear abort timer only after body read is complete
    clearTimeout(timer)

    const og = parseOG(html, parsedUrl.origin, parsedUrl.protocol)
    return NextResponse.json(og, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    })
  } catch (err: any) {
    if (err?.name === "AbortError") return NextResponse.json({ error: "timeout" }, { status: 504 })
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}

function parseOG(html: string, origin: string, protocol: string) {
  function meta(prop: string): string | null {
    // Extract each <meta> tag and parse attributes in any order
    const tagRe = /<meta\b[^>]*>/gi
    let tag: RegExpExecArray | null
    while ((tag = tagRe.exec(html)) !== null) {
      const attrs = tag[0]
      const propMatch = attrs.match(/property=["']og:([^"']+)["']/i) ?? attrs.match(/name=["']([^"']+)["']/i)
      const contentMatch = attrs.match(/content=["']([^"']*?)["']/i)
      if (!propMatch || !contentMatch) continue
      const key = propMatch[1].toLowerCase()
      if (key === prop || key === `og:${prop}`) return decodeHTMLEntities(contentMatch[1])
    }
    return null
  }

  const title =
    meta("title") ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
    null

  const description = meta("description")

  let image = meta("image")
  if (image) {
    if (image.startsWith("//")) {
      image = protocol + image
    } else if (image.startsWith("/")) {
      image = origin + image
    }
  }

  const siteName = meta("site_name") ?? null
  const favicon = `${origin}/favicon.ico`

  return { title, description, image, siteName, url: null, favicon }
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
}
