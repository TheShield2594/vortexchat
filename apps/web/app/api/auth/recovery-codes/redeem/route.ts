import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyRecoveryCode } from "@/lib/auth/recovery-codes"

/**
 * POST /api/auth/recovery-codes/redeem
 * Redeems a recovery code during login to bypass MFA.
 * Requires email + password to have already been verified (via Supabase session).
 * The code is marked as consumed (used_at set) after successful use.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    code?: string
  }

  if (!body.email || !body.password || !body.code) {
    return NextResponse.json({ error: "Email, password, and recovery code are required" }, { status: 400 })
  }

  const admin = await createServiceRoleClient()
  const adminDb = admin as any

  // Verify password by attempting sign-in via a throwaway client
  const { createClient } = await import("@supabase/supabase-js")
  const tempClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: signInData, error: signInError } = await tempClient.auth.signInWithPassword({
    email: body.email!,
    password: body.password!,
  })

  if (signInError || !signInData.user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Sign out the temp session immediately
  await tempClient.auth.signOut()

  const authUser = signInData.user

  // Fetch all unused recovery codes for this user
  const { data: codes, error: codesError } = await adminDb
    .from("recovery_codes")
    .select("id,code_hash")
    .eq("user_id", authUser.id)
    .is("used_at", null)

  if (codesError || !codes || codes.length === 0) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Check the provided code against all unused hashes
  let matchedCodeId: string | null = null
  for (const row of codes as Array<{ id: string; code_hash: string }>) {
    const isMatch = await verifyRecoveryCode(body.code!, row.code_hash)
    if (isMatch) {
      matchedCodeId = row.id
      break
    }
  }

  if (!matchedCodeId) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Mark the code as consumed
  const { error: consumeError } = await adminDb
    .from("recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", matchedCodeId)

  if (consumeError) {
    return NextResponse.json({ error: "Failed to consume recovery code" }, { status: 500 })
  }

  // Generate a session link for the user (same pattern as passkey login verify)
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: body.email! })
  if (!link.data.properties?.action_link) {
    return NextResponse.json({ error: "Unable to finalize session" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, actionLink: link.data.properties.action_link })
}
