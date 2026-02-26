import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recovery-codes"

/**
 * GET /api/auth/recovery-codes
 * Returns the count of remaining (unused) recovery codes for the authenticated user.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("recovery_codes")
    .select("id,used_at,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const codes = data || []
  const total = codes.length
  const remaining = codes.filter((c: any) => !c.used_at).length

  return NextResponse.json({ total, remaining })
}

/**
 * POST /api/auth/recovery-codes
 * Generates a new set of 10 recovery codes. Deletes any existing codes first.
 * Returns the plaintext codes — this is the ONLY time they are shown.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createServiceRoleClient()
  const adminDb = admin as any

  // Delete all existing recovery codes for this user
  const { error: deleteError } = await adminDb.from("recovery_codes").delete().eq("user_id", auth.user.id)
  if (deleteError) {
    return NextResponse.json({ error: "Failed to clear existing recovery codes" }, { status: 500 })
  }

  // Generate new codes
  const plaintextCodes = generateRecoveryCodes()

  // Hash and store each code
  const rows = await Promise.all(
    plaintextCodes.map(async (code) => ({
      user_id: auth.user!.id,
      code_hash: await hashRecoveryCode(code),
    }))
  )

  const { error } = await adminDb.from("recovery_codes").insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ codes: plaintextCodes })
}
