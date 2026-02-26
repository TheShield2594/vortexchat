import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * POST /api/auth/login
 * Server-side login endpoint with brute-force protection.
 * Tracks failed attempts and enforces 15-minute lockout after 5 failures.
 * Returns a generic "Invalid credentials" message to avoid email enumeration.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const email = body.email.toLowerCase()
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

  const admin = await createServiceRoleClient()
  const adminDb = admin as any

  // Check if the email is locked out (fail-closed: treat RPC errors as locked out)
  let isLockedOut = false
  try {
    const { data: lockoutResult } = await adminDb.rpc("is_login_locked_out", {
      target_email: email,
    })
    isLockedOut = lockoutResult === true
  } catch {
    isLockedOut = true
  }

  if (isLockedOut) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Attempt sign-in using a server-side Supabase client that sets cookies
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component context — handled by middleware
          }
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: body.password,
  })

  if (error || !data.user) {
    // Record the failed attempt (best-effort; don't block login response on failure)
    try {
      await adminDb.rpc("record_login_attempt", {
        target_email: email,
        target_ip: ipAddress,
      })
    } catch {
      // Swallow — failing to record shouldn't change the auth response
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Clear failed attempts on successful login (best-effort)
  try {
    await adminDb.rpc("clear_login_attempts", { target_email: email })
  } catch {
    // Swallow — failing to clear shouldn't block a successful login
  }

  // Check if user has TOTP enrolled (for MFA challenge redirect)
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verifiedTotp = (factors?.totp ?? []).filter((f: any) => f.status === "verified")
  const requiresMfa = verifiedTotp.length > 0

  // Check assurance level
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const needsChallenge = requiresMfa && assurance?.currentLevel === "aal1"

  return NextResponse.json({
    ok: true,
    userId: data.user.id,
    requiresMfa: needsChallenge,
    factorId: needsChallenge ? verifiedTotp[0].id : null,
  })
}
