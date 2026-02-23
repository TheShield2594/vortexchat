import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getOrigin, getRpId, PASSKEY_CHALLENGE_TTL_SECONDS, randomChallenge } from "@/lib/auth/passkeys"

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()

  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const challenge = randomChallenge()
  const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000).toISOString()
  const origin = getOrigin()
  const rpID = getRpId(origin)

  const admin = await createServiceRoleClient()
  const adminDb = admin as any
  await adminDb.from("auth_challenges").insert({
    user_id: auth.user.id,
    flow: "register",
    challenge,
    rp_id: rpID,
    origin,
    expires_at: expiresAt,
  })

  const { data: existing } = await adminDb
    .from("passkey_credentials")
    .select("credential_id")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)

  return NextResponse.json({
    challenge,
    rp: { id: rpID, name: "Vortex" },
    user: {
      id: auth.user.id,
      name: auth.user.email ?? auth.user.id,
      displayName: (auth.user.user_metadata.display_name as string | undefined) ?? auth.user.email ?? "Vortex User",
    },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    timeout: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
    attestation: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    excludeCredentials: (existing || []).map((row: any) => ({ id: row.credential_id, type: "public-key" })),
  })
}
