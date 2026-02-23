import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseMessageToTask } from "@/lib/workspace"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
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
  const perms = await getMemberPermissions(supabase, serverId, user.id)
  if (!perms.isOwner && !hasPermission(perms.permissions, "SEND_MESSAGES")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = parseMessageToTask(message.content ?? "")
  const { data: task, error } = await supabase
    .from("channel_tasks")
    .insert({
      channel_id: message.channel_id,
      server_id: serverId,
      message_id: message.id,
      title: parsed.title,
      description: parsed.description,
      due_at: parsed.dueAt,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const referenceUrl = `/channels/${serverId}/${message.channel_id}?task=${task.id}`
  await supabase.from("messages").insert({
    channel_id: message.channel_id,
    author_id: user.id,
    content: `Linked task: ${referenceUrl}`
  })

  return NextResponse.json({ task, referenceUrl })
}
