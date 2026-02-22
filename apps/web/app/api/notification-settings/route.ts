import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/notification-settings?serverId=...&channelId=...
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const serverId = searchParams.get("serverId")
  const channelId = searchParams.get("channelId")

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

  const { serverId, channelId, mode } = await req.json()
  if (!["all", "mentions", "muted"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  }
  if (!serverId && !channelId) {
    return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })
  }

  const row: any = { user_id: user.id, mode, updated_at: new Date().toISOString() }
  if (serverId) row.server_id = serverId
  else row.channel_id = channelId

  const { error } = await supabase
    .from("notification_settings")
    .upsert(row, {
      onConflict: serverId ? "user_id,server_id" : "user_id,channel_id",
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

  let query = supabase
    .from("notification_settings")
    .delete()
    .eq("user_id", user.id)

  if (serverId) query = query.eq("server_id", serverId)
  else if (channelId) query = query.eq("channel_id", channelId)
  else return NextResponse.json({ error: "serverId or channelId required" }, { status: 400 })

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
