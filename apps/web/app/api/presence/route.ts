import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getAuthUser } from "@/lib/supabase/server"

/**
 * Lightweight presence endpoint used by `navigator.sendBeacon()` on tab close
 * to persist the user's offline status to the database. This ensures the
 * `users.status` field is accurate for push notification eligibility checks.
 *
 * Also used for general presence status updates from the client.
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
    const validStatuses = ["online", "idle", "dnd", "invisible", "offline"]
    if (typeof status !== "string" || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({ status: status as "online" | "idle" | "dnd" | "invisible" | "offline", updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("id")
      .maybeSingle()

    if (updateError) {
      console.error("presence: failed to update status", { route: "presence", userId: user.id, action: "update_status", error: updateError.message })
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
    }
    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("presence: unexpected error", { route: "presence", action: "update_status", error: err })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
