import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/servers/[serverId]/webhooks
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("webhooks")
    .select("id, name, avatar_url, channel_id, token, created_at")
    .eq("server_id", serverId)
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Return the webhook URL alongside each record
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return NextResponse.json(
    (data ?? []).map((w) => ({ ...w, url: `${appUrl}/api/webhooks/${w.token}` }))
  )
}

// POST /api/servers/[serverId]/webhooks — create webhook
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { channelId, name } = await req.json()
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })

  const { data, error } = await supabase
    .from("webhooks")
    .insert({ server_id: serverId, channel_id: channelId, name: name ?? "Webhook", created_by: user.id })
    .select("id, name, token, channel_id, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return NextResponse.json({ ...data, url: `${appUrl}/api/webhooks/${data.token}` }, { status: 201 })
}

// DELETE /api/servers/[serverId]/webhooks?webhookId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const webhookId = req.nextUrl.searchParams.get("webhookId")
  if (!webhookId) return NextResponse.json({ error: "webhookId required" }, { status: 400 })

  const { error } = await supabase
    .from("webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("server_id", serverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
