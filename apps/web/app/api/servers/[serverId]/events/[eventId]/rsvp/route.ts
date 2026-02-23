import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const RSVP_GOING = "going"
const RSVP_MAYBE = "maybe"
const RSVP_NOT_GOING = "not_going"
const RSVP_WAITLIST = "waitlist"
const RSVP_STATES = [RSVP_GOING, RSVP_MAYBE, RSVP_NOT_GOING] as const

interface EventCapacityRow {
  id: string
  capacity: number | null
}

interface RsvpRow {
  event_id: string
  user_id: string
  status: string
  waitlist_position: number | null
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { status } = (await request.json()) as { status: string }
  if (!RSVP_STATES.includes(status as (typeof RSVP_STATES)[number])) {
    return NextResponse.json({ error: "Invalid RSVP status" }, { status: 400 })
  }

  const { data: event } = await db
    .from("events")
    .select("id,capacity")
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .single()

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: existing } = await db
    .from("event_rsvps")
    .select("event_id,user_id,status,waitlist_position")
    .eq("event_id", params.eventId)
    .eq("user_id", user.id)
    .maybeSingle()

  let nextStatus = status
  let waitlistPosition: number | null = null

  if (status === RSVP_GOING && event.capacity) {
    const { count } = await db
      .from("event_rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", params.eventId)
      .eq("status", RSVP_GOING)

    const currentlyGoing = existing?.status === RSVP_GOING
    const effectiveCount = (count ?? 0) - (currentlyGoing ? 1 : 0)

    if (effectiveCount >= event.capacity) {
      nextStatus = RSVP_WAITLIST
      const { data: waitlisted } = await db
        .from("event_rsvps")
        .select("waitlist_position")
        .eq("event_id", params.eventId)
        .eq("status", RSVP_WAITLIST)
        .order("waitlist_position", { ascending: false })
        .limit(1)

      waitlistPosition = (waitlisted?.[0]?.waitlist_position ?? 0) + 1
    }
  }

  const { data: rsvp, error } = await db
    .from("event_rsvps")
    .upsert({
      event_id: params.eventId,
      user_id: user.id,
      status: nextStatus,
      waitlist_position: nextStatus === RSVP_WAITLIST ? waitlistPosition : null,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (event.capacity && existing?.status === RSVP_GOING && nextStatus !== RSVP_GOING) {
    const { data: nextWaitlisted } = await db
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", params.eventId)
      .eq("status", RSVP_WAITLIST)
      .order("waitlist_position", { ascending: true })
      .limit(1)

    const promotedUserId = nextWaitlisted?.[0]?.user_id
    if (promotedUserId) {
      await db
        .from("event_rsvps")
        .update({ status: RSVP_GOING, waitlist_position: null })
        .eq("event_id", params.eventId)
        .eq("user_id", promotedUserId)

      const { data: waitlistRows } = await db
        .from("event_rsvps")
        .select("user_id,waitlist_position")
        .eq("event_id", params.eventId)
        .eq("status", RSVP_WAITLIST)
        .order("waitlist_position", { ascending: true })

      for (let index = 0; index < (waitlistRows?.length ?? 0); index += 1) {
        const row = waitlistRows[index]
        await db
          .from("event_rsvps")
          .update({ waitlist_position: index + 1 })
          .eq("event_id", params.eventId)
          .eq("user_id", row.user_id)
      }
    }
  }

  return NextResponse.json(rsvp)
}
