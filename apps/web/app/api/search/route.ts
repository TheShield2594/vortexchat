import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/search?q=&serverId=&channelId=&authorId=&before=&after=&limit=&offset=
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  if (!q && !authorId) {
    return NextResponse.json({ error: "q or authorId required" }, { status: 400 })
  }

  if (!serverId && !channelId) {
    return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })
  }

  // Verify the user is a member of the server
  if (serverId) {
    const { data: member } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()

    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let queryBuilder = supabase
    .from("messages")
    .select(`
      *,
      author:users(*),
      attachments(*),
      reactions(*)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (channelId) {
    queryBuilder = queryBuilder.eq("channel_id", channelId)
  } else if (serverId) {
    // Get all channels in this server the user can see
    const { data: channels } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", serverId)
      .in("type", ["text"])
    const channelIds = channels?.map((c) => c.id) ?? []
    if (channelIds.length === 0) return NextResponse.json({ results: [], total: 0 })
    queryBuilder = queryBuilder.in("channel_id", channelIds)
  }

  if (q) {
    // Use Postgres FTS with websearch_to_tsquery for natural query syntax
    queryBuilder = queryBuilder.textSearch("search_vector", q, {
      type: "websearch",
      config: "english",
    })
  }

  if (authorId) {
    queryBuilder = queryBuilder.eq("author_id", authorId)
  }

  if (before) {
    queryBuilder = queryBuilder.lt("created_at", before)
  }

  if (after) {
    queryBuilder = queryBuilder.gt("created_at", after)
  }

  const { data: results, error, count } = await queryBuilder

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ results: results ?? [], total: count ?? results?.length ?? 0 })
}
