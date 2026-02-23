import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * POST /api/channels/cleanup
 *
 * Deletes all channels whose `expires_at` timestamp is in the past.
 * Should be called periodically (e.g. every minute) by a cron job or
 * an external scheduler. Protect with CRON_SECRET env var.
 *
 * Returns: { deleted: number }
 */
export async function POST(request: Request) {
  // Validate cron secret when configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase.rpc("delete_expired_channels")
    if (error) throw error

    return NextResponse.json({ deleted: data ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/channels/cleanup
 *
 * Same as POST — allows easy testing from a browser or simple cron ping.
 */
export async function GET(request: Request) {
  return POST(request)
}
