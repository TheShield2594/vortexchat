import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/threads?channelId=xxx&archived=false
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get("channelId")
  const archived = searchParams.get("archived") === "true"

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })

  const { data: threads, error } = await supabase
    .from("threads")
    .select(`
      *,
      owner:users!threads_owner_id_fkey(*),
      starter_message:messages!threads_starter_message_id_fkey(
        *,
        author:users!messages_author_id_fkey(*),
        attachments(*),
        reactions(*)
      )
    `)
    .eq("parent_channel_id", channelId)
    .eq("archived", archived)
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(threads ?? [])
}

// POST /api/threads  { messageId, name }
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { messageId: string; name: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { messageId, name } = body
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const { data: thread, error } = await supabase.rpc("create_thread_from_message", {
    p_message_id: messageId,
    p_name: name.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(thread, { status: 201 })
}
