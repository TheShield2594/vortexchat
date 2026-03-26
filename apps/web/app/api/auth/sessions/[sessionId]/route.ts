import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: session, error: sessionLookupError } = await db
    .from("auth_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (sessionLookupError) {
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 })
  }

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })

  const { error } = await db
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)

  if (error) return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
