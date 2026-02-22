import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

interface Params {
  params: Promise<{ threadId: string }>
}

// GET /api/threads/[threadId]
export async function GET(_request: Request, { params: paramsPromise }: Params) {
  const { threadId } = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: thread, error } = await supabase
    .from("threads")
    .select(`
      *,
      owner:users!threads_owner_id_fkey(*),
      starter_message:messages!threads_starter_message_id_fkey(
        *,
        author:users!messages_author_id_fkey(*),
        attachments(*),
        reactions(*)
      ),
      members:thread_members(*)
    `)
    .eq("id", threadId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

  return NextResponse.json(thread)
}

// PATCH /api/threads/[threadId]  { archived?, locked?, name?, auto_archive_duration? }
export async function PATCH(request: Request, { params: paramsPromise }: Params) {
  const { threadId } = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    archived?: boolean
    locked?: boolean
    name?: string
    auto_archive_duration?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.archived === "boolean") {
    updates.archived = body.archived
    updates.archived_at = body.archived ? new Date().toISOString() : null
  }
  if (typeof body.locked === "boolean") updates.locked = body.locked
  if (body.name?.trim()) updates.name = body.name.trim()
  if (typeof body.auto_archive_duration === "number") {
    updates.auto_archive_duration = body.auto_archive_duration
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data: thread, error } = await supabase
    .from("threads")
    .update(updates)
    .eq("id", threadId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(thread)
}

// DELETE /api/threads/[threadId]
export async function DELETE(_request: Request, { params: paramsPromise }: Params) {
  const { threadId } = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await supabase.from("threads").delete().eq("id", threadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
