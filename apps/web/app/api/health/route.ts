import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/health
 * Liveness + readiness probe. Returns 200 when the web app can reach Supabase,
 * or 503 with details when a dependency is unreachable.
 */
export async function GET() {
  const start = Date.now()
  let dbOk = false

  try {
    const supabase = await createServiceRoleClient()
    // Lightweight query — Supabase always has auth.users; count(0) avoids data transfer
    const { error } = await (supabase as any).from("users").select("id", { count: "exact", head: true }).limit(0)
    dbOk = !error
  } catch {
    dbOk = false
  }

  const latencyMs = Date.now() - start

  if (!dbOk) {
    return NextResponse.json(
      { status: "degraded", db: "unreachable", latency_ms: latencyMs },
      { status: 503 },
    )
  }

  return NextResponse.json({
    status: "ok",
    db: "connected",
    latency_ms: latencyMs,
  })
}
