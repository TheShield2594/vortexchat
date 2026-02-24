import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// Unified search across messages + tasks + docs
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100)

  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 })
  if (!serverId && !channelId) return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })

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

  const [{ data: messages }, { data: tasks }, { data: docs }] = await Promise.all([
    supabase.from("messages").select("id, content, channel_id, created_at, author:users!messages_author_id_fkey(id, username, display_name, avatar_url)")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .textSearch("search_vector", q, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("channel_tasks").select("id, title, description, status, due_date, channel_id, created_at")
      .in("channel_id", channelIds)
      .textSearch("search_vector", q, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("channel_docs").select("id, title, content, channel_id, updated_at")
      .in("channel_id", channelIds)
      .textSearch("search_vector", q, { type: "websearch", config: "english" })
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
