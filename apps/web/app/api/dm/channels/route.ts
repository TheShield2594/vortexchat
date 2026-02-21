import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/dm/channels — list all DM channels with unread counts
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Get all DM channels the user is a member of
  const { data: memberships, error } = await supabase
    .from("dm_channel_members")
    .select(`
      dm_channel_id,
      dm_channels(
        id, name, icon_url, is_group, owner_id, updated_at,
        dm_channel_members(
          user_id,
          users(id, username, display_name, avatar_url, status, status_message)
        )
      )
    `)
    .eq("user_id", user.id)
    .order("dm_channel_id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get latest message per channel and unread count
  const channelIds = memberships?.map((m: any) => m.dm_channel_id) ?? []

  let latestMessages: Record<string, any> = {}
  let readStates: Record<string, string> = {}

  if (channelIds.length > 0) {
    const { data: latest } = await supabase
      .from("direct_messages")
      .select("dm_channel_id, content, created_at, sender_id")
      .in("dm_channel_id", channelIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    // First result per channel is the latest
    for (const msg of latest ?? []) {
      if (!latestMessages[msg.dm_channel_id]) {
        latestMessages[msg.dm_channel_id] = msg
      }
    }

    const { data: reads } = await supabase
      .from("dm_read_states")
      .select("dm_channel_id, last_read_at")
      .eq("user_id", user.id)
      .in("dm_channel_id", channelIds)

    for (const r of reads ?? []) {
      readStates[r.dm_channel_id] = r.last_read_at
    }
  }

  const channels = (memberships ?? []).map((m: any) => {
    const ch = m.dm_channels
    const channelId = m.dm_channel_id
    const latest = latestMessages[channelId]
    const lastRead = readStates[channelId]
    const isUnread = latest && (!lastRead || latest.created_at > lastRead) && latest.sender_id !== user.id

    // For 1:1 DMs, find the partner
    const members = (ch.dm_channel_members ?? []).map((mem: any) => mem.users).filter(Boolean)
    const partner = ch.is_group ? null : members.find((u: any) => u.id !== user.id)

    return {
      id: channelId,
      name: ch.name,
      icon_url: ch.icon_url,
      is_group: ch.is_group,
      owner_id: ch.owner_id,
      updated_at: ch.updated_at,
      members,
      partner,
      latest_message: latest ?? null,
      is_unread: !!isUnread,
    }
  })

  // Sort by most recently active
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

  const allMembers = [...new Set([user.id, ...userIds])]
  const isGroup = allMembers.length > 2

  if (!isGroup) {
    // 1:1 DM: check if a channel already exists between these two users
    const partnerId = userIds[0]
    const { data: existing } = await supabase
      .from("dm_channel_members")
      .select("dm_channel_id, dm_channels!inner(is_group)")
      .eq("user_id", user.id)

    for (const row of existing ?? []) {
      if ((row as any).dm_channels?.is_group) continue
      // Check if partner is also a member
      const { data: partnerMem } = await supabase
        .from("dm_channel_members")
        .select("dm_channel_id")
        .eq("dm_channel_id", row.dm_channel_id)
        .eq("user_id", partnerId)
        .single()

      if (partnerMem) {
        // Existing 1:1 channel — return it
        return NextResponse.json({ id: row.dm_channel_id, existing: true })
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
