import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getOrigin, getRpId, PASSKEY_CHALLENGE_TTL_SECONDS, randomChallenge } from "@/lib/auth/passkeys"
import { rateLimiter } from "@/lib/rate-limit"
import { getClientIp } from "@vortex/shared"

export async function POST(request: Request) {
  try {
    // Rate limit: 10 passkey challenge requests per minute per IP
    const ip = getClientIp(request.headers) ?? "unknown"
    try {
      const rl = await rateLimiter.check(`passkey-options:${ip}`, { limit: 10, windowMs: 60_000 })
      if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
      }
    } catch {
      // Fail open — don't block passkey login if rate limiter is down
    }

    const { email } = (await request.json().catch(() => ({}))) as { email?: string }
    const supabase = await createServiceRoleClient()
    const db = supabase as any

    let userId: string | null = null
    let policy = {
      passkey_first: false,
      enforce_passkey: false,
      fallback_password: true,
      fallback_magic_link: true,
    }

    if (email) {
      // Look up user by email directly instead of paginated list
      const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email)
      if (!userError && userData?.user) {
        userId = userData.user.id
      }

      if (userId) {
        const { data: policyRow } = await db
          .from("auth_security_policies")
          .select("passkey_first,enforce_passkey,fallback_password,fallback_magic_link")
          .eq("user_id", userId)
          .maybeSingle()
        if (policyRow) policy = policyRow as typeof policy
      }
    }

    const challenge = randomChallenge()
    const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000).toISOString()
    const origin = getOrigin()
    const rpID = getRpId(origin)

    await db.from("auth_challenges").insert({
      user_id: userId,
      flow: "login",
      challenge,
      rp_id: rpID,
      origin,
      expires_at: expiresAt,
    })

    // Only query credentials for a specific user — never expose the full table
    let credentials: Array<{ credential_id: string }> = []
    if (userId) {
      const { data } = await db
        .from("passkey_credentials")
        .select("credential_id")
        .is("revoked_at", null)
        .eq("user_id", userId)
      credentials = data || []
    }

    return NextResponse.json({
      challenge,
      timeout: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
      rpId: rpID,
      userVerification: "preferred",
      allowCredentials: credentials.map((row) => ({ id: row.credential_id, type: "public-key" })),
      policy,
    })
  } catch (err) {
    console.error("[passkey-options]", err instanceof Error ? err.message : "Unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
