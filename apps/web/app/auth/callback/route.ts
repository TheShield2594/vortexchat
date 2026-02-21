import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next") ?? ""
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/channels/me"

  if (code) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("Auth callback: code exchange failed", error)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
