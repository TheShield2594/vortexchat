import { NextResponse } from "next/server"
import { clearTrustedDeviceCookie } from "@/lib/auth/security"
import { requireAuth } from "@/lib/utils/api-helpers"
import type { SupabaseClient } from "@supabase/supabase-js"

// auth_sessions and auth_trusted_devices exist in the database but are not in
// the generated Supabase schema types. We narrow the cast to just the `.from()`
// method so the rest of the client remains fully typed.
function untypedFrom(supabase: SupabaseClient, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as SupabaseClient<any>).from(table)
}

export async function GET() {
  try {
    const { supabase, user, error: authError } = await requireAuth()
    if (authError) return authError

    const [{ data: sessions }, { data: trustedDevices }] = await Promise.all([
      untypedFrom(supabase, "auth_sessions").select("id,created_at,last_seen_at,user_agent,ip_address,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      untypedFrom(supabase, "auth_trusted_devices").select("id,label,last_seen_at,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    ])

    return NextResponse.json({ sessions: sessions ?? [], trustedDevices: trustedDevices ?? [] })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { supabase, user, error: authError } = await requireAuth()
    if (authError) return authError

    const now = new Date().toISOString()

    await Promise.all([
      untypedFrom(supabase, "auth_sessions").update({ revoked_at: now }).eq("user_id", user.id).is("revoked_at", null),
      untypedFrom(supabase, "auth_trusted_devices").update({ revoked_at: now }).eq("user_id", user.id).is("revoked_at", null),
    ])

    await clearTrustedDeviceCookie()
    await supabase.auth.signOut()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
