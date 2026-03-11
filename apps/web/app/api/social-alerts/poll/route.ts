import dns from "node:dns/promises"
import net from "node:net"
import { NextRequest, NextResponse } from "next/server"
import { SYSTEM_BOT_ID } from "@/lib/server-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type AlertRow = {
  id: string
  server_id: string
  channel_id: string
  name: string
  feed_url: string
  last_item_id: string | null
  last_checked_at: string | null
}

type FeedEntry = {
  id: string
  title: string
  link: string
  publishedAt: Date | null
}

type XmlNode = {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim()
}

function localName(name: string) {
  return name.includes(":") ? name.split(":").pop() ?? name : name
}

function parseAttributes(raw: string) {
  const attrs: Record<string, string> = {}
  const attrRegex = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null = null
  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = decodeXml(match[2] ?? match[3] ?? "")
  }
  return attrs
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "root", attrs: {}, children: [], text: "" }
  const stack: XmlNode[] = [root]
  let i = 0

  while (i < xml.length) {
    const lt = xml.indexOf("<", i)
    if (lt === -1) {
      stack[stack.length - 1].text += decodeXml(xml.slice(i))
      break
    }

    if (lt > i) {
      stack[stack.length - 1].text += decodeXml(xml.slice(i, lt))
    }

    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4)
      i = end === -1 ? xml.length : end + 3
      continue
    }

    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9)
      const cdata = end === -1 ? xml.slice(lt + 9) : xml.slice(lt + 9, end)
      stack[stack.length - 1].text += cdata
      i = end === -1 ? xml.length : end + 3
      continue
    }

    if (xml.startsWith("<?", lt) || xml.startsWith("<!DOCTYPE", lt)) {
      const end = xml.indexOf(">", lt + 2)
      i = end === -1 ? xml.length : end + 1
      continue
    }

    const gt = xml.indexOf(">", lt + 1)
    if (gt === -1) break
    const tagContent = xml.slice(lt + 1, gt).trim()

    if (tagContent.startsWith("/")) {
      const closeName = localName(tagContent.slice(1).trim())
      while (stack.length > 1) {
        const popped = stack.pop()
        if (popped && localName(popped.name) === closeName) break
      }
      i = gt + 1
      continue
    }

    const selfClosing = tagContent.endsWith("/")
    const cleanTag = selfClosing ? tagContent.slice(0, -1).trim() : tagContent
    const spaceIndex = cleanTag.search(/\s/)
    const tagName = spaceIndex === -1 ? cleanTag : cleanTag.slice(0, spaceIndex)
    const attrRaw = spaceIndex === -1 ? "" : cleanTag.slice(spaceIndex + 1)
    const node: XmlNode = {
      name: tagName,
      attrs: parseAttributes(attrRaw),
      children: [],
      text: "",
    }

    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
    i = gt + 1
  }

  return root
}

function findNodes(node: XmlNode, targetLocalNames: Set<string>, acc: XmlNode[] = []) {
  if (targetLocalNames.has(localName(node.name))) acc.push(node)
  for (const child of node.children) findNodes(child, targetLocalNames, acc)
  return acc
}

function getChild(node: XmlNode, names: string[]) {
  const set = new Set(names)
  return node.children.find((child) => set.has(localName(child.name))) ?? null
}

function getChildText(node: XmlNode, names: string[]) {
  const child = getChild(node, names)
  if (!child) return ""
  return decodeXml(child.text)
}

