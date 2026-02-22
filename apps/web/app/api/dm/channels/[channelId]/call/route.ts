import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// POST /api/dm/channels/[channelId]/call — broadcast a WebRTC signaling event
// Body: { type: "offer"|"answer"|"ice-candidate"|"hangup", payload: any, targetUserId?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership
  const { data: membership } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", channelId)
    .eq("user_id", user.id)
    .single()

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { type, payload, targetUserId } = body

  // Use Supabase Realtime Broadcast for WebRTC signaling
  const channel = supabase.channel(`dm-call:${channelId}`)
  await channel.send({
    type: "broadcast",
    event: "call-signal",
    payload: {
      type,
      payload,
      fromUserId: user.id,
      targetUserId,
      channelId: channelId,
    },
  })

  return NextResponse.json({ ok: true })
}
