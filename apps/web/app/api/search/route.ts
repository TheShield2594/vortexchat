import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/search?q=&serverId=&channelId=&authorId=&before=&after=&limit=&offset=
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")
  const authorId = searchParams.get("authorId")
  const before = searchParams.get("before")
  const after = searchParams.get("after")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)

  if (!q && !authorId) return NextResponse.json({ error: "q or authorId required" }, { status: 400 })
  if (!serverId && !channelId) return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })

  if (serverId) {
    const { data: member } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let channelIds: string[] = []
  if (channelId) channelIds = [channelId]
  if (serverId && !channelId) {
    const { data: channels } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", serverId)
      .in("type", ["text", "announcement", "forum", "media"])
    channelIds = channels?.map((c) => c.id) ?? []
  }
  if (channelIds.length === 0) return NextResponse.json({ results: [], total: 0, tasks: [], docs: [] })

  let messageQuery = supabase
    .from("messages")
    .select("*,author:users(*),attachments(*),reactions(*)", { count: "exact" })
    .is("deleted_at", null)
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) {
    messageQuery = messageQuery.textSearch("search_vector", q, {
      type: "websearch",
      config: "english",
    })
  }
  if (authorId) messageQuery = messageQuery.eq("author_id", authorId)
  if (before) messageQuery = messageQuery.lt("created_at", before)
  if (after) messageQuery = messageQuery.gt("created_at", after)

  const [{ data: results, error, count }, { data: tasks }, { data: docs }] = await Promise.all([
    messageQuery,
    q
      ? supabase
          .from("channel_tasks")
          .select("id,channel_id,server_id,title,description,status,due_at,updated_at")
          .in("channel_id", channelIds)
          .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
          .order("updated_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as never[] }),
    q
      ? supabase
          .from("channel_docs")
          .select("id,channel_id,server_id,title,content,updated_at")
          .in("channel_id", channelIds)
          .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
          .order("updated_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as never[] }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    results: results ?? [],
    total: count ?? results?.length ?? 0,
    tasks: tasks ?? [],
    docs: docs ?? [],
  })
}
