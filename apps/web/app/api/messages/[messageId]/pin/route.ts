import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

// PUT /api/messages/[messageId]/pin — pin a message
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch the message to get channel + server context
  const { data: message } = await supabase
    .from("messages")
    .select("id, channel_id, channels(server_id)")
    .eq("id", messageId)
    .is("deleted_at", null)
    .single()

  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverId = (message as any).channels?.server_id

  // Check permission: admin or MANAGE_MESSAGES
  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
    return NextResponse.json({ error: "Missing MANAGE_MESSAGES permission" }, { status: 403 })
  }

  const { error } = await supabase
    .from("messages")
    .update({ pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id })
    .eq("id", messageId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  if (serverId) {
    await supabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "message_pin",
      target_id: messageId,
      target_type: "message",
    })
  }

  return NextResponse.json({ message: "Pinned" })
}

// DELETE /api/messages/[messageId]/pin — unpin
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: message } = await supabase
    .from("messages")
    .select("id, channels(server_id)")
    .eq("id", messageId)
    .single()

  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverId = (message as any).channels?.server_id

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
    return NextResponse.json({ error: "Missing MANAGE_MESSAGES permission" }, { status: 403 })
  }

  const { error } = await supabase
    .from("messages")
    .update({ pinned: false, pinned_at: null, pinned_by: null })
    .eq("id", messageId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: "Unpinned" })
}
