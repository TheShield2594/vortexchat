import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PRESENCE_STALE_THRESHOLD_MS } from "@vortex/shared"

/**
 * GET /api/cron/presence-cleanup
 *
 * Server-side presence garbage collector. Finds users whose last heartbeat
 * exceeds the stale threshold and marks them offline. This is the safety net
 * that ensures users are marked offline even when:
 *
 * - The browser crashes (no beforeunload / sendBeacon)
 * - The network drops silently
 * - The mobile OS kills the tab in the background
 * - The user force-quits the app
 *
 * Modeled after Fluxer's server-side disconnect detection where the gateway
 * process monitors session liveness and marks users offline on timeout.
 *
 * Runs every minute via Vercel Cron. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()
    const now = new Date()
    const staleThreshold = new Date(now.getTime() - PRESENCE_STALE_THRESHOLD_MS).toISOString()

    // Find users who are marked online/idle/dnd but have a stale (or null)
    // heartbeat. Invisible users are excluded — they intentionally appear offline
    // and still heartbeat to maintain their session.
    // NULL last_heartbeat_at means the user was set online before the heartbeat
    // system was deployed — treat as stale.
    const { data: staleUsers, error: queryError } = await supabase
      .from("users")
      .select("id, status, last_heartbeat_at")
      .in("status", ["online", "idle", "dnd"])
      .or(`last_heartbeat_at.is.null,last_heartbeat_at.lt.${staleThreshold}`)
      .limit(500)

    if (queryError) {
      console.error("presence-cleanup: query failed", {
        route: "cron/presence-cleanup",
        error: queryError.message,
      })
      return NextResponse.json({ error: "Query failed" }, { status: 500 })
    }

    if (!staleUsers || staleUsers.length === 0) {
      return NextResponse.json({ ok: true, cleaned: 0 })
    }

    const staleIds = staleUsers.map((u) => u.id)

    // Batch update all stale users to offline.
    // Reapply the staleness predicate so a user who heartbeated between the
    // SELECT and this UPDATE is not incorrectly flipped to offline.
    const { data: cleanedUsers, error: updateError } = await supabase
      .from("users")
      .update({
        status: "offline",
        updated_at: now.toISOString(),
      })
      .in("id", staleIds)
      .in("status", ["online", "idle", "dnd"])
      .or(`last_heartbeat_at.is.null,last_heartbeat_at.lt.${staleThreshold}`)
      .select("id")

    if (updateError) {
      console.error("presence-cleanup: update failed", {
        route: "cron/presence-cleanup",
        error: updateError.message,
        count: cleanedUsers?.length ?? 0,
      })
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    const cleanedCount = cleanedUsers?.length ?? 0

    console.log("presence-cleanup: marked users offline", {
      route: "cron/presence-cleanup",
      count: cleanedCount,
    })

    return NextResponse.json({ ok: true, cleaned: cleanedCount })
  } catch (err) {
    console.error("presence-cleanup: unexpected error", {
      route: "cron/presence-cleanup",
      error: err,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
