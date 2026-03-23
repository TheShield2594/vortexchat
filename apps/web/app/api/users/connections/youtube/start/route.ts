import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

/**
 * GET /api/users/connections/youtube/start?next=/settings
 * Redirects the user to Google OAuth consent to authorize YouTube read access.
 * Requires GOOGLE_CLIENT_ID to be set.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: "YouTube connection is not configured" }, { status: 503 })
  }

  const url = new URL(request.url)
  const origin = url.origin
  const next = url.searchParams.get("next") || "/"
  const state = randomBytes(16).toString("hex")

  const callbackUrl = `${origin}/api/users/connections/youtube/callback`

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", callbackUrl)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly")
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("state", `${state}:${encodeURIComponent(next)}`)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set("youtube_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 60 * 10,
  })

  return response
}
