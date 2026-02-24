import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type FeedEntry = {
  id: string
  title: string
  link: string
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

function getTagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? decodeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()) : ""
}

function parseFeed(xml: string): FeedEntry[] {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0])
  if (itemBlocks.length > 0) {
    return itemBlocks
      .map((item) => {
        const title = getTagValue(item, "title") || "Untitled"
        const link = getTagValue(item, "link")
        const guid = getTagValue(item, "guid")
        const id = guid || link || title
        return id && link ? { id, title, link } : null
      })
      .filter((entry): entry is FeedEntry => entry !== null)
  }

  const entryBlocks = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((m) => m[0])
  return entryBlocks
    .map((entry) => {
      const title = getTagValue(entry, "title") || "Untitled"
      const id = getTagValue(entry, "id") || title
      const linkAttr = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? ""
      return id && linkAttr ? { id, title, link: decodeXml(linkAttr) } : null
    })
    .filter((row): row is FeedEntry => row !== null)
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const { data: alerts, error } = await supabase
    .from("social_alerts")
    .select("id,server_id,channel_id,name,feed_url,last_item_id")
    .eq("enabled", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!alerts || alerts.length === 0) return NextResponse.json({ ok: true, processed: 0 })

  const serverIds = [...new Set(alerts.map((a) => a.server_id))]
  const { data: servers } = await supabase.from("servers").select("id,owner_id").in("id", serverIds)
  const ownerByServer = new Map((servers ?? []).map((s) => [s.id, s.owner_id]))

  let posted = 0
  let processed = 0

  for (const alert of alerts) {
    processed += 1

    try {
      const response = await fetch(alert.feed_url, {
        headers: { "User-Agent": "VortexChat-SocialAlerts/1.0 (+RSS Poller)" },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) continue

      const xml = await response.text()
      const entries = parseFeed(xml)
      if (entries.length === 0) {
        await supabase.from("social_alerts").update({ last_checked_at: new Date().toISOString() }).eq("id", alert.id)
        continue
      }

      const latestEntryId = entries[0].id
      const newEntries: FeedEntry[] = []
      for (const entry of entries) {
        if (alert.last_item_id && entry.id === alert.last_item_id) break
        newEntries.push(entry)
      }

      const ownerId = ownerByServer.get(alert.server_id)
      if (ownerId && newEntries.length > 0) {
        for (const entry of newEntries.reverse().slice(-3)) {
          const content = `**[RSS] ${alert.name}**\n[${entry.title}](${entry.link})`
          await supabase.from("messages").insert({
            channel_id: alert.channel_id,
            author_id: ownerId,
            content: content.slice(0, 2000),
          })
          posted += 1
        }
      }

      await supabase
        .from("social_alerts")
        .update({ last_item_id: latestEntryId, last_checked_at: new Date().toISOString() })
        .eq("id", alert.id)
    } catch {
      continue
    }
  }

  return NextResponse.json({ ok: true, processed, posted })
}
