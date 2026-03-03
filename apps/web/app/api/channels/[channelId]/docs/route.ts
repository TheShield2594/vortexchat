import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireWorkspaceAccess } from "@/lib/workspace-auth"

export async function GET(_: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: channel } = await supabase.from("channels").select("server_id").eq("id", channelId).single()
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  const access = await requireWorkspaceAccess(supabase, channel.server_id, user.id)
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("channel_docs")
    .select("id, title, content, channel_id, server_id, created_by, updated_by, created_at, updated_at")
    .eq("channel_id", channelId)
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: channel } = await supabase.from("channels").select("server_id").eq("id", channelId).single()
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  const access = await requireWorkspaceAccess(supabase, channel.server_id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const title = (body.title || "").trim()
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await supabase.from("channel_docs").insert({
    server_id: channel.server_id,
    channel_id: channelId,
    title,
    content: body.content || "",
    created_by: user.id,
    updated_by: user.id,
  }).select("id, title, content, channel_id, server_id, created_by, updated_by, created_at, updated_at").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ doc: data }, { status: 201 })
}
