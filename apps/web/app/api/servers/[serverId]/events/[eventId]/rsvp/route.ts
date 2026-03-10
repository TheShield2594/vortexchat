import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

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

  const { status } = body
  if (!["going", "maybe", "not_going"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  // Fetch event for capacity check
  const { data: event } = await supabase
    .from("events")
    .select("id, capacity")
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  let resolvedStatus = status

  // If going and capacity is set, check if full
  if (status === "going" && event.capacity) {
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

  return NextResponse.json({ status: resolvedStatus })
}
