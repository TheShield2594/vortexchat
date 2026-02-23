import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

async function getContext(channelId: string, userId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: channel } = await supabase.from("channels").select("id,server_id").eq("id", channelId).single()
  if (!channel) return { supabase, error: NextResponse.json({ error: "Channel not found" }, { status: 404 }) }
  const perms = await getMemberPermissions(supabase, channel.server_id, userId)
  if (!perms.isOwner && !hasPermission(perms.permissions, "VIEW_CHANNELS")) {
    return { supabase, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, channel, perms }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getContext(channelId, user.id)
  if ("error" in ctx) return ctx.error

  const { data, error } = await ctx.supabase
    .from("channel_docs")
    .select("*")
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

  const ctx = await getContext(channelId, user.id)
  if ("error" in ctx) return ctx.error
  if (!ctx.perms.isOwner && !hasPermission(ctx.perms.permissions, "SEND_MESSAGES")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from("channel_docs")
    .insert({
      channel_id: channelId,
      server_id: ctx.channel.server_id,
      title: body.title,
      content: body.content ?? "",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const referenceUrl = `/channels/${ctx.channel.server_id}/${channelId}?doc=${data.id}`
  await ctx.supabase.from("messages").insert({ channel_id: channelId, author_id: user.id, content: `Linked doc: ${referenceUrl}` })
  return NextResponse.json({ doc: data, referenceUrl })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const docId = new URL(req.url).searchParams.get("docId")
  if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 })

  const ctx = await getContext(channelId, user.id)
  if ("error" in ctx) return ctx.error

  const { data: existing } = await ctx.supabase.from("channel_docs").select("*").eq("id", docId).eq("channel_id", channelId).single()
  if (!existing) return NextResponse.json({ error: "Doc not found" }, { status: 404 })

  const canManage = ctx.perms.isOwner || hasPermission(ctx.perms.permissions, "MANAGE_CHANNELS") || existing.created_by === user.id
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { data, error } = await ctx.supabase
    .from("channel_docs")
    .update({ title: body.title ?? existing.title, content: body.content ?? existing.content, updated_by: user.id })
    .eq("id", docId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (existing.created_by && existing.created_by !== user.id) {
    await ctx.supabase.from("notifications").insert({
      user_id: existing.created_by,
      type: "system",
      title: `Doc updated: ${data.title}`,
      body: "A channel note was updated.",
      server_id: ctx.channel.server_id,
      channel_id: channelId,
    })
  }
  return NextResponse.json({ doc: data })
}
