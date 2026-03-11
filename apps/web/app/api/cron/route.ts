import { NextRequest, NextResponse } from "next/server"
import { processEventReminders } from "./event-reminders/route"
import { processVoiceRetention } from "./voice-retention/route"
import { pollRssFeeds } from "@/app/api/social-alerts/poll/route"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Unified cron endpoint — runs all scheduled tasks in a single invocation.
 * This keeps Vercel free-plan usage to one cron slot.
 *
 * Schedule: every day via vercel.json crons
 * Each sub-task is fire-and-forget; a failure in one does not block the others.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // Event reminders
  try {
    results.eventReminders = await processEventReminders()
  } catch (err: unknown) {
    console.error("[cron] event-reminders failed:", err)
    results.eventReminders = { error: err instanceof Error ? err.message : "unknown" }
  }

  // Voice retention purge
  try {
    results.voiceRetention = await processVoiceRetention()
  } catch (err: unknown) {
    console.error("[cron] voice-retention failed:", err)
    results.voiceRetention = { error: err instanceof Error ? err.message : "unknown" }
  }

  // RSS feed polling
  try {
    results.rssFeeds = await pollRssFeeds()
  } catch (err: unknown) {
    console.error("[cron] rss-feeds failed:", err)
    results.rssFeeds = { error: err instanceof Error ? err.message : "unknown" }
  }

  return NextResponse.json({ ok: true, ...results })
}
