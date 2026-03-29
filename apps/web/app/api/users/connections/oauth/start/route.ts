import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { hasValidStepUpToken } from "@/lib/auth/step-up"

const OAUTH_PROVIDERS = new Set(["github", "reddit", "twitch"])

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await hasValidStepUpToken(auth.user.id))) {
      return NextResponse.json({ error: "Step-up authentication required" }, { status: 403 })
    }

    const { searchParams, origin } = new URL(request.url)
    const provider = (searchParams.get("provider") || "").toLowerCase()
    if (!OAUTH_PROVIDERS.has(provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 422 })

    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set("vtx_oauth_link_state", `${provider}:${state}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/",
    })

    const redirectTo = `${origin}/api/users/connections/oauth/callback?provider=${provider}&state=${state}`
    const { data, error } = await (supabase.auth as any).linkIdentity({ provider, options: { redirectTo } })
    if (error || !data?.url) {
      return NextResponse.json({ error: error?.message || "Unable to start link flow" }, { status: 500 })
    }

    return NextResponse.redirect(data.url)

  } catch (err) {
    console.error("[users/connections/oauth/start GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
