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
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("Auth callback: code exchange failed", error)
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) {
        console.error("Auth callback: getUser() failed", userError)
      } else if (user) {
        const { error: statusError } = await supabase.from("users").update({ status: "online" }).eq("id", user.id)
        if (statusError) {
          console.error("Auth callback: failed to set user status to online", statusError)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
