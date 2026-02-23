import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

async function loadChannelContext(channelId: string, userId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: channel } = await supabase.from("channels").select("id,server_id,name").eq("id", channelId).single()
  if (!channel) return { supabase, error: NextResponse.json({ error: "Channel not found" }, { status: 404 }) }
  const memberPerms = await getMemberPermissions(supabase, channel.server_id, userId)
  if (!memberPerms.isOwner && !hasPermission(memberPerms.permissions, "VIEW_CHANNELS")) {
    return { supabase, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, channel, memberPerms }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await loadChannelContext(channelId, user.id)
  if ("error" in ctx) return ctx.error

  const { data, error } = await ctx.supabase
    .from("channel_tasks")
    .select("*, assignee:users!channel_tasks_assignee_id_fkey(id, username, display_name, avatar_url)")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await loadChannelContext(channelId, user.id)
  if ("error" in ctx) return ctx.error

  if (!ctx.memberPerms.isOwner && !hasPermission(ctx.memberPerms.permissions, "SEND_MESSAGES")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, assigneeId, dueAt, status, messageId } = body
  if (!title || typeof title !== "string") return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from("channel_tasks")
    .insert({
      channel_id: channelId,
      server_id: ctx.channel.server_id,
      title: title.trim(),
      description: description ?? null,
      assignee_id: assigneeId ?? null,
      due_at: dueAt ?? null,
      status: status ?? "todo",
      message_id: messageId ?? null,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const referenceUrl = `/channels/${ctx.channel.server_id}/${channelId}?task=${data.id}`
  await ctx.supabase.from("messages").insert({ channel_id: channelId, author_id: user.id, content: `Linked task: ${referenceUrl}` })
  return NextResponse.json({ task: data, referenceUrl })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const taskId = new URL(req.url).searchParams.get("taskId")
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 })

  const ctx = await loadChannelContext(channelId, user.id)
  if ("error" in ctx) return ctx.error

  const { data: existing } = await ctx.supabase.from("channel_tasks").select("*").eq("id", taskId).eq("channel_id", channelId).single()
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const canManage = ctx.memberPerms.isOwner || hasPermission(ctx.memberPerms.permissions, "MANAGE_CHANNELS") || existing.created_by === user.id
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const payload = await req.json()
  const update: Record<string, unknown> = {}
  if (payload.title !== undefined) update.title = payload.title
  if (payload.description !== undefined) update.description = payload.description
  if (payload.assigneeId !== undefined) update.assignee_id = payload.assigneeId
  if (payload.status !== undefined) update.status = payload.status
  if (payload.dueAt !== undefined) update.due_at = payload.dueAt

  const { data: updated, error } = await ctx.supabase.from("channel_tasks").update(update).eq("id", taskId).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing.assignee_id && existing.assignee_id !== user.id && (payload.status !== undefined || payload.dueAt !== undefined)) {
    await ctx.supabase.from("notifications").insert({
      user_id: existing.assignee_id,
      type: "system",
      title: `Task updated: ${updated.title}`,
      body: `Status: ${updated.status}`,
      server_id: ctx.channel.server_id,
      channel_id: channelId,
    })
  }

  return NextResponse.json({ task: updated })
}
