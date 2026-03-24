import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type RsvpStatus = "interested" | "going" | "maybe" | "not_going" | "waitlist"

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership
  const { data: member } = await supabase
    .from("server_members")
    .select("server_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .single()
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  let body: { status: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const validStatuses: RsvpStatus[] = ["interested", "going", "maybe", "not_going"]
  if (!validStatuses.includes(body.status as RsvpStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }
  const requestedStatus = body.status as RsvpStatus

  // Fetch event for capacity check
  const { data: event } = await supabase
    .from("events")
    .select("id, capacity")
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  let resolvedStatus: RsvpStatus = requestedStatus

  // If going and capacity is set, check if at capacity
  if (requestedStatus === "going" && event.capacity) {
    const { count } = await supabase
      .from("event_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", params.eventId)
      .eq("status", "going")
      .neq("user_id", user.id)

    if ((count ?? 0) >= event.capacity) {
      resolvedStatus = "waitlist"
    }
  }

  const { error } = await supabase
    .from("event_rsvps")
    .upsert(
      { event_id: params.eventId, user_id: user.id, status: resolvedStatus },
      { onConflict: "event_id,user_id" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-promote from waitlist when a "going" spot opens up
  if (requestedStatus !== "going" && event.capacity) {
    // Check if there's now room
    const { count: goingCount } = await supabase
      .from("event_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", params.eventId)
      .eq("status", "going")

    if ((goingCount ?? 0) < event.capacity) {
      // Find the next person on the waitlist (by waitlist_position, then created_at)
      const { data: nextWaitlisted } = await supabase
        .from("event_rsvps")
        .select("user_id")
        .eq("event_id", params.eventId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .single()

      if (nextWaitlisted) {
        await supabase
          .from("event_rsvps")
          .update({ status: "going", waitlist_position: null })
          .eq("event_id", params.eventId)
          .eq("user_id", nextWaitlisted.user_id)
      }
    }
  }

  return NextResponse.json({ status: resolvedStatus })
}
