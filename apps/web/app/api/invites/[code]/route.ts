import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { SYSTEM_BOT_ID } from "@/lib/server-auth"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()

  const { data: server } = await supabase
    .from("servers")
    .select("id, name, icon_url, description")
    .eq("invite_code", params.code.toLowerCase())
    .single()

  if (!server) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
  }

  // Get member count
  const { count } = await supabase
    .from("server_members")
    .select("*", { count: "exact", head: true })
    .eq("server_id", server.id)

  return NextResponse.json({ ...server, member_count: count })
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: server } = await supabase
    .from("servers")
    .select("id, name")
    .eq("invite_code", params.code.toLowerCase())
    .single()

  if (!server) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
  }

  const { error } = await supabase
    .from("server_members")
    .insert({ server_id: server.id, user_id: user.id })

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget: post welcome message if Welcome Bot is configured
  if (!error) {
    postWelcomeMessage(server.id, user.id).catch(() => {/* non-fatal */})
  }

  return NextResponse.json({ server_id: server.id, name: server.name })
}

/**
 * Posts a welcome message in the configured welcome channel when a new member
 * joins and the Welcome Bot app is installed + configured on the server.
 */
async function postWelcomeMessage(serverId: string, userId: string) {
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
