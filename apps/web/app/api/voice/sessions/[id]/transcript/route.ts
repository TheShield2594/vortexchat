import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { computeExpiresAt } from "@/lib/voice/voice-intelligence-service"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/voice/sessions/{id}/transcript
 *
 * Retrieve all final transcript segments for a session.
 * Filtered by RLS: only participants see the data.
 *
 * Required scope: voice:sessions:read (enforced via RLS).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: sessionId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: segments, error } = await supabase
    .from("voice_transcript_segments")
    .select("*")
    .eq("session_id", sessionId)
    .is("purged_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 })
  }

  return NextResponse.json({ segments: segments ?? [] })
}

/**
 * POST /api/voice/sessions/{id}/transcript
 *
 * Persist a final transcript segment from the client-side STT pipeline.
 * The segment is attributed to the authenticated user as the speaker.
 *
 * Body: { speaker_user_id, source_language, text, started_at, ended_at, confidence, provider }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: sessionId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    speaker_user_id?: string | null
    source_language?: string
    text?: string
    started_at?: string
    ended_at?: string
    confidence?: number | null
    provider?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.text || !body.started_at || !body.ended_at) {
    return NextResponse.json({ error: "text, started_at, and ended_at are required" }, { status: 400 })
  }

  // Verify session is active and user is a participant
  const { data: session } = await supabase
    .from("voice_call_sessions")
    .select("id, ended_at")
    .eq("id", sessionId)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }
  if (session.ended_at) {
    return NextResponse.json({ error: "Session has already ended" }, { status: 409 })
  }

  // Verify participant consent
  const { data: participant } = await supabase
    .from("voice_call_participants")
    .select("consent_transcription")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!participant?.consent_transcription) {
    return NextResponse.json({ error: "Transcription consent not given" }, { status: 403 })
  }

  // Fetch policy retention
  const { data: policyRow } = await supabase
    .from("voice_intelligence_policies")
    .select("retention_days")
    .eq("scope_type", "workspace")
    .maybeSingle()

  const retentionDays = (policyRow as { retention_days?: number } | null)?.retention_days ?? 30

  const { data: segment, error } = await supabase
    .from("voice_transcript_segments")
    .insert({
      session_id: sessionId,
      speaker_user_id: body.speaker_user_id ?? user.id,
      source_language: body.source_language ?? "en",
      text: body.text,
      started_at: body.started_at,
      ended_at: body.ended_at,
      confidence: body.confidence ?? null,
      provider: body.provider ?? "web-speech-api",
      expires_at: computeExpiresAt(retentionDays),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 })
  }

  return NextResponse.json({ segment }, { status: 201 })
}
