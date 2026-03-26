import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

// New columns (event_type, external_url, banner_url) from migration 00060 are not yet
// reflected in the generated Supabase types. We use a typed interface and cast to any
// for the queries that reference those columns.
interface EventRow {
  id: string
  server_id: string
  title: string
  description: string | null
  location: string | null
  event_type: string | null
  external_url: string | null
  banner_url: string | null
  linked_channel_id: string | null
  voice_channel_id: string | null
  thread_id: string | null
  start_at: string
  end_at: string | null
  timezone: string
  recurrence: string
  recurrence_until: string | null
  capacity: number | null
  create_voice_channel: boolean
  post_event_thread: boolean
  created_by: string
  created_at: string
  updated_at: string
  event_hosts: Array<{ user_id: string }>
  event_rsvps: Array<{ user_id: string; status: string; users?: { id: string; display_name: string | null; avatar_url: string | null } }>
}

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  // Cast to any to select new columns that aren't in generated types yet
  let query = (supabase
    .from("events")
    .select(
      "id, server_id, title, description, location, event_type, external_url, banner_url, " +
      "linked_channel_id, voice_channel_id, thread_id, start_at, end_at, timezone, " +
      "recurrence, recurrence_until, capacity, create_voice_channel, post_event_thread, " +
      "created_by, created_at, updated_at, event_hosts(user_id), event_rsvps(user_id,status,users(id,display_name,avatar_url))"
    ) as any)
    .eq("server_id", params.serverId)
    .order("start_at", { ascending: true })

  if (from) query = query.gte("start_at", from)
  if (to) query = query.lte("start_at", to)

  const { data, error } = await query as { data: EventRow[] | null; error: any }
  if (error) return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 })

  const events = (data ?? []).map((event) => {
    const rsvps = event.event_rsvps ?? []
    return {
      ...event,
      stats: {
        going: rsvps.filter((r) => r.status === "going").length,
        maybe: rsvps.filter((r) => r.status === "maybe").length,
        notGoing: rsvps.filter((r) => r.status === "not_going").length,
        waitlist: rsvps.filter((r) => r.status === "waitlist").length,
        interested: rsvps.filter((r) => r.status === "interested").length,
      },
      myRsvp: rsvps.find((r) => r.user_id === user.id) ?? null,
      hosts: (event.event_hosts ?? []).map((h) => h.user_id),
      attendees: rsvps
        .filter((r: any) => r.status === "going" || r.status === "maybe" || r.status === "interested")
        .map((r: any) => ({
          user_id: r.user_id,
          status: r.status,
          display_name: r.users?.display_name ?? null,
          avatar_url: r.users?.avatar_url ?? null,
        })),
    }
  })

  return NextResponse.json(events)
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const perms = await getMemberPermissions(supabase, params.serverId, user.id)
  if (!perms.isAdmin && !hasPermission(perms.permissions, "MANAGE_EVENTS")) {
    return NextResponse.json({ error: "Missing MANAGE_EVENTS permission" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const title = String(body.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const validEventTypes = ["general", "voice", "external"]
  const eventType = validEventTypes.includes(body.eventType) ? body.eventType : "general"

  const hosts = Array.isArray(body.hosts) ? (body.hosts as string[]) : []

  // Cast insert payload to any to include new columns not in generated types yet
  const insertPayload: any = {
    server_id: params.serverId,
    title,
    description: body.description ?? null,
    location: body.location ?? null,
    event_type: eventType,
    external_url: eventType === "external" ? (body.externalUrl ?? null) : null,
    banner_url: body.bannerUrl ?? null,
    linked_channel_id: body.linkedChannelId ?? null,
    voice_channel_id: eventType === "voice" ? (body.voiceChannelId ?? null) : null,
    start_at: body.startAt,
    end_at: body.endAt,
    timezone: body.timezone ?? "UTC",
    recurrence: body.recurrence ?? "none",
    recurrence_until: body.recurrenceUntil ?? null,
    capacity: body.capacity ?? null,
    create_voice_channel: !!body.createVoiceChannel,
    post_event_thread: !!body.postEventThread,
    created_by: user.id,
  }

  const { data: created, error } = await (supabase
    .from("events")
    .insert(insertPayload)
    .select("*")
    .single() as any) as { data: any; error: any }

  if (error || !created) return NextResponse.json({ error: "Database operation failed" }, { status: 500 })

  if (hosts.length > 0) {
    await supabase.from("event_hosts").insert(
      hosts.map((hostUserId: string) => ({ event_id: created.id, user_id: hostUserId }))
    )
  }

  if (body.createVoiceChannel) {
    const { data: voiceChannel } = await supabase
      .from("channels")
      .insert({
        server_id: params.serverId,
        type: "voice",
        name: `${title} Voice`,
        parent_id: body.linkedCategoryId ?? null,
      })
      .select("id")
      .single()

    if (voiceChannel?.id) {
      await supabase.from("events").update({ voice_channel_id: voiceChannel.id }).eq("id", created.id)
    }
  }

  if (body.postEventThread && body.linkedChannelId) {
    const { data: message } = await supabase
      .from("messages")
      .insert({
        channel_id: body.linkedChannelId,
        author_id: user.id,
        content: `\uD83D\uDCC5 **${title}**\n${body.description ?? "Event created"}`,
      })
      .select("id")
      .single()

    if (message?.id) {
      const { data: thread } = await supabase.rpc("create_thread_from_message", {
        p_message_id: message.id,
        p_name: `${title} discussion`,
      })
      if (thread?.id) {
        await (supabase.from("events").update({ thread_id: thread.id }).eq("id", created.id) as any)
      }
    }
  }

  if (body.notifyMembers) {
    const { data: members } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", params.serverId)
    if (members?.length) {
      await service.from("notifications").insert(
        members.map((member: any) => ({
          user_id: member.user_id,
          type: "system" as const,
          title: `New event: ${title}`,
          body: "A new event has been scheduled.",
          server_id: params.serverId,
          channel_id: body.linkedChannelId ?? null,
        }))
      )
    }
  }

  return NextResponse.json(created, { status: 201 })
}
