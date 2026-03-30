import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { verifyWithAdapter } from "@/lib/auth/passkeys"

export async function POST(request: Request) {
  try {
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

    // Validate field types and lengths to reject garbage before DB/crypto work
    if (typeof body.challenge !== "string" || body.challenge.length > 512) {
      return NextResponse.json({ error: "Invalid challenge" }, { status: 400 })
    }
    if (typeof body.credentialId !== "string" || body.credentialId.length > 1024) {
      return NextResponse.json({ error: "Invalid credentialId" }, { status: 400 })
    }
    if (typeof body.response !== "object" || body.response === null || Array.isArray(body.response)) {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 })
    }
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 100)) {
      return NextResponse.json({ error: "Invalid passkey name" }, { status: 400 })
    }
    if (body.transports !== undefined && (!Array.isArray(body.transports) || body.transports.length > 10)) {
      return NextResponse.json({ error: "Invalid transports" }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const db = supabase as any
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createServiceRoleClient()
    const adminDb = admin as any
    const { data: challengeRow } = await adminDb
      .from("auth_challenges")
      .select("id,expires_at,used_at,origin,rp_id")
      .eq("user_id", auth.user.id)
      .eq("challenge", body.challenge)
      .eq("flow", "register")
      .maybeSingle()

    if (!challengeRow || challengeRow.used_at || new Date(challengeRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Challenge is invalid or expired" }, { status: 400 })
    }

    if (!challengeRow.origin || !challengeRow.rp_id) {
      return NextResponse.json({ error: "Challenge metadata is incomplete" }, { status: 400 })
    }

    const verify = await verifyWithAdapter("registration", {
      challenge: body.challenge,
      credentialId: body.credentialId,
      response: body.response,
      expectedOrigin: challengeRow.origin,
      expectedRpId: challengeRow.rp_id,
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

  } catch (err) {
    console.error("[auth/passkeys/register/verify POST] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
