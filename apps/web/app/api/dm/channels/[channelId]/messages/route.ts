import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sendPushToChannel } from "@/lib/push"
import { isBlockedBetweenUsers } from "@/lib/blocking"

// POST /api/dm/channels/[channelId]/messages — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
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

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: channelMembers, error: channelMembersError } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", channelId)

  if (channelMembersError || !channelMembers) {
    return NextResponse.json({ error: channelMembersError?.message ?? "Failed to load DM members" }, { status: 500 })
  }

  for (const member of channelMembers) {
    if (member.user_id === user.id) continue
    if (await isBlockedBetweenUsers(supabase as any, user.id, member.user_id)) {
      return NextResponse.json({ error: "Cannot send messages while blocked" }, { status: 403 })
    }
  }

  let body: { content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 })

  const { data: message, error } = await supabase
    .from("direct_messages")
    .insert({
      dm_channel_id: channelId,
      sender_id: user.id,
      content,
    })
    .select("*, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send push notifications (fire-and-forget)
  const senderName = (message as any)?.sender?.display_name || (message as any)?.sender?.username || "Someone"
  sendPushToChannel({
    dmChannelId: channelId,
    senderName,
    content,
    excludeUserId: user.id,
  }).catch(() => {})

  return NextResponse.json(message, { status: 201 })
}
