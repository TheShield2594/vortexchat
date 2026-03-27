import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * POST /api/onboarding/complete
 *
 * Marks the authenticated user's onboarding as complete by setting
 * `onboarding_completed_at` to the current timestamp.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id)

    if (updateError) {
      console.error("Onboarding complete failed:", { userId: user.id, error: updateError.message })
      return NextResponse.json({ error: "Failed to update onboarding status" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
