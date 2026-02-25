import { webcrypto } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const DEVICE_LIMIT = 20

function decodeBase64(value: string): Uint8Array | null {
  try {
    const bytes = Buffer.from(value, "base64")
    return bytes.length ? new Uint8Array(bytes) : null
  } catch {
    return null
  }
}

async function isValidP256SpkiPublicKey(publicKey: string): Promise<boolean> {
  const bytes = decodeBase64(publicKey)
  if (!bytes) return false
  if (bytes.length < 80 || bytes.length > 130) return false

  try {
    await webcrypto.subtle.importKey(
      "spki",
      bytes,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    )
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error, count } = await (supabase as any)
    .from("user_device_keys")
    .select("device_id, public_key, updated_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(DEVICE_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    devices: data ?? [],
    truncated: (count ?? 0) > DEVICE_LIMIT,
    total: count ?? (data?.length ?? 0),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : null
  const publicKey = typeof body?.publicKey === "string" ? body.publicKey.trim() : null
  if (!deviceId || !publicKey) {
    return NextResponse.json({ error: "deviceId and publicKey required" }, { status: 400 })
  }

  const validPublicKey = await isValidP256SpkiPublicKey(publicKey)
  if (!validPublicKey) {
    return NextResponse.json({ error: "Invalid device public key" }, { status: 400 })
  }

  const { count, error: countError } = await (supabase as any)
    .from("user_device_keys")
    .select("device_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("device_id", deviceId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) >= DEVICE_LIMIT) {
    return NextResponse.json({ error: `Device limit reached (${DEVICE_LIMIT})` }, { status: 409 })
  }

  const { error } = await (supabase as any).from("user_device_keys").upsert({
    user_id: user.id,
    device_id: deviceId,
    public_key: publicKey,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
