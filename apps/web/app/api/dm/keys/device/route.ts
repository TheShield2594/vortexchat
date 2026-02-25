import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await (supabase as any)
    .from("user_device_keys")
    .select("device_id, public_key, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ devices: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null
  const publicKey = typeof body?.publicKey === "string" ? body.publicKey : null
  if (!deviceId || !publicKey) {
    return NextResponse.json({ error: "deviceId and publicKey required" }, { status: 400 })
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
