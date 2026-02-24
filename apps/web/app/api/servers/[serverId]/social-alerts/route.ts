import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_WEBHOOKS")) {
    return NextResponse.json({ error: "Missing MANAGE_WEBHOOKS permission" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("social_alerts")
    .select("id,name,feed_url,channel_id,enabled,last_item_id,last_checked_at,created_at")
    .eq("server_id", serverId)
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_WEBHOOKS")) {
    return NextResponse.json({ error: "Missing MANAGE_WEBHOOKS permission" }, { status: 403 })
  }

  let channelId: string | undefined
  let feedUrl: string | undefined
  let name: string | undefined
  try {
    const body = await req.json()
    channelId = body.channelId
    feedUrl = body.feedUrl
    name = body.name
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })
  if (!feedUrl) return NextResponse.json({ error: "feedUrl required" }, { status: 400 })

  try {
    new URL(feedUrl)
  } catch {
    return NextResponse.json({ error: "feedUrl must be a valid URL" }, { status: 400 })
  }

  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("server_id", serverId)
    .single()

  if (channelError || !channel) return NextResponse.json({ error: "Invalid channel for this server" }, { status: 400 })

  const { data, error } = await supabase
    .from("social_alerts")
    .insert({
      server_id: serverId,
      channel_id: channelId,
      feed_url: feedUrl,
      name: name?.trim() || "RSS Feed",
      created_by: user.id,
    })
    .select("id,name,feed_url,channel_id,enabled,last_item_id,last_checked_at,created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_WEBHOOKS")) {
    return NextResponse.json({ error: "Missing MANAGE_WEBHOOKS permission" }, { status: 403 })
  }

  const alertId = req.nextUrl.searchParams.get("alertId")
  if (!alertId) return NextResponse.json({ error: "alertId required" }, { status: 400 })

  const { error } = await supabase
    .from("social_alerts")
    .delete()
    .eq("id", alertId)
    .eq("server_id", serverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_WEBHOOKS")) {
    return NextResponse.json({ error: "Missing MANAGE_WEBHOOKS permission" }, { status: 403 })
  }

  let alertId: string | undefined
  let enabled: boolean | undefined
  try {
    const body = await req.json()
    alertId = body.alertId
    enabled = body.enabled
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  if (!alertId) return NextResponse.json({ error: "alertId required" }, { status: 400 })
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 })

  const { data, error } = await supabase
    .from("social_alerts")
    .update({ enabled })
    .eq("id", alertId)
    .eq("server_id", serverId)
    .select("id,name,feed_url,channel_id,enabled,last_item_id,last_checked_at,created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
