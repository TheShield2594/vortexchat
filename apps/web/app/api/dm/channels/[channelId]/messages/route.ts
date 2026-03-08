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

  // Fetch all channel members (verifies membership and gets other member IDs in one query)
  const { data: channelMembers, error: channelMembersError } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", channelId)

  if (channelMembersError || !channelMembers) {
    return NextResponse.json({ error: channelMembersError?.message ?? "Failed to load DM members" }, { status: 500 })
  }

  if (!channelMembers.some((member) => member.user_id === user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const otherMemberIds = channelMembers
    .filter((member) => member.user_id !== user.id)
    .map((member) => member.user_id)

  // Run blocking checks, body parsing, and channel encryption fetch in parallel
  const [blockCheckResult, bodyResult, channelResult] = await Promise.all([
    Promise.all(
      otherMemberIds.map((memberId) => isBlockedBetweenUsers(supabase as any, user.id, memberId))
    ).then((results) => ({ blocked: results.some(Boolean), error: null as Error | null }))
     .catch((error: Error) => ({ blocked: false, error })),
    req.json().then((b: any) => ({ body: b as { content?: string; reply_to_id?: string }, error: null as string | null }))
      .catch(() => ({ body: null as any, error: "Invalid JSON body" })),
    (supabase as any)
      .from("dm_channels")
      .select("is_encrypted, encryption_key_version")
      .eq("id", channelId)
      .maybeSingle(),
  ])

  if (blockCheckResult.error) {
    return NextResponse.json(
      {
        error: "Error checking block status",
        details: blockCheckResult.error.message,
      },
      { status: 500 }
    )
  }
  if (blockCheckResult.blocked) {
    return NextResponse.json({ error: "Cannot send messages while blocked" }, { status: 403 })
  }

  if (bodyResult.error) {
    return NextResponse.json({ error: bodyResult.error }, { status: 400 })
  }
  const body = bodyResult.body

  const { data: channel, error: channelError } = channelResult
  if (channelError || !channel) {
    return NextResponse.json({ error: "Unable to verify channel encryption" }, { status: 500 })
  }
  const channelInfo = channel as { is_encrypted: boolean; encryption_key_version: number }
  if (typeof body.content !== "string") return NextResponse.json({ error: "Content required" }, { status: 400 })
  const content = body.content.trim()
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

  // Validate reply_to_id and fetch full reply data in one query (avoids redundant re-fetch after insert)
  const replyToId = body.reply_to_id ?? null
  let replyToMessage: any = null
  if (replyToId) {
    const { data: replyTarget, error: replyError } = await supabase
      .from("direct_messages")
      .select("id, dm_channel_id, content, sender_id, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
      .eq("id", replyToId)
      .is("deleted_at", null)
      .single()

    if (replyError || !replyTarget) {
      return NextResponse.json({ error: "Replied-to message not found" }, { status: 400 })
    }
    if (replyTarget.dm_channel_id !== channelId) {
      return NextResponse.json({ error: "Replied-to message must be in the same channel" }, { status: 400 })
    }
    replyToMessage = replyTarget
  }

  const { data: message, error } = await supabase
    .from("direct_messages")
    .insert({
      dm_channel_id: channelId,
      sender_id: user.id,
      content,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
    } as any)
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

  return NextResponse.json({ ...message, reply_to_id: replyToId, reply_to: replyToMessage }, { status: 201 })
}
