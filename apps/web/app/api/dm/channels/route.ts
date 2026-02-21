import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/dm/channels — list all DM channels with unread counts
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 1. Get all channel IDs the user belongs to
  const { data: memberships, error } = await supabase
    .from("dm_channel_members")
    .select("dm_channel_id")
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const channelIds = memberships?.map((m) => m.dm_channel_id) ?? []
  if (!channelIds.length) return NextResponse.json([])

  // 2. Fetch channel metadata
  const { data: channelRows } = await supabase
    .from("dm_channels")
    .select("id, name, icon_url, is_group, owner_id, updated_at")
    .in("id", channelIds)

  // 3. Fetch all members across these channels
  const { data: allMemberRows } = await supabase
    .from("dm_channel_members")
    .select("dm_channel_id, user_id")
    .in("dm_channel_id", channelIds)

  // 4. Fetch user profiles for all unique member IDs
  const allUserIds = [...new Set((allMemberRows ?? []).map((m) => m.user_id))]
  const { data: userRows } = allUserIds.length
    ? await supabase
        .from("users")
        .select("id, username, display_name, avatar_url, status, status_message")
        .in("id", allUserIds)
    : { data: [] }

  const userMap = Object.fromEntries((userRows ?? []).map((u) => [u.id, u]))

  // Build members-per-channel map
  const membersByChannel: Record<string, typeof userRows> = {}
  for (const row of allMemberRows ?? []) {
    if (!membersByChannel[row.dm_channel_id]) membersByChannel[row.dm_channel_id] = []
    const u = userMap[row.user_id]
    if (u) membersByChannel[row.dm_channel_id]!.push(u)
  }

  // 5. Get latest message per channel
  const { data: latest } = await supabase
    .from("direct_messages")
    .select("dm_channel_id, content, created_at, sender_id")
    .in("dm_channel_id", channelIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const latestMessages: Record<string, any> = {}
  for (const msg of latest ?? []) {
    if (msg.dm_channel_id && !latestMessages[msg.dm_channel_id]) {
      latestMessages[msg.dm_channel_id] = msg
    }
  }

  // 6. Get read states
  const { data: reads } = await supabase
    .from("dm_read_states")
    .select("dm_channel_id, last_read_at")
    .eq("user_id", user.id)
    .in("dm_channel_id", channelIds)

  const readStates: Record<string, string> = {}
  for (const r of reads ?? []) {
    readStates[r.dm_channel_id] = r.last_read_at
  }

  // 7. Assemble result
  const channels = (channelRows ?? []).map((ch) => {
    const members = membersByChannel[ch.id] ?? []
    const partner = ch.is_group ? null : (members.find((u) => u.id !== user.id) ?? null)
    const latest = latestMessages[ch.id] ?? null
    const lastRead = readStates[ch.id]
    const isUnread = !!(latest && (!lastRead || latest.created_at > lastRead) && latest.sender_id !== user.id)

    return {
      id: ch.id,
      name: ch.name,
      icon_url: ch.icon_url,
      is_group: ch.is_group,
      owner_id: ch.owner_id,
      updated_at: ch.updated_at,
      members,
      partner,
      latest_message: latest,
      is_unread: isUnread,
    }
  })

  channels.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  return NextResponse.json(channels)
}

// POST /api/dm/channels — open/create a DM channel
// Body: { userIds: string[], name?: string } (userIds = partner(s), name for group)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userIds, name } = await req.json()
  if (!userIds?.length) return NextResponse.json({ error: "userIds required" }, { status: 400 })

  const allMembers = [...new Set([user.id, ...userIds])] as string[]
  const isGroup = allMembers.length > 2

  if (!isGroup) {
    const partnerId = userIds[0] as string

    // Find existing 1:1 channel between current user and partner
    const { data: userMems } = await supabase
      .from("dm_channel_members")
      .select("dm_channel_id")
      .eq("user_id", user.id)

    const userChannelIds = (userMems ?? []).map((m) => m.dm_channel_id)

    if (userChannelIds.length > 0) {
      // Get non-group channels from those IDs
      const { data: nonGroupChannels } = await supabase
        .from("dm_channels")
        .select("id")
        .in("id", userChannelIds)
        .eq("is_group", false)

      for (const ch of nonGroupChannels ?? []) {
        // Check if partner is also a member of this channel
        const { data: partnerMem } = await supabase
          .from("dm_channel_members")
          .select("dm_channel_id")
          .eq("dm_channel_id", ch.id)
          .eq("user_id", partnerId)
          .single()

        if (partnerMem) {
          return NextResponse.json({ id: ch.id, existing: true })
        }
      }
    }
  }

  // Create new channel
  const { data: channel, error: chanErr } = await supabase
    .from("dm_channels")
    .insert({ name: name ?? null, is_group: isGroup, owner_id: user.id })
    .select()
    .single()

  if (chanErr) return NextResponse.json({ error: chanErr.message }, { status: 500 })

  // Add all members
  const memberRows = allMembers.map((uid) => ({
    dm_channel_id: channel.id,
    user_id: uid,
    added_by: user.id,
  }))

  const { error: memErr } = await supabase
    .from("dm_channel_members")
    .insert(memberRows)

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  return NextResponse.json({ id: channel.id, existing: false }, { status: 201 })
}
