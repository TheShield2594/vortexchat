import { NextResponse, type NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { updateSession } from "@/lib/supabase/middleware"

// Routes that use their own auth (bearer tokens, URL tokens) — skip session
// handling entirely so external callers are never redirected or delayed.
const PASSTHROUGH_ROUTES = [
  "/api/cron",
  "/api/channels/cleanup",
  "/api/webhooks",
  "/api/health",
]

// Routes that are public but still benefit from session refresh (login page, etc.)
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/api/auth",
  "/auth/callback",
  "/invite",
  "/verify-email",
  "/terms",
  "/privacy",
]

// HTTP methods that mutate state — require origin validation on API routes
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// Request body size limits (bytes). File-upload routes get a higher ceiling;
// everything else caps at 1 MB which is generous for JSON payloads.
const MAX_BODY_BYTES = 1 * 1024 * 1024         // 1 MB — JSON routes
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024       // 10 MB — file upload routes
const UPLOAD_ROUTES = ["/api/servers/", "/api/webhooks"]  // routes that accept formData

/**
 * CSRF protection: verify that mutation requests to /api/* originate from our
 * own domain. Checks the Origin header first, then falls back to Referer.
 * Returns true if the request is safe, false if it should be blocked.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  const expectedOrigin = request.nextUrl.origin

  if (origin) {
    return origin === expectedOrigin
  }

  // Some older browsers omit Origin on same-origin POST — fall back to Referer
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin
    } catch {
      return false
    }
  }

  // No Origin or Referer — block the request (defense-in-depth)
  return false
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Machine-to-machine endpoints — pass through with zero Supabase overhead
  // (these authenticate via bearer token / URL token, not cookies)
  if (PASSTHROUGH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // CSRF: block cross-origin mutations to API routes
  if (pathname.startsWith("/api/") && MUTATION_METHODS.has(request.method)) {
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: "Cross-origin request blocked" },
        { status: 403 },
      )
    }
  }

  // Request body size guard — reject oversized payloads before they hit route handlers.
  // Treat absent or non-numeric Content-Length as untrusted and reject it so
  // chunked/forged requests cannot bypass the limit.
  if (pathname.startsWith("/api/") && MUTATION_METHODS.has(request.method)) {
    const raw = request.headers.get("content-length")
    const contentLength = raw !== null && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN
    const isUploadRoute = UPLOAD_ROUTES.some((route) => pathname.startsWith(route))
    const limit = isUploadRoute ? MAX_UPLOAD_BYTES : MAX_BODY_BYTES
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > limit) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      )
    }
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
    // API clients expect JSON, not a redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "email_unverified" }, { status: 403 })
    }
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
