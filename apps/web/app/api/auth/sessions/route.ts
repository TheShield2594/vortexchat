import { NextResponse } from "next/server"
import { clearTrustedDeviceCookie } from "@/lib/auth/security"
import { requireAuth } from "@/lib/utils/api-helpers"

export async function GET() {
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError
  const db = supabase as any

  const [{ data: sessions }, { data: trustedDevices }] = await Promise.all([
    db.from("auth_sessions").select("id,created_at,last_seen_at,user_agent,ip_address,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("auth_trusted_devices").select("id,label,last_seen_at,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false }),
  ])

  return NextResponse.json({ sessions: sessions || [], trustedDevices: trustedDevices || [] })
}

export async function DELETE() {
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError
  const db = supabase as any

  const now = new Date().toISOString()

  await Promise.all([
    db.from("auth_sessions").update({ revoked_at: now }).eq("user_id", user.id).is("revoked_at", null),
    db.from("auth_trusted_devices").update({ revoked_at: now }).eq("user_id", user.id).is("revoked_at", null),
  ])

  await clearTrustedDeviceCookie()
  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
