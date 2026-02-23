import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getOrigin, getRpId, PASSKEY_CHALLENGE_TTL_SECONDS, randomChallenge } from "@/lib/auth/passkeys"

export async function POST(request: Request) {
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
    const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    const authUser = usersData?.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    userId = authUser?.id ?? null

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

  const query = db.from("passkey_credentials").select("credential_id").is("revoked_at", null)
  const { data: credentials } = userId ? await query.eq("user_id", userId) : await query

  return NextResponse.json({
    challenge,
    timeout: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
    rpId: rpID,
    userVerification: "preferred",
    allowCredentials: (credentials || []).map((row: any) => ({ id: row.credential_id, type: "public-key" })),
    policy,
  })
}
