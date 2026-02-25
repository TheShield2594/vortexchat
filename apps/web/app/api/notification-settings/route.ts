import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { resolveNotification, type NotificationMode, type NotificationSetting } from "@/lib/notification-resolver"

// GET /api/notification-settings?serverId=...&channelId=...
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")
  const threadId = searchParams.get("threadId")

  if (threadId) {
    const { data: allSettings, error: allSettingsError } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)

    if (allSettingsError) {
      return NextResponse.json({ error: allSettingsError.message }, { status: 500 })
    }

    let derivedChannelId: string | null = channelId
    let derivedServerId: string | null = serverId

    if (!derivedChannelId) {
      const { data: thread } = await supabase
        .from("threads")
        .select("parent_channel_id, channels(server_id)")
        .eq("id", threadId)
        .maybeSingle()

      derivedChannelId = thread?.parent_channel_id ?? null
      derivedServerId = (thread?.channels as { server_id?: string | null } | null)?.server_id ?? null
    }

    const explicit = (allSettings ?? []).find((row) => row.thread_id === threadId) ?? null
    const resolved = resolveNotification(
      user.id,
      derivedServerId,
      derivedChannelId,
      threadId,
      "message",
      (allSettings ?? []) as NotificationSetting[]
    )

    return NextResponse.json({
      mode: (resolved.mode ?? "all") as NotificationMode,
      explicit_mode: explicit?.mode ?? null,
      inherited: !explicit,
      thread_id: threadId,
      channel_id: derivedChannelId,
      server_id: derivedServerId,
    })
  }

  if (!serverId && !channelId) {
    // Return all settings for this user
    const { data } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)
    return NextResponse.json(data ?? [])
  }

  let query = supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", user.id)

  if (serverId) query = query.eq("server_id", serverId)
  else if (channelId) query = query.eq("channel_id", channelId)

  const { data } = await query.maybeSingle()
  return NextResponse.json(data ?? { mode: "all" })
}

// PUT /api/notification-settings — upsert a setting
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { serverId, channelId, threadId, mode } = await req.json()
  if (!["all", "mentions", "muted"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  }
  if (!serverId && !channelId && !threadId) {
    return NextResponse.json({ error: "serverId, channelId, or threadId required" }, { status: 400 })
  }

  const row: any = { user_id: user.id, mode, updated_at: new Date().toISOString() }
  if (threadId) {
    row.thread_id = threadId
    if (channelId) row.channel_id = channelId
    if (serverId) row.server_id = serverId
  } else if (serverId) {
    row.server_id = serverId
  } else {
    row.channel_id = channelId
  }

  const { error } = await supabase
    .from("notification_settings")
    .upsert(row, {
      onConflict: threadId ? "user_id,thread_id" : (serverId ? "user_id,server_id" : "user_id,channel_id"),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/notification-settings — reset to default
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")
  const threadId = searchParams.get("threadId")

  let query = supabase
    .from("notification_settings")
    .delete()
    .eq("user_id", user.id)

  if (threadId) query = query.eq("thread_id", threadId)
  else if (serverId) query = query.eq("server_id", serverId)
  else if (channelId) query = query.eq("channel_id", channelId)
  else return NextResponse.json({ error: "serverId, channelId, or threadId required" }, { status: 400 })

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
