import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireWorkspaceAccess } from "@/lib/workspace-auth"

export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: message } = await supabase
    .from("messages")
    .select("id, content, channel_id, channels!inner(server_id)")
    .eq("id", messageId)
    .single()

  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 })
  const serverId = (message as any).channels.server_id as string
  const access = await requireWorkspaceAccess(supabase, serverId, user.id)
  if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const title = (body.title || message.content || "Follow up").trim().slice(0, 120)

  const { data: task, error } = await supabase.from("channel_tasks").insert({
    server_id: serverId,
    channel_id: message.channel_id,
    title,
    description: message.content,
    source_message_id: message.id,
    created_by: user.id,
    updated_by: user.id,
  }).select("*").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ task, reference: `[task:${task.id}]` }, { status: 201 })
}
