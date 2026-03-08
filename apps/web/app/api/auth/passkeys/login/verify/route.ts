import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getOrigin, getRpId, verifyWithAdapter } from "@/lib/auth/passkeys"
import { createAuthSession, issueTrustedDevice } from "@/lib/auth/security"
import { rateLimiter } from "@/lib/rate-limit"

export async function POST(request: Request) {
  // Rate limit: 10 verification attempts per minute per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rl = await rateLimiter.check(`passkey-verify:${ip}`, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    challenge?: string
    credentialId?: string
    response?: Record<string, unknown>
    trustedDeviceLabel?: string
  }

  if (!body.challenge || !body.credentialId || !body.response) {
    return NextResponse.json({ error: "Missing authentication payload" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()
  const db = supabase as any
  const { data: challengeRow } = await db
    .from("auth_challenges")
    .select("id,user_id,expires_at,used_at")
    .eq("challenge", body.challenge)
    .eq("flow", "login")
    .maybeSingle()

  if (!challengeRow || challengeRow.used_at || new Date(challengeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Challenge is invalid or expired" }, { status: 400 })
  }

  const { data: credential } = await db
    .from("passkey_credentials")
    .select("id,user_id,public_key,counter,revoked_at")
    .eq("credential_id", body.credentialId)
    .maybeSingle()

  if (!credential || credential.revoked_at) {
    return NextResponse.json({ error: "Credential has been revoked" }, { status: 403 })
  }

  if (challengeRow.user_id && credential.user_id !== challengeRow.user_id) {
    return NextResponse.json({ error: "Credential/user mismatch" }, { status: 403 })
  }

  const verify = await verifyWithAdapter("authentication", {
    challenge: body.challenge,
    credentialId: body.credentialId,
    response: body.response,
    expectedOrigin: getOrigin(),
    expectedRpId: getRpId(getOrigin()),
    publicKey: credential.public_key,
    prevCounter: credential.counter,
  })

  if (!verify.verified) {
    return NextResponse.json({ error: "Passkey assertion verification failed" }, { status: 400 })
  }

  if ((verify.newCounter || 0) <= credential.counter) {
    return NextResponse.json({ error: "Potential replay detected" }, { status: 409 })
  }

  await db
    .from("passkey_credentials")
    .update({ counter: verify.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", credential.id)

  await db.from("auth_challenges").update({ used_at: new Date().toISOString() }).eq("id", challengeRow.id)

  const userResult = await supabase.auth.admin.getUserById(credential.user_id)
  const email = userResult.data.user?.email
  if (!email) {
    return NextResponse.json({ error: "Unable to resolve account email for passkey login" }, { status: 400 })
  }

  // Generate a magic link token, then verify it server-side through the
  // cookie-aware client so session cookies are set in this response —
  // no implicit-grant redirect required.
  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email })
  const tokenHash = link.data.properties?.hashed_token
  if (!tokenHash) {
    return NextResponse.json({ error: "Unable to finalize session" }, { status: 500 })
  }

  const anonClient = await createServerSupabaseClient()
  const { error: otpError } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  })
  if (otpError) {
    return NextResponse.json({ error: "Session creation failed" }, { status: 500 })
  }

  const trustedDeviceId = body.trustedDeviceLabel
    ? await issueTrustedDevice(credential.user_id, body.trustedDeviceLabel)
    : null

  await createAuthSession({
    userId: credential.user_id,
    trustedDeviceId,
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for"),
  })

  return NextResponse.json({ ok: true })
}
