import { NextRequest, NextResponse } from "next/server"

// Simple Open Graph scraper — fetches a URL and returns title, description, image, siteName
// Runs server-side to avoid CORS issues and to not expose the target URL to analytics.

const TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 256 * 1024 // 256 KB — enough to find <head> tags

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
    clearTimeout(timer)

    if (!resp.ok) return NextResponse.json({ error: "fetch failed" }, { status: 502 })

    const contentType = resp.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) {
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

    const og = parseOG(html, parsedUrl.origin)
    return NextResponse.json(og, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    })
  } catch (err: any) {
    if (err?.name === "AbortError") return NextResponse.json({ error: "timeout" }, { status: 504 })
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}

function parseOG(html: string, origin: string) {
  function meta(prop: string): string | null {
    // og:prop or name="prop"
    const ogRe = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")
    const nameRe = new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")
    const m = html.match(ogRe) ?? html.match(nameRe)
    return m ? decodeHTMLEntities(m[1]) : null
  }

  const title =
    meta("title") ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
    null

  const description = meta("description")

  let image = meta("image")
  if (image && image.startsWith("/")) image = origin + image

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
