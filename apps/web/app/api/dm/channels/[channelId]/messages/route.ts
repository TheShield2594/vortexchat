import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sendPushToChannel } from "@/lib/push"
import { isBlockedBetweenUsers } from "@/lib/blocking"

function isValidDmE2eeEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const envelope = value as Record<string, unknown>
  return envelope.kind === "dm-e2ee"
    && envelope.version === 1
    && envelope.algorithm === "AES-GCM"
    && typeof envelope.iv === "string"
    && envelope.iv.length > 0
    && typeof envelope.ciphertext === "string"
    && envelope.ciphertext.length > 0
    && typeof envelope.keyVersion === "number"
    && Number.isInteger(envelope.keyVersion)
    && envelope.keyVersion >= 0
}


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
    try {
      if (await isBlockedBetweenUsers(supabase as any, user.id, member.user_id)) {
        return NextResponse.json({ error: "Cannot send messages while blocked" }, { status: 403 })
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: "Error checking block status",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      )
    }
  }

  let body: { content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { data: channel, error: channelError } = await (supabase as any)
    .from("dm_channels")
    .select("is_encrypted, encryption_key_version")
    .eq("id", channelId)
    .maybeSingle()
  if (channelError || !channel) {
    return NextResponse.json({ error: "Unable to verify channel encryption" }, { status: 500 })
  }
  const channelInfo = channel as { is_encrypted: boolean; encryption_key_version: number }
  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 })

  if (channelInfo?.is_encrypted) {
    try {
      const parsed = JSON.parse(content)
      if (!isValidDmE2eeEnvelope(parsed)) {
        return NextResponse.json({ error: "Encrypted channels require encrypted payload" }, { status: 400 })
      }
      if (parsed.keyVersion !== channelInfo.encryption_key_version) {
        return NextResponse.json({ error: "Encrypted channels require current keyVersion" }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "Encrypted channels require encrypted payload" }, { status: 400 })
    }
  }

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
    content: channelInfo?.is_encrypted ? "Encrypted message" : content,
    excludeUserId: user.id,
  }).catch(() => {})

  return NextResponse.json(message, { status: 201 })
}
