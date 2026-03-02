import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getChannelPermissions, hasPermission } from "@/lib/permissions"

interface SearchFilters {
  fromUserId?: string
  has?: "link" | "image" | "file"
  before?: string
  after?: string
}

function parseSearchQuery(raw: string): { query: string; filters: SearchFilters } {
  const filters: SearchFilters = {}
  let query = raw

  const fromMatch = query.match(/(?:^|\s)from:([^\s]+)/i)
  if (fromMatch?.[1]) {
    filters.fromUserId = fromMatch[1].trim()
    query = query.replace(fromMatch[0], " ")
  }

  const hasMatches = Array.from(query.matchAll(/(?:^|\s)has:(link|image|file)/ig))
  const lastHasMatch = hasMatches.at(-1)
  if (lastHasMatch?.[1]) {
    filters.has = lastHasMatch[1].toLowerCase() as SearchFilters["has"]
    query = query.replace(/(?:^|\s)has:(?:link|image|file)/ig, " ")
  }

  const beforeMatch = query.match(/(?:^|\s)before:([^\s]+)/i)
  if (beforeMatch?.[1]) {
    const candidate = new Date(beforeMatch[1].trim())
    if (!Number.isNaN(candidate.getTime())) {
      filters.before = candidate.toISOString()
    }
    query = query.replace(beforeMatch[0], " ")
  }

  const afterMatch = query.match(/(?:^|\s)after:([^\s]+)/i)
  if (afterMatch?.[1]) {
    const candidate = new Date(afterMatch[1].trim())
    if (!Number.isNaN(candidate.getTime())) {
      filters.after = candidate.toISOString()
    }
    query = query.replace(afterMatch[0], " ")
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

  let scopedChannels: Array<{ id: string; server_id: string | null }> = []
  if (channelId) {
    const { data: requestedChannel } = await supabase
      .from("channels")
      .select("id, server_id")
      .eq("id", channelId)
      .maybeSingle()

    if (!requestedChannel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })
    if (serverId && requestedChannel.server_id !== serverId) {
      return NextResponse.json({ error: "Channel does not belong to server" }, { status: 400 })
    }

    scopedChannels = [requestedChannel]
  } else {
    const { data: channels } = await supabase
      .from("channels")
      .select("id, server_id")
      .eq("server_id", serverId as string)
      .in("type", ["text", "announcement", "forum", "media"])
    scopedChannels = channels ?? []
  }

  const permissionCheckedChannels = await Promise.all(
    scopedChannels.map(async (channel) => {
      if (!channel.server_id) return null
      const { isAdmin, permissions } = await getChannelPermissions(supabase, channel.server_id, channel.id, user.id)
      if (!isAdmin && !hasPermission(permissions, "VIEW_CHANNELS")) return null
      return channel.id
    })
  )

  const channelIds = permissionCheckedChannels.filter((id): id is string => Boolean(id))

  if (channelIds.length === 0) return NextResponse.json({ results: [], total: 0 })

  let attachmentBackedImageMessageIds: string[] = []
  let attachmentBackedFileMessageIds: string[] = []

  if (filters.has === "image" || filters.has === "file") {
    const { data: candidateMessages } = await supabase
      .from("messages")
      .select("id")
      .in("channel_id", channelIds)
      .is("deleted_at", null)

    const candidateMessageIds = (candidateMessages ?? []).map((row) => row.id)

    const { data: attachmentRows } = candidateMessageIds.length === 0
      ? { data: [] as Array<{ message_id: string; content_type: string | null; filename: string }> }
      : await supabase
        .from("attachments")
        .select("message_id, content_type, filename")
        .in("message_id", candidateMessageIds)

    const rows = attachmentRows ?? []
    attachmentBackedImageMessageIds = Array.from(new Set(
      rows
        .filter((row) => row.content_type?.toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(row.filename ?? ""))
        .map((row) => row.message_id)
    ))
    attachmentBackedFileMessageIds = Array.from(new Set(rows.map((row) => row.message_id)))
  }

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
  if (filters.after) {
    messageQuery = messageQuery.gt("created_at", filters.after)
  }
  if (filters.has === "link") {
    messageQuery = messageQuery.ilike("content", "%http%")
  }
  if (filters.has === "image") {
    const contentImageFilter = "content.ilike.%http%.png%,content.ilike.%http%.jpg%,content.ilike.%http%.jpeg%,content.ilike.%http%.gif%,content.ilike.%http%.webp%"
    if (attachmentBackedImageMessageIds.length > 0) {
      messageQuery = messageQuery.or(`${contentImageFilter},id.in.(${attachmentBackedImageMessageIds.join(",")})`)
    } else {
      messageQuery = messageQuery.or(contentImageFilter)
    }
  }
  if (filters.has === "file") {
    if (attachmentBackedFileMessageIds.length > 0) {
      messageQuery = messageQuery.in("id", attachmentBackedFileMessageIds)
    } else {
      messageQuery = messageQuery.eq("id", "00000000-0000-0000-0000-000000000000")
    }
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
