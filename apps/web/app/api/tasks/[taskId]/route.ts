import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireWorkspaceAccess } from "@/lib/workspace-auth"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: existing } = await supabase.from("channel_tasks").select("id, server_id").eq("id", taskId).single()
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const access = await requireWorkspaceAccess(supabase, existing.server_id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const patch: Record<string, unknown> = { updated_by: user.id }
  if (typeof body.title === "string") patch.title = body.title.trim()
  if (typeof body.description === "string" || body.description === null) patch.description = body.description
  if (typeof body.status === "string") patch.status = body.status
  if (Object.hasOwn(body, "dueDate")) patch.due_date = body.dueDate
  if (Object.hasOwn(body, "assigneeId")) patch.assignee_id = body.assigneeId

  const { data, error } = await supabase.from("channel_tasks").update(patch).eq("id", taskId).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: existing } = await supabase.from("channel_tasks").select("id, server_id").eq("id", taskId).single()
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const access = await requireWorkspaceAccess(supabase, existing.server_id, user.id)
  if (!access.canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase.from("channel_tasks").delete().eq("id", taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
