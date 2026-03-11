import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { writeAuditEvent } from "@/lib/voice/voice-intelligence-service"

/**
 * Purge worker: hard-deletes expired voice transcript segments and summaries
 * that are past their expires_at and have not been purged yet.
 * Legal-hold records are explicitly skipped and logged.
 *
 * Core logic exported so the unified cron route (/api/cron) can call it directly.
 */
export async function processVoiceRetention() {
  const serviceClient = await createServiceRoleClient()
  const now = new Date().toISOString()

  // ── Purge expired transcript segments (skip legal holds) ──────────────────

  const { data: expiredSegments } = await serviceClient
    .from("voice_transcript_segments")
    .select("id, session_id, legal_hold")
    .lt("expires_at", now)
    .is("purged_at", null)
    .limit(500)

  let purgedSegments = 0
  let skippedSegmentsHeld = 0

  for (const seg of expiredSegments ?? []) {
    if (seg.legal_hold) {
      skippedSegmentsHeld++
      continue
    }

    await serviceClient
      .from("voice_transcript_segments")
      .update({ purged_at: now })
      .eq("id", seg.id)

    purgedSegments++
  }

  if (purgedSegments > 0) {
    await writeAuditEvent(serviceClient, null, null, "voice_segments_purged", {
      count: purgedSegments,
      skipped_held: skippedSegmentsHeld,
      run_at: now,
    })
  }

  // ── Purge expired summaries (skip legal holds) ────────────────────────────

  const { data: expiredSummaries } = await serviceClient
    .from("voice_call_summaries")
    .select("session_id, legal_hold")
    .lt("expires_at", now)
    .is("purged_at", null)
    .limit(500)

  let purgedSummaries = 0
  let skippedSummariesHeld = 0

  for (const sum of expiredSummaries ?? []) {
    if (sum.legal_hold) {
      skippedSummariesHeld++
      continue
    }

    await serviceClient
      .from("voice_call_summaries")
      .update({ purged_at: now })
      .eq("session_id", sum.session_id)

    purgedSummaries++
  }

  if (purgedSummaries > 0) {
    await writeAuditEvent(serviceClient, null, null, "voice_summaries_purged", {
      count: purgedSummaries,
      skipped_held: skippedSummariesHeld,
      run_at: now,
    })
  }

  return { purgedSegments, skippedSegmentsHeld, purgedSummaries, skippedSummariesHeld, runAt: now }
}

/**
 * Standalone endpoint — kept for manual triggers.
 * The unified cron at /api/cron calls processVoiceRetention() directly.
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

  try {
    const result = await processVoiceRetention()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 })
  }
}
