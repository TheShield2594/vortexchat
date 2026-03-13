import { NextResponse, type NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { updateSession } from "@/lib/supabase/middleware"

// Routes that use their own auth (bearer tokens, URL tokens) — skip session
// handling entirely so external callers are never redirected or delayed.
const PASSTHROUGH_ROUTES = [
  "/api/cron",
  "/api/channels/cleanup",
  "/api/webhooks",
]

// Routes that are public but still benefit from session refresh (login page, etc.)
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/api/auth",
  "/auth/callback",
  "/invite",
  "/verify-email",
]

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Machine-to-machine endpoints — pass through with zero Supabase overhead
  if (PASSTHROUGH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow public routes and marketing homepage
  if (pathname === "/" || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    try {
      const { response } = await updateSession(request)
      return response
    } catch {
      return NextResponse.next()
    }
  }

  // Update session and get user in a single call
  let response: NextResponse
  let user: User | null = null

  try {
    const result = await updateSession(request)
    response = result.response
    user = result.user
  } catch {
    // If Supabase is unreachable or misconfigured, fail open to login
    const loginUrl = new URL("/login", request.url)
    const dest = request.nextUrl.searchParams.get("redirect") || request.nextUrl.pathname
    loginUrl.searchParams.set("redirect", dest)
    return NextResponse.redirect(loginUrl)
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Block unverified users from accessing the app
  if (!user.email_confirmed_at) {
    const verifyUrl = new URL("/verify-email", request.url)
    return NextResponse.redirect(verifyUrl)
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|txt|xml)$).*)",
  ],
}
