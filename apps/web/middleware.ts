import { NextResponse, type NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { updateSession } from "@/lib/supabase/middleware"

const PUBLIC_ROUTES = ["/login", "/register", "/api/auth", "/auth/callback"]

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
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

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|txt|xml)$).*)",
  ],
}
