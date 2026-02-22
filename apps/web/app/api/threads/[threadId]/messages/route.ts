import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { rateLimiter } from "@/lib/rate-limit"

interface Params {
  params: Promise<{ threadId: string }>
}

// GET /api/threads/[threadId]/messages?before=<timestamp>&limit=50
export async function GET(request: Request, { params: paramsPromise }: Params) {
  const { threadId } = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const before = searchParams.get("before")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)

  let query = supabase
    .from("messages")
    .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt("created_at", before)
  }

  const { data: messages, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark thread as read for this user
  try { await supabase.rpc("mark_thread_read", { p_thread_id: threadId }) } catch {}

  return NextResponse.json((messages ?? []).reverse())
}

// POST /api/threads/[threadId]/messages  { content, replyToId?, attachments? }
export async function POST(request: Request, { params: paramsPromise }: Params) {
  const { threadId } = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimiter.check(`thread_msg:${user.id}`, { limit: 5, windowMs: 10_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You are sending messages too fast. Slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  let body: {
    content?: string
    replyToId?: string
    attachments?: Array<{
      url: string
      filename: string
      size: number
      content_type: string
      width?: number
      height?: number
    }>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { content, replyToId, attachments = [] } = body
  if (!content?.trim() && attachments.length === 0) {
    return NextResponse.json({ error: "Message must have content or attachments" }, { status: 400 })
  }

  // Fetch thread to get the channel_id and check locked/archived
  const { data: thread } = await supabase
    .from("threads")
    .select("id, parent_channel_id, locked, archived")
    .eq("id", threadId)
    .single()

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })
  if (thread.locked) return NextResponse.json({ error: "Thread is locked" }, { status: 403 })
  if (thread.archived) return NextResponse.json({ error: "Thread is archived" }, { status: 403 })

  // Insert message linked to thread (channel_id = parent_channel_id for permissions)
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({
      channel_id: thread.parent_channel_id,
      thread_id: threadId,
      author_id: user.id,
      content: content?.trim() || null,
      reply_to_id: replyToId || null,
    })
    .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
    .single()

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

  // Insert attachments
  if (attachments.length > 0 && message) {
    await supabase.from("attachments").insert(
      attachments.map((a) => ({ ...a, message_id: message.id }))
    )
  }

  // Auto-join the author as thread member if not already a member (ignore duplicate key)
  try {
    await supabase.from("thread_members").insert({ thread_id: threadId, user_id: user.id })
  } catch {}

  return NextResponse.json(message, { status: 201 })
}
