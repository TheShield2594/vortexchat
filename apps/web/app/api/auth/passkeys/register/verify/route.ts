import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getOrigin, getRpId, verifyWithAdapter } from "@/lib/auth/passkeys"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    challenge?: string
    credentialId?: string
    name?: string
    response?: Record<string, unknown>
    transports?: string[]
  }

  if (!body.challenge || !body.credentialId || !body.response) {
    return NextResponse.json({ error: "Missing registration payload" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createServiceRoleClient()
  const adminDb = admin as any
  const { data: challengeRow } = await adminDb
    .from("auth_challenges")
    .select("id,expires_at,used_at")
    .eq("user_id", auth.user.id)
    .eq("challenge", body.challenge)
    .eq("flow", "register")
    .maybeSingle()

  if (!challengeRow || challengeRow.used_at || new Date(challengeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Challenge is invalid or expired" }, { status: 400 })
  }

  const verify = await verifyWithAdapter("registration", {
    challenge: body.challenge,
    credentialId: body.credentialId,
    response: body.response,
    expectedOrigin: getOrigin(),
    expectedRpId: getRpId(getOrigin()),
  })

  if (!verify.verified) {
    return NextResponse.json({ error: "Passkey attestation verification failed" }, { status: 400 })
  }

  await adminDb.from("passkey_credentials").insert({
    user_id: auth.user.id,
    credential_id: body.credentialId,
    public_key: verify.publicKey || "",
    counter: verify.newCounter || 0,
    transports: body.transports || [],
    backed_up: verify.backedUp ?? false,
    device_type: verify.deviceType ?? "singleDevice",
    name: body.name?.trim() || "Passkey",
  })

  await adminDb.from("auth_challenges").update({ used_at: new Date().toISOString() }).eq("id", challengeRow.id)

  return NextResponse.json({ ok: true })
}
