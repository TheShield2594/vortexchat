import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/** Core logic — exported so the unified cron route can call it directly. */
export async function processEventReminders() {
  const service = await createServiceRoleClient()

  const now = new Date()
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000)  // 10 min from now
  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000)    // 20 min from now

  const { data: events, error: eventsError } = await service
    .from("events")
    .select("id, title, server_id, linked_channel_id, start_at")
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString())

  if (eventsError) {
    console.error("[event-reminders] Failed to fetch events:", eventsError.message)
    throw new Error(eventsError.message)
  }

  if (!events || events.length === 0) return { notified: 0, eventsProcessed: 0 }

  let totalNotified = 0

  for (const event of events) {
    const { data: rsvps } = await service
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", event.id)
      .in("status", ["going", "maybe"])

    if (!rsvps || rsvps.length === 0) continue

    const notifications = rsvps.map((r: { user_id: string }) => ({
      user_id: r.user_id,
      type: "system" as const,
      title: `\u23F0 Starting soon: ${event.title}`,
      body: `${event.title} starts in about 15 minutes.`,
      server_id: event.server_id,
      channel_id: event.linked_channel_id ?? null,
    }))

    const { error: notifError } = await service
      .from("notifications")
      .insert(notifications)

    if (notifError) {
      console.error(`[event-reminders] Failed to insert notifications for event ${event.id}:`, notifError.message)
    } else {
      totalNotified += notifications.length
    }
  }

  return { notified: totalNotified, eventsProcessed: events.length }
}

/**
 * Standalone endpoint — kept for manual triggers.
 * The unified cron at /api/cron calls processEventReminders() directly.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processEventReminders()
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 })
  }
}
