import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/** GET /api/threads?channelId=xxx&archived=false — Lists threads for a channel, ordered by most recently updated. */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get("channelId")
  const archived = searchParams.get("archived") === "true"

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })

  const { data: threads, error } = await supabase
    .from("threads")
    .select("*")
    .eq("parent_channel_id", channelId)
    .eq("archived", archived)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[threads] GET query failed", { channelId, code: error.code, message: error.message, details: error.details })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const threadList = threads ?? []

  // Attach is_unread by joining thread_read_states for the current user
  if (threadList.length > 0) {
    const { data: readStates } = await supabase
      .from("thread_read_states")
      .select("thread_id, last_read_at")
      .eq("user_id", user.id)
      .in("thread_id", threadList.map((t) => t.id))

    const readMap = new Map((readStates ?? []).map((rs) => [rs.thread_id, rs.last_read_at]))

    const withUnread = threadList.map((t) => {
      const lastRead = readMap.get(t.id)
      return { ...t, is_unread: lastRead ? t.updated_at > lastRead : true }
    })

    return NextResponse.json(withUnread, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
    })
  }

  return NextResponse.json(threadList, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
  })
}

/** POST /api/threads — Creates a new thread, either from an existing message or directly from a channel. */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { messageId?: string; channelId?: string; name: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { messageId, channelId, name } = body
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  if (messageId) {
    // Create thread from an existing message
    const { data: thread, error } = await supabase.rpc("create_thread_from_message", {
      p_message_id: messageId,
      p_name: name.trim(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(thread, { status: 201 })
  }

  if (channelId) {
    // Create standalone thread in a channel (no starter message)
    const { data: thread, error } = await supabase
      .from("threads")
      .insert({ parent_channel_id: channelId, owner_id: user.id, name: name.trim() })
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(thread, { status: 201 })
  }

  return NextResponse.json({ error: "messageId or channelId required" }, { status: 400 })
}