function toDate(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function getLink(entryNode: XmlNode) {
  const linkNodes = entryNode.children.filter((child) => localName(child.name) === "link")

  for (const linkNode of linkNodes) {
    const rel = (linkNode.attrs.rel ?? "alternate").toLowerCase()
    const href = linkNode.attrs.href ? decodeXml(linkNode.attrs.href) : ""
    if (href && (rel === "alternate" || rel === "")) return href
  }

  for (const linkNode of linkNodes) {
    const href = linkNode.attrs.href ? decodeXml(linkNode.attrs.href) : ""
    if (href) return href
    if (linkNode.text.trim()) return decodeXml(linkNode.text)
  }

  return getChildText(entryNode, ["link"])
}

function parseFeed(xml: string): FeedEntry[] {
  const tree = parseXml(xml)
  const rssItems = findNodes(tree, new Set(["item"]))
  const atomEntries = findNodes(tree, new Set(["entry"]))
  const source = rssItems.length > 0 ? rssItems : atomEntries

  return source
    .map((node) => {
      const title = getChildText(node, ["title"]) || "Untitled"
      const link = getLink(node)
      const id = getChildText(node, ["guid", "id"]) || link || title
      const publishedRaw = getChildText(node, ["pubDate", "published", "updated"]) || ""
      const publishedAt = publishedRaw ? toDate(publishedRaw) : null
      if (!id || !link) return null
      return { id, title, link, publishedAt }
    })
    .filter((entry): entry is FeedEntry => entry !== null)
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((x) => Number(x))
  if (parts.length !== 4 || parts.some((x) => Number.isNaN(x) || x < 0 || x > 255)) return true
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  if (normalized === "::1") return true
  if (normalized.startsWith("fe80:")) return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.replace("::ffff:", "")
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true
  }
  return false
}

async function validatePublicFeedUrl(feedUrl: string) {
  const parsed = new URL(feedUrl)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("invalid_protocol")
  }

  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true })
  if (!records.length) throw new Error("unresolved_host")

  for (const record of records) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new Error("private_address")
    }
    if (record.family === 6 && isPrivateIpv6(record.address)) {
      throw new Error("private_address")
    }
  }
}

async function processAlert(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>, alert: AlertRow) {
  try {
    await validatePublicFeedUrl(alert.feed_url)

    const response = await fetch(alert.feed_url, {
      headers: { "User-Agent": "VortexChat-SocialAlerts/1.0 (+RSS Poller)" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { posted: 0 }

    const xml = await response.text()
    const entries = parseFeed(xml)
    const checkedAtIso = new Date().toISOString()
    if (entries.length === 0) {
      await supabase.from("social_alerts").update({ last_checked_at: checkedAtIso }).eq("id", alert.id)
      return { posted: 0 }
    }

    const latestEntryId = entries[0].id
    const lastCheckedAt = alert.last_checked_at ? new Date(alert.last_checked_at) : null
    const newEntries = entries
      .filter((entry) => (lastCheckedAt && entry.publishedAt ? entry.publishedAt > lastCheckedAt : entry.id !== alert.last_item_id))
      .slice(0, 3)

    let claim = supabase
      .from("social_alerts")
      .update({ last_item_id: latestEntryId, last_checked_at: checkedAtIso })
      .eq("id", alert.id)

    claim = alert.last_item_id ? claim.eq("last_item_id", alert.last_item_id) : claim.is("last_item_id", null)

    const { data: claimedRows, error: claimError } = await claim.select("id")
    if (claimError || !claimedRows || claimedRows.length === 0) return { posted: 0 }

    let posted = 0
    for (const entry of [...newEntries].reverse()) {
      const content = `**[RSS] ${alert.name}**\n[${entry.title}](${entry.link})`
      const { error } = await supabase.from("messages").insert({
        channel_id: alert.channel_id,
        author_id: SYSTEM_BOT_ID,
        content: content.slice(0, 2000),
      })
      if (!error) posted += 1
    }

    return { posted }
  } catch {
    return { posted: 0 }
  }
}

async function pollFeeds(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const { data: alerts, error } = await supabase
    .from("social_alerts")
    .select("id,server_id,channel_id,name,feed_url,last_item_id,last_checked_at")
    .eq("enabled", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!alerts || alerts.length === 0) return NextResponse.json({ ok: true, processed: 0, posted: 0 })

  const concurrency = 5
  let posted = 0
  let processed = 0

  for (let index = 0; index < alerts.length; index += concurrency) {
    const batch = alerts.slice(index, index + concurrency)
    const results = await Promise.allSettled(batch.map((alert) => processAlert(supabase, alert as AlertRow)))
    processed += batch.length
    for (const result of results) {
      if (result.status === "fulfilled") posted += result.value.posted
    }
  }

  return NextResponse.json({ ok: true, processed, posted })
}

// Vercel Cron invokes GET requests
export async function GET(req: NextRequest) {
  return pollFeeds(req)
}

// Keep POST for manual/external triggers
export async function POST(req: NextRequest) {
  return pollFeeds(req)
}
