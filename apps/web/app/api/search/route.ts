import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

interface SearchFilters {
  fromUserId?: string
  has?: "link" | "image" | "file"
  before?: string
}

function parseSearchQuery(raw: string): { query: string; filters: SearchFilters } {
  const filters: SearchFilters = {}
  let query = raw

  const fromMatch = query.match(/(?:^|\s)from:([^\s]+)/i)
  if (fromMatch?.[1]) {
    filters.fromUserId = fromMatch[1].trim()
    query = query.replace(fromMatch[0], " ")
  }

  const hasMatch = query.match(/(?:^|\s)has:(link|image|file)/i)
  if (hasMatch?.[1]) {
    filters.has = hasMatch[1].toLowerCase() as SearchFilters["has"]
    query = query.replace(hasMatch[0], " ")
  }

  const beforeMatch = query.match(/(?:^|\s)before:([^\s]+)/i)
  if (beforeMatch?.[1]) {
    const candidate = new Date(beforeMatch[1].trim())
    if (!Number.isNaN(candidate.getTime())) {
      filters.before = candidate.toISOString()
    }
    query = query.replace(beforeMatch[0], " ")
  }

  return { query: query.replace(/\s+/g, " ").trim(), filters }
}

// Unified search across messages + tasks + docs
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawQuery = searchParams.get("q")?.trim() ?? ""
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100)

  if (!rawQuery) return NextResponse.json({ error: "q required" }, { status: 400 })
  if (!serverId && !channelId) return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })

  const { query, filters } = parseSearchQuery(rawQuery)

  if (serverId) {
    const { data: member } = await supabase.from("server_members").select("user_id").eq("server_id", serverId as string).eq("user_id", user.id).single()
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let channelIds: string[] = []
  if (channelId) channelIds = [channelId]
  else {
    const { data: channels } = await supabase.from("channels").select("id").eq("server_id", serverId as string).in("type", ["text", "announcement", "forum", "media"])
    channelIds = (channels ?? []).map((c) => c.id)
  }

  if (channelIds.length === 0) return NextResponse.json({ results: [], total: 0 })

  let messageQuery = supabase.from("messages").select("id, content, channel_id, created_at, author_id, author:users!messages_author_id_fkey(id, username, display_name, avatar_url)")
    .in("channel_id", channelIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (query) {
    messageQuery = messageQuery.textSearch("search_vector", query, { type: "websearch", config: "english" })
  }
  if (filters.fromUserId) {
    messageQuery = messageQuery.eq("author_id", filters.fromUserId)
  }
  if (filters.before) {
    messageQuery = messageQuery.lt("created_at", filters.before)
  }
  if (filters.has === "link") {
    messageQuery = messageQuery.ilike("content", "%http%")
  }
  if (filters.has === "image") {
    messageQuery = messageQuery.or("content.ilike.%http%.png%,content.ilike.%http%.jpg%,content.ilike.%http%.jpeg%,content.ilike.%http%.gif%,content.ilike.%http%.webp%")
  }
  if (filters.has === "file") {
    messageQuery = messageQuery.ilike("content", "[%](http%")
  }

  const [{ data: messages }, { data: tasks }, { data: docs }] = await Promise.all([
    messageQuery,
    supabase.from("channel_tasks").select("id, title, description, status, due_date, channel_id, created_at")
      .in("channel_id", channelIds)
      .textSearch("search_vector", query || rawQuery, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("channel_docs").select("id, title, content, channel_id, updated_at")
      .in("channel_id", channelIds)
      .textSearch("search_vector", query || rawQuery, { type: "websearch", config: "english" })
      .order("updated_at", { ascending: false })
      .limit(limit),
  ])

  const results = [
    ...(messages ?? []).map((m) => ({ type: "message", ...m })),
    ...(tasks ?? []).map((t) => ({ type: "task", ...t })),
    ...(docs ?? []).map((d) => ({ type: "doc", ...d })),
  ]

  return NextResponse.json({ results, total: results.length })
}
