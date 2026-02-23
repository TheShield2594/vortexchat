import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { clearTrustedDeviceCookie } from "@/lib/auth/security"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [{ data: sessions }, { data: trustedDevices }] = await Promise.all([
    db.from("auth_sessions").select("id,created_at,last_seen_at,user_agent,ip_address,expires_at,revoked_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    db.from("auth_trusted_devices").select("id,label,last_seen_at,expires_at,revoked_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
  ])

  return NextResponse.json({ sessions: sessions || [], trustedDevices: trustedDevices || [] })
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const now = new Date().toISOString()

  await Promise.all([
    db.from("auth_sessions").update({ revoked_at: now }).eq("user_id", auth.user.id).is("revoked_at", null),
    db.from("auth_trusted_devices").update({ revoked_at: now }).eq("user_id", auth.user.id).is("revoked_at", null),
  ])

  await clearTrustedDeviceCookie()
  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
