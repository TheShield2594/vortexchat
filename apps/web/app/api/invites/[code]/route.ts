import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { SYSTEM_BOT_ID } from "@/lib/server-auth"
import { rateLimiter } from "@/lib/rate-limit"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  try {
    const params = await paramsPromise
    const supabase = await createServerSupabaseClient()

    // Rate limit: 20 invite lookups per minute per IP (prevents invite code enumeration)
    const forwarded = request.headers.get("x-forwarded-for")
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown"
    const rl = await rateLimiter.check(`invite-lookup:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 })
    }

    const code = params.code.toLowerCase()

    // Try invite_code first, then vanity_url
    let server: { id: string; name: string; icon_url: string | null; description: string | null } | null = null

    const { data: byCode } = await supabase
      .from("servers")
      .select("id, name, icon_url, description")
      .eq("invite_code", code)
      .maybeSingle()

    if (byCode) {
      server = byCode
    } else {
      const { data: byVanity } = await supabase
        .from("servers")
        .select("id, name, icon_url, description")
        .eq("vanity_url", code)
        .maybeSingle()
      server = byVanity
    }

    if (!server) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
    }

    // Get member count
    const { count } = await supabase
      .from("server_members")
      .select("*", { count: "exact", head: true })
      .eq("server_id", server.id)

    return NextResponse.json({ ...server, member_count: count })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  try {
    const params = await paramsPromise
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit: 10 join attempts per 5 minutes per user (prevents invite code brute-force)
    const rl = await rateLimiter.check(`invite-join:${user.id}`, { limit: 10, windowMs: 5 * 60_000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many join attempts. Please slow down." }, { status: 429 })
    }

    const code = params.code.toLowerCase()

    // Try invite_code first, then vanity_url
    let server: { id: string; name: string } | null = null

    const { data: byCode } = await supabase
      .from("servers")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle()

    if (byCode) {
      server = byCode
    } else {
      const { data: byVanity } = await supabase
        .from("servers")
        .select("id, name")
        .eq("vanity_url", code)
        .maybeSingle()
      server = byVanity
    }

    if (!server) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
    }

    const { error } = await supabase
      .from("server_members")
      .insert({ server_id: server.id, user_id: user.id })

    if (error && error.code !== "23505") {
      return NextResponse.json({ error: "Failed to join server" }, { status: 500 })
    }

    // Fire-and-forget: post welcome message if Welcome Bot is configured
    if (!error) {
      postWelcomeMessage(server.id, user.id).catch(() => {/* non-fatal */})
    }

    return NextResponse.json({ server_id: server.id, name: server.name })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Posts a welcome message in the configured welcome channel when a new member
 * joins and the Welcome Bot app is installed + configured on the server.
 */
async function postWelcomeMessage(serverId: string, userId: string): Promise<void> {
  const serviceClient = await createServiceRoleClient()

  // Check if welcome app is configured and enabled
  const { data: config } = await serviceClient
    .from("welcome_app_configs")
    .select("channel_id, welcome_message, rules, embed_color, enabled")
    .eq("server_id", serverId)
    .maybeSingle()

  if (!config || !config.enabled || !config.channel_id) return

  // Fetch user display name
  const { data: profile } = await serviceClient
    .from("users")
    .select("display_name, username")
    .eq("id", userId)
    .single()

  const memberName = profile?.display_name || profile?.username || "New Member"
  const message = config.welcome_message.replace(/{user}/g, `**${memberName}**`)

  const rules = Array.isArray(config.rules) ? config.rules as string[] : []
  const rulesSection = rules.length > 0
    ? "\n\n**Server Rules**\n" + rules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")
    : ""

  await serviceClient.from("messages").insert({
    channel_id: config.channel_id,
    author_id: SYSTEM_BOT_ID,
    content: message + rulesSection,
  })
}
