import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { hasValidStepUpToken } from "@/lib/auth/step-up"

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await createServiceRoleClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await hasValidStepUpToken(auth.user.id))) {
    return NextResponse.json({ error: "Step-up authentication required" }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { factorId?: string }
  if (!body.factorId) return NextResponse.json({ error: "factorId is required" }, { status: 400 })

  const result = await (admin.auth.admin as any).mfa.deleteFactor({
    userId: auth.user.id,
    id: body.factorId,
  })

  if (result?.error) {
    return NextResponse.json({ error: result.error.message || "Failed to disable MFA" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
