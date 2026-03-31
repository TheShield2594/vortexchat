import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import {
  PRESENCE_HEARTBEAT_DEBOUNCE_MS,
  type UserStatus,
} from "@vortex/shared"

const VALID_STATUSES = new Set<UserStatus>(["online", "idle", "dnd", "invisible"])

/**
 * POST /api/presence/heartbeat
 *
 * Client-side heartbeat endpoint. Called every 30s by the presence hook.
 * Updates `last_heartbeat_at` and optionally `status` in the users table.
 *
 * A separate cron job (`/api/cron/presence-cleanup`) marks users with stale
 * heartbeats as offline, providing reliable server-side disconnect detection
 * even when the client crashes without calling sendBeacon.
 *
 * Request body: { status: UserStatus }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { data: { user }, error: authError } = await getAuthUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const status = (body as { status?: unknown }).status
    if (typeof status !== "string" || !VALID_STATUSES.has(status as UserStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const now = new Date().toISOString()
    const supabase = await createServerSupabaseClient()

    // Check if we should debounce this heartbeat to avoid DB write stampede.
    // Read the current heartbeat timestamp and skip the write if it's recent.
    const { data: current } = await supabase
      .from("users")
      .select("last_heartbeat_at, status")
      .eq("id", user.id)
      .maybeSingle()

    if (current?.last_heartbeat_at) {
      const lastBeat = new Date(current.last_heartbeat_at).getTime()
      const elapsed = Date.now() - lastBeat
      // If the last heartbeat was very recent and status hasn't changed,
      // skip the write to reduce DB load.
      if (elapsed < PRESENCE_HEARTBEAT_DEBOUNCE_MS && current.status === status) {
        return NextResponse.json({ ok: true, debounced: true })
      }
    }

    const updatePayload: Record<string, string> = {
      last_heartbeat_at: now,
      updated_at: now,
    }

    // Only update status if it actually changed (reduces unnecessary writes)
    if (!current || current.status !== status) {
      updatePayload.status = status
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", user.id)

    if (updateError) {
      console.error("presence/heartbeat: failed to update", {
        route: "presence/heartbeat",
        userId: user.id,
        error: updateError.message,
      })
      return NextResponse.json({ error: "Failed to update heartbeat" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("presence/heartbeat: unexpected error", {
      route: "presence/heartbeat",
      error: err,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
