import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getChannelPermissions, hasPermission } from "@/lib/permissions"
import { sendPushToChannel } from "@/lib/push"
import { createLogger } from "@/lib/logger"

const log = createLogger("api/pin")

// PUT /api/messages/[messageId]/pin — pin a message
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
): Promise<NextResponse> {
  try {
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
    const serverId: string | undefined = (message as any).channels?.server_id

    if (!serverId) {
      return NextResponse.json({ error: "Cannot pin messages outside of a server channel" }, { status: 400 })
    }

    // Check permission: admin or MANAGE_MESSAGES
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelId: string | undefined = (message as any).channel_id

    if (!channelId) {
      return NextResponse.json({ error: "Channel context not found" }, { status: 404 })
    }

    const { isAdmin, permissions } = await getChannelPermissions(supabase, serverId, channelId, user.id)
    if (!isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
      return NextResponse.json({ error: "Missing MANAGE_MESSAGES permission" }, { status: 403 })
    }

    const { error } = await supabase
      .from("messages")
      .update({ pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id })
      .eq("id", messageId)

    if (error) return NextResponse.json({ error: "Failed to pin message" }, { status: 500 })

    // Audit log
    await supabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "message_pin",
      target_id: messageId,
      target_type: "message",
    })

    // Notify channel members about the pinned message
    const { data: pinner } = await supabase
      .from("users")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle()
    const pinnerName = pinner?.display_name || pinner?.username || "Someone"

    await sendPushToChannel({
      serverId,
      channelId,
      senderName: `📌 ${pinnerName}`,
      content: "pinned a message",
      excludeUserId: user.id,
    }).catch((err) => { log.error({ err }, "Failed to send pin push notification") })

    return NextResponse.json({ message: "Pinned" })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/messages/[messageId]/pin — unpin
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
): Promise<NextResponse> {
  try {
    const { messageId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: message } = await supabase
      .from("messages")
      .select("id, channel_id, channels(server_id)")
      .eq("id", messageId)
      .is("deleted_at", null)
      .single()

    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverId: string | undefined = (message as any).channels?.server_id

    if (!serverId) {
      return NextResponse.json({ error: "Cannot unpin messages outside of a server channel" }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelId: string | undefined = (message as any).channel_id

    if (!channelId) {
      return NextResponse.json({ error: "Channel context not found" }, { status: 404 })
    }

    const { isAdmin, permissions } = await getChannelPermissions(supabase, serverId, channelId, user.id)
    if (!isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
      return NextResponse.json({ error: "Missing MANAGE_MESSAGES permission" }, { status: 403 })
    }

    const { error } = await supabase
      .from("messages")
      .update({ pinned: false, pinned_at: null, pinned_by: null })
      .eq("id", messageId)

    if (error) return NextResponse.json({ error: "Failed to unpin message" }, { status: 500 })
    return NextResponse.json({ message: "Unpinned" })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
