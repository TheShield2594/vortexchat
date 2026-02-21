import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const MANAGE_MESSAGES = 2048

// PUT /api/messages/[messageId]/pin — pin a message
export async function PUT(
  _req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch the message to get channel + server context
  const { data: message } = await supabase
    .from("messages")
    .select("id, channel_id, channels(server_id)")
    .eq("id", params.messageId)
    .is("deleted_at", null)
    .single()

  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  const serverId = (message as any).channels?.server_id

  // Check permission: owner, or MANAGE_MESSAGES permission
  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  const isOwner = server?.owner_id === user.id

  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = (member as any)?.member_roles
      ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
      .reduce((acc: number, p: number) => acc | p, 0) ?? 0

    if ((permissions & MANAGE_MESSAGES) === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("messages")
    .update({ pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id })
    .eq("id", params.messageId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  if (serverId) {
    await supabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "message_pin",
      target_id: params.messageId,
      target_type: "message",
    })
  }

  return NextResponse.json({ message: "Pinned" })
}

// DELETE /api/messages/[messageId]/pin — unpin
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: message } = await supabase
    .from("messages")
    .select("id, channels(server_id)")
    .eq("id", params.messageId)
    .single()

  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const serverId = (message as any).channels?.server_id
  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  const isOwner = server?.owner_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = (member as any)?.member_roles
      ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
      .reduce((acc: number, p: number) => acc | p, 0) ?? 0

    if ((permissions & MANAGE_MESSAGES) === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("messages")
    .update({ pinned: false, pinned_at: null, pinned_by: null })
    .eq("id", params.messageId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: "Unpinned" })
}
