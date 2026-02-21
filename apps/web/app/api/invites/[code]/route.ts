import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

async function resolveInvite(supabase: ReturnType<typeof createServerSupabaseClient>, code: string) {
  // Check new invites table first
  const { data: invite } = await supabase
    .from("invites")
    .select("*")
    .eq("code", code)
    .single()

  if (invite) {
    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { error: "This invite link has expired", status: 410 }
    }
    // Check max uses
    if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
      return { error: "This invite link has reached its maximum uses", status: 410 }
    }
    const { data: server } = await supabase
      .from("servers")
      .select("id, name, icon_url, description")
      .eq("id", invite.server_id)
      .single()
    if (!server) return { error: "Server not found", status: 404 }
    return { server, inviteId: invite.code, inviteUses: invite.uses }
  }

  // Fall back to legacy servers.invite_code
  const { data: server } = await supabase
    .from("servers")
    .select("id, name, icon_url, description")
    .eq("invite_code", code.toLowerCase())
    .single()

  if (!server) return { error: "Invalid invite code", status: 404 }

  return { server, inviteId: null, inviteUses: null }
}

export async function GET(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const supabase = createServerSupabaseClient()
  const result = await resolveInvite(supabase, params.code)

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { count } = await supabase
    .from("server_members")
    .select("*", { count: "exact", head: true })
    .eq("server_id", result.server.id)

  return NextResponse.json({ ...result.server, member_count: count })
}

export async function POST(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await resolveInvite(supabase, params.code)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Check if already banned
  const { data: ban } = await supabase
    .from("server_bans")
    .select("user_id")
    .eq("server_id", result.server.id)
    .eq("user_id", user.id)
    .single()

  if (ban) {
    return NextResponse.json({ error: "You are banned from this server" }, { status: 403 })
  }

  const { error } = await supabase
    .from("server_members")
    .insert({ server_id: result.server.id, user_id: user.id })

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Increment invite uses
  if (result.inviteId) {
    await supabase
      .from("invites")
      .update({ uses: (result.inviteUses ?? 0) + 1 })
      .eq("code", result.inviteId)
  }

  return NextResponse.json({ server_id: result.server.id, name: result.server.name })
}
