import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// In-memory MFA attempt rate limiter (5 attempts per 10 minutes per key)
// ---------------------------------------------------------------------------
const MFA_WINDOW_MS = 10 * 60 * 1000
const MFA_MAX_ATTEMPTS = 5

const mfaAttempts = new Map<string, number[]>()

function checkMfaRateLimit(key: string): boolean {
  const now = Date.now()
  const timestamps = (mfaAttempts.get(key) ?? []).filter((t) => now - t < MFA_WINDOW_MS)
  mfaAttempts.set(key, timestamps)
  return timestamps.length >= MFA_MAX_ATTEMPTS
}

function recordMfaAttempt(key: string) {
  const now = Date.now()
  const timestamps = (mfaAttempts.get(key) ?? []).filter((t) => now - t < MFA_WINDOW_MS)
  timestamps.push(now)
  mfaAttempts.set(key, timestamps)
}

function clearMfaAttempts(key: string) {
  mfaAttempts.delete(key)
}

/**
 * GET /api/auth/mfa-challenge
 * Checks if the current authenticated user has TOTP factors enrolled.
 * Returns the assurance level and factor info so the client can decide
 * whether to show the TOTP challenge screen.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: factors } = await supabase.auth.mfa.listFactors()

  const verifiedTotp = (factors?.totp ?? []).filter((f: any) => f.status === "verified")
  const hasTOTP = verifiedTotp.length > 0

  return NextResponse.json({
    currentLevel: assurance?.currentLevel ?? "aal1",
    nextLevel: assurance?.nextLevel ?? "aal1",
    hasTOTP,
    factorId: hasTOTP ? verifiedTotp[0].id : null,
  })
}

/**
 * POST /api/auth/mfa-challenge
 * Creates a challenge and verifies a TOTP code for the given factor.
 * Used during the login flow to step up from AAL1 to AAL2.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    factorId?: string
    code?: string
  }

  if (!body.factorId || !body.code) {
    return NextResponse.json({ error: "factorId and code are required" }, { status: 400 })
  }

  // Rate limit: 5 attempts per 10 minutes per user+factor
  const rateLimitKey = `${auth.user.id}:${body.factorId}`
  if (checkMfaRateLimit(rateLimitKey)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 })
  }

  // Create a challenge
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: body.factorId,
  })

  if (challengeError || !challengeData) {
    return NextResponse.json(
      { error: challengeError?.message || "Failed to create MFA challenge" },
      { status: 400 }
    )
  }

  // Verify the TOTP code
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: body.factorId,
    challengeId: challengeData.id,
    code: body.code,
  })

  if (verifyError) {
    recordMfaAttempt(rateLimitKey)
    return NextResponse.json({ error: "Invalid code" }, { status: 401 })
  }

  clearMfaAttempts(rateLimitKey)
  return NextResponse.json({ ok: true, level: "aal2" })
}
