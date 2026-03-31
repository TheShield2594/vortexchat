import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import {
  assembleTranscriptText,
  generateVoiceCallSummary,
  computeExpiresAt,
  writeAuditEvent,
  SUMMARY_MIN_SEGMENT_COUNT,
} from "@/lib/voice/vortex-recap-service"
import { resolveGeminiApiKey } from "@/lib/ai/resolve-gemini-key"
import type { EndSessionRequest } from "@/types/vortex-recap"

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/voice/sessions/{id}/end
 *
 * Mark the session as ended and trigger the post-call summary job.
 * Idempotency: repeated end requests return the existing terminal state (200)
 * and never create duplicate summary jobs.
 *
 * Required scope: voice:sessions:modify (must be session starter or participant).
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { id: sessionId } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: EndSessionRequest = {}
    try {
      body = await req.json()
    } catch {
      // Optional body
    }

    const endedAt = body.endedAt ?? new Date().toISOString()

    const { data: session, error: fetchError } = await supabase
      .from("voice_call_sessions")
      .select("id, ended_at, started_by, summary_status, scope_type, scope_id")
      .eq("id", sessionId)
      .maybeSingle()

    if (fetchError) {
      console.error("[voice/sessions/end] fetch session failed", { sessionId, userId: user.id, error: fetchError.message })
      return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 })
    }

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Idempotency: already ended
    if (session.ended_at) {
      return NextResponse.json({ session }, { status: 200 })
    }

    // Mark participant left_at
    const { error: leaveError } = await supabase
      .from("voice_call_participants")
      .update({ left_at: endedAt })
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .is("left_at", null)

    if (leaveError) {
      console.error("[voice/sessions/end] participant leave failed", { sessionId, userId: user.id, error: leaveError.message })
    }

    // Only the session starter can formally end the whole session
    if (session.started_by !== user.id) {
      return NextResponse.json({ session }, { status: 200 })
    }

    // End the session
    const { data: updatedSession, error: updateError } = await supabase
      .from("voice_call_sessions")
      .update({ ended_at: endedAt })
      .eq("id", sessionId)
      .select()
      .single()

    if (updateError) {
      console.error("[voice/sessions/end] update session failed", { sessionId, userId: user.id, error: updateError.message })
      return NextResponse.json({ error: "Failed to end session" }, { status: 500 })
    }

    // Resolve the server-level Gemini API key for summary generation
    let geminiApiKey: string | null = null
    if (session.scope_type === "server_channel") {
      const { data: channel } = await supabase
        .from("channels")
        .select("server_id")
        .eq("id", session.scope_id)
        .single()
      if (channel?.server_id) {
        geminiApiKey = await resolveGeminiApiKey(supabase, channel.server_id)
      }
    }

    // Trigger summary generation asynchronously (fire-and-forget from this request)
    generateSummary(sessionId, user.id, geminiApiKey).catch((err) => {
      console.error("[voice/sessions/end] generateSummary failed", { sessionId, userId: user.id, error: err })
    })

    return NextResponse.json({ session: updatedSession }, { status: 200 })
  } catch (err) {
    console.error("[voice/sessions/end] unexpected error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function generateSummary(sessionId: string, actorUserId: string, geminiApiKey: string | null): Promise<void> {
  const serviceClient = await createServiceRoleClient()

  // Fetch all non-purged final segments for this session
  const { data: segments } = await serviceClient
    .from("voice_transcript_segments")
    .select("speaker_user_id, text, started_at")
    .eq("session_id", sessionId)
    .is("purged_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: true })

  if (!segments || segments.length < SUMMARY_MIN_SEGMENT_COUNT) {
    await serviceClient
      .from("voice_call_sessions")
      .update({ summary_status: "skipped" })
      .eq("id", sessionId)
    return
  }

  const transcriptText = assembleTranscriptText(segments)
  const summary = await generateVoiceCallSummary(transcriptText, geminiApiKey)

  if (!summary) {
    await serviceClient
      .from("voice_call_sessions")
      .update({ summary_status: "failed" })
      .eq("id", sessionId)

    await writeAuditEvent(serviceClient, sessionId, actorUserId, "summary_generation_failed", {
      reason: "AI provider returned null or key is missing",
    })
    return
  }

  // Fetch policy to determine retention
  const { data: policyRow } = await serviceClient
    .from("voice_intelligence_policies")
    .select("retention_days")
    .eq("scope_type", "server")
    .maybeSingle()

  const retentionDays = (policyRow as { retention_days?: number } | null)?.retention_days ?? 30

  await serviceClient.from("voice_call_summaries").upsert({
    session_id: sessionId,
    model: "gemini-2.5-flash",
    highlights_md: summary.highlights,
    decisions_md: summary.decisions,
    action_items_md: summary.actionItems,
    generated_at: new Date().toISOString(),
    expires_at: computeExpiresAt(retentionDays),
  })

  await serviceClient
    .from("voice_call_sessions")
    .update({ summary_status: "ready" })
    .eq("id", sessionId)

  await writeAuditEvent(serviceClient, sessionId, actorUserId, "summary_generated", {
    model: "gemini-2.5-flash",
  })
}
