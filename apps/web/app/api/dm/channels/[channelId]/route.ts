import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/dm/channels/[channelId] — get channel info + messages
export async function GET(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership
  const { data: membership } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", params.channelId)
    .eq("user_id", user.id)
    .single()

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Fetch channel + members
  const { data: channel } = await supabase
    .from("dm_channels")
    .select(`
      id, name, icon_url, is_group, owner_id, updated_at,
      dm_channel_members(
        user_id,
        users(id, username, display_name, avatar_url, status, status_message)
      )
    `)
    .eq("id", params.channelId)
    .single()

  // Fetch messages with pagination
  const { searchParams } = new URL(req.url)
  const before = searchParams.get("before")
  const limit = 50

  let query = supabase
    .from("direct_messages")
    .select("*, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
    .eq("dm_channel_id", params.channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) query = query.lt("created_at", before)

  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark as read
  await supabase.rpc("mark_dm_read", { p_dm_channel_id: params.channelId })

  const members = channel?.dm_channel_members?.map((m: any) => m.users).filter(Boolean) ?? []
  const partner = channel && !channel.is_group
    ? members.find((u: any) => u.id !== user.id)
    : null

  return NextResponse.json({
    channel: { ...channel, members, partner },
    messages: (messages ?? []).reverse(),
    has_more: (messages?.length ?? 0) === limit,
  })
}
