import { NextResponse } from "next/server"
import { randomBytes } from "crypto"

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const next = url.searchParams.get("next") || "/"
  const callbackUrl = `${origin}/api/users/connections/steam/callback`

  const state = randomBytes(16).toString("hex")

  const authUrl = new URL(STEAM_OPENID_URL)
  authUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0")
  authUrl.searchParams.set("openid.mode", "checkid_setup")
  authUrl.searchParams.set("openid.return_to", `${callbackUrl}?next=${encodeURIComponent(next)}&state=${state}`)
  authUrl.searchParams.set("openid.realm", origin)
  authUrl.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select")
  authUrl.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select")

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set("steam_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 60 * 10,
  })

  return response
}
