import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerSupabaseClient } from "@/lib/supabase/server"

async function verifySteamAssertion(searchParams: URLSearchParams) {
  const verificationParams = new URLSearchParams(searchParams)
  verificationParams.set("openid.mode", "check_authentication")

  const response = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verificationParams.toString(),
    cache: "no-store",
  })

  if (!response.ok) return false
  const body = await response.text()
  return body.includes("is_valid:true")
}

function extractSteamId(claimedId: string | null) {
  if (!claimedId) return null
  const match = claimedId.match(/\/id\/(\d+)$/)
  return match?.[1] ?? null
}

function buildRedirect(base: URL, nextPath: string, status: string) {
  const target = new URL(nextPath, base.origin)
  target.searchParams.set("connections", status)
  return target
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const nextPath = url.searchParams.get("next") || "/"
  const state = url.searchParams.get("state")

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.redirect(buildRedirect(url, nextPath, "steam_auth_required"))
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get("steam_oauth_state")?.value

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(buildRedirect(url, nextPath, "steam_state_invalid"))
  }

  const isValid = await verifySteamAssertion(url.searchParams)
  if (!isValid) {
    return NextResponse.redirect(buildRedirect(url, nextPath, "steam_verification_failed"))
  }

  const steamId = extractSteamId(url.searchParams.get("openid.claimed_id"))
  if (!steamId) {
    return NextResponse.redirect(buildRedirect(url, nextPath, "steam_missing_id"))
  }

  const { error } = await supabase
    .from("user_connections")
    .upsert({
      user_id: user.id,
      provider: "steam",
      provider_user_id: steamId,
      username: steamId,
      display_name: `Steam #${steamId}`,
      profile_url: `https://steamcommunity.com/profiles/${steamId}`,
      metadata: { linked_via: "openid" },
    }, { onConflict: "user_id,provider" })

  const response = NextResponse.redirect(buildRedirect(url, nextPath, error ? "steam_save_failed" : "steam_linked"))
  response.cookies.delete("steam_oauth_state")
  return response
}
