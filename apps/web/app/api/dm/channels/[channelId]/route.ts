import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/dm/channels/[channelId] — get channel info + messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verify membership
    const { data: membership, error: membershipError } = await supabase
      .from("dm_channel_members")
      .select("user_id")
      .eq("dm_channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: "Failed to verify membership" }, { status: 500 })

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Fetch channel info and member user_ids in parallel
    const [channelResult, memberRowsResult] = await Promise.all([
      supabase
        .from("dm_channels")
        .select("id, name, icon_url, is_group, owner_id, updated_at, is_encrypted, encryption_key_version, encryption_membership_epoch")
        .eq("id", channelId)
        .maybeSingle(),
      supabase
        .from("dm_channel_members")
        .select("user_id")
        .eq("dm_channel_id", channelId),
    ])

    if (channelResult.error) return NextResponse.json({ error: "Failed to fetch DM channel" }, { status: 500 })
    if (!channelResult.data) return NextResponse.json({ error: "DM channel not found" }, { status: 404 })
    if (memberRowsResult.error) return NextResponse.json({ error: "Failed to fetch channel members" }, { status: 500 })

    const channel = channelResult.data
    const memberIds = memberRowsResult.data?.map((r) => r.user_id) ?? []

    // Fetch user profiles for members
    const { data: memberUsers, error: memberUsersError } = memberIds.length
      ? await supabase
          .from("users")
          .select("id, username, display_name, avatar_url, status, status_message")
          .in("id", memberIds)
      : { data: [], error: null }
    if (memberUsersError) return NextResponse.json({ error: "Failed to fetch member profiles" }, { status: 500 })

    const members = memberUsers ?? []
    const partner = channel && !channel.is_group
      ? (members.find((u) => u.id !== user.id) ?? null)
      : null

    // Fetch messages with pagination
    const { searchParams } = new URL(req.url)
    const before = searchParams.get("before")
    const limit = 50

    let query = (supabase as any)
      .from("direct_messages")
      .select("id, dm_channel_id, sender_id, content, edited_at, deleted_at, created_at, reply_to_id, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
      .eq("dm_channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (before) query = query.lt("created_at", before)

    const { data: messages, error } = await query

    if (error) return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })

    // Resolve replied-to messages
    const replyIds: string[] = (messages ?? [])
      .map((m: any) => m.reply_to_id as string | null)
      .filter((id: string | null): id is string => !!id)
    const uniqueReplyIds: string[] = [...new Set(replyIds)]

    let replyMap: Record<string, any> = {}
    if (uniqueReplyIds.length > 0) {
      const { data: replyMessages } = await supabase
        .from("direct_messages")
        .select("id, content, sender_id, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
        .in("id", uniqueReplyIds)
        .eq("dm_channel_id", channelId)
        .is("deleted_at", null)
      if (replyMessages) {
        replyMap = Object.fromEntries(replyMessages.map((m) => [m.id, m]))
      }
    }

    // Fetch dm_attachments for these messages so the client can render
    // images through the proxy endpoint instead of expired signed URLs.
    const messageIds: string[] = (messages ?? []).map((m: any) => m.id as string)
    let attachmentMap: Record<string, Array<{ id: string; filename: string; size: number; content_type: string }>> = {}
    if (messageIds.length > 0) {
      const { data: dmAttachments, error: attachmentError } = await (supabase as unknown as { from: (table: string) => any })
        .from("dm_attachments")
        .select("id, dm_id, filename, size, content_type")
        .in("dm_id", messageIds)
      if (attachmentError) {
        console.error("[dm/channels/[channelId] GET] failed to fetch dm_attachments:", attachmentError)
      }
      if (dmAttachments) {
        for (const att of dmAttachments as Array<{ id: string; dm_id: string; filename: string; size: number; content_type: string }>) {
          if (!attachmentMap[att.dm_id]) attachmentMap[att.dm_id] = []
          attachmentMap[att.dm_id].push({ id: att.id, filename: att.filename, size: att.size, content_type: att.content_type })
        }
      }
    }

    const enrichedMessages = (messages ?? []).map((m: any) => ({
      ...m,
      reply_to: m.reply_to_id ? (replyMap[m.reply_to_id] ?? null) : null,
      dm_attachments: attachmentMap[m.id] ?? [],
    }))

    // Mark as read
    await supabase.rpc("mark_dm_read", { p_dm_channel_id: channelId })

    return NextResponse.json({
      channel: { ...channel, members, partner },
      messages: enrichedMessages.reverse(),
      has_more: (messages?.length ?? 0) === limit,
    })

  } catch (err) {
    console.error("[dm/channels/[channelId] GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
