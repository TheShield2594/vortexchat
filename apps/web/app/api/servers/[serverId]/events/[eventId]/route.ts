import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

type RouteContext = { params: Promise<{ serverId: string; eventId: string }> }

/**
 * Check if the user can manage this specific event.
 * Allowed when the user is an admin, has MANAGE_EVENTS, or is the event creator.
 */
async function canManageEvent(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  serverId: string,
  eventId: string,
  userId: string
): Promise<{ allowed: boolean; event: any | null; isCreator: boolean }> {
  const perms = await getMemberPermissions(supabase, serverId, userId)

  // Admins and users with MANAGE_EVENTS can always manage
  if (perms.isAdmin || hasPermission(perms.permissions, "MANAGE_EVENTS")) {
    const { data: event } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("server_id", serverId)
      .single()
    return { allowed: !!event, event, isCreator: event?.created_by === userId }
  }

  // Otherwise, check if the user is the event creator
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("server_id", serverId)
    .single()

  if (!event) return { allowed: false, event: null, isCreator: false }

  const isCreator = event.created_by === userId
  return { allowed: isCreator, event, isCreator }
}

export async function PATCH(
  request: Request,
  { params: paramsPromise }: RouteContext
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, event: existing } = await canManageEvent(supabase, params.serverId, params.eventId, user.id)
  if (!allowed) {
    return NextResponse.json({ error: "You don't have permission to edit this event" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updatePayload: Record<string, any> = {}
  if (body.title !== undefined) updatePayload.title = body.title
  if (body.description !== undefined) updatePayload.description = body.description
  if (body.linkedChannelId !== undefined) updatePayload.linked_channel_id = body.linkedChannelId
  if (body.startAt !== undefined) updatePayload.start_at = body.startAt
  if (body.endAt !== undefined) updatePayload.end_at = body.endAt
  if (body.timezone !== undefined) updatePayload.timezone = body.timezone
  if (body.recurrence !== undefined) updatePayload.recurrence = body.recurrence
  if (body.recurrenceUntil !== undefined) updatePayload.recurrence_until = body.recurrenceUntil
  if (body.capacity !== undefined) updatePayload.capacity = body.capacity
  if (body.cancelled !== undefined) updatePayload.cancelled_at = body.cancelled ? new Date().toISOString() : null

  // Use service client to bypass RLS (creator may not have MANAGE_EVENTS role permission)
  const { data: updated, error } = await service
    .from("events")
    .update(updatePayload)
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .select("id,title,linked_channel_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  const before: Record<string, any> = {}
  const after: Record<string, any> = {}
  for (const key of Object.keys(updatePayload)) {
    before[key] = existing?.[key]
    after[key] = updatePayload[key]
  }
  await service.from("audit_logs").insert({
    server_id: params.serverId,
    actor_id: user.id,
    action: body.cancelled ? "event_cancelled" : "event_updated",
    target_id: params.eventId,
    target_type: "event",
    changes: { before, after },
  })

  // Notify attendees
  const { data: attendees } = await supabase
    .from("event_rsvps")
    .select("user_id")
    .eq("event_id", params.eventId)
    .in("status", ["going", "maybe", "waitlist"])

  if (attendees?.length) {
    await service.from("notifications").insert(
      attendees.map((attendee: any) => ({
        user_id: attendee.user_id,
        type: "system" as const,
        title: body.cancelled ? `Event cancelled: ${updated.title}` : `Event updated: ${updated.title}`,
        body: body.cancelled ? "An event you RSVP'd for has been cancelled." : "An event you RSVP'd for was updated.",
        server_id: params.serverId,
        channel_id: updated.linked_channel_id,
      }))
    )
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  { params: paramsPromise }: RouteContext
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, event } = await canManageEvent(supabase, params.serverId, params.eventId, user.id)
  if (!allowed || !event) {
    return NextResponse.json({ error: "You don't have permission to delete this event" }, { status: 403 })
  }

  // Notify attendees before deletion
  const { data: attendees } = await supabase
    .from("event_rsvps")
    .select("user_id")
    .eq("event_id", params.eventId)
    .in("status", ["going", "maybe", "waitlist"])

  // Delete the event (cascades to hosts, rsvps, reminders via FK)
  const { error } = await service
    .from("events")
    .delete()
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await service.from("audit_logs").insert({
    server_id: params.serverId,
    actor_id: user.id,
    action: "event_deleted",
    target_id: params.eventId,
    target_type: "event",
    changes: {
      before: { title: event.title, start_at: event.start_at, created_by: event.created_by },
      after: null,
    },
  })

  // Notify attendees
  if (attendees?.length) {
    await service.from("notifications").insert(
      attendees.map((attendee: any) => ({
        user_id: attendee.user_id,
        type: "system" as const,
        title: `Event deleted: ${event.title}`,
        body: "An event you RSVP'd for has been deleted.",
        server_id: params.serverId,
        channel_id: event.linked_channel_id,
      }))
    )
  }

  return NextResponse.json({ success: true })
}
