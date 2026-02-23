import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const service = (await createServiceRoleClient()) as any
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

  const { data: updated, error } = await db
    .from("events")
    .update({
      title: body.title,
      description: body.description,
      linked_channel_id: body.linkedChannelId,
      start_at: body.startAt,
      end_at: body.endAt,
      timezone: body.timezone,
      recurrence: body.recurrence,
      recurrence_until: body.recurrenceUntil,
      capacity: body.capacity,
      cancelled_at: body.cancelled ? new Date().toISOString() : null,
    })
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .select("id,title,linked_channel_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: attendees } = await db
    .from("event_rsvps")
    .select("user_id")
    .eq("event_id", params.eventId)
    .in("status", ["going", "maybe", "waitlist"])

  if (attendees?.length) {
    await service.from("notifications").insert(
      attendees.map((attendee: any) => ({
        user_id: attendee.user_id,
        type: "system",
        title: body.cancelled ? `Event cancelled: ${updated.title}` : `Event updated: ${updated.title}`,
        body: body.cancelled ? "An event you RSVP'd for has been cancelled." : "An event you RSVP'd for was updated.",
        server_id: params.serverId,
        channel_id: updated.linked_channel_id,
      }))
    )
  }

  return NextResponse.json(updated)
}
