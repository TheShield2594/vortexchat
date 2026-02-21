import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const BAN_MEMBERS = 16
const KICK_MEMBERS = 8

function hasPermission(permissions: number, flag: number) {
  return (permissions & flag) !== 0
}

// GET /api/servers/[serverId]/bans — list bans
export async function GET(
  _req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Must be owner or have BAN permission
  const { data: member } = await supabase
    .from("server_members")
    .select("server_id, member_roles(roles(permissions))")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .single()

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  const isOwner = server?.owner_id === user.id
  const permissions = (member as any)?.member_roles
    ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
    .reduce((acc: number, p: number) => acc | p, 0) ?? 0

  if (!isOwner && !hasPermission(permissions, BAN_MEMBERS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: bans, error } = await supabase
    .from("server_bans")
    .select("*, user:users!server_bans_user_id_fkey(id, username, display_name, avatar_url), banned_by_user:users!server_bans_banned_by_fkey(id, username, display_name)")
    .eq("server_id", params.serverId)
    .order("banned_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(bans)
}

// POST /api/servers/[serverId]/bans — ban a user
export async function POST(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, reason } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (userId === server.owner_id) return NextResponse.json({ error: "Cannot ban the server owner" }, { status: 400 })

  const isOwner = server.owner_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", params.serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = (member as any)?.member_roles
      ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
      .reduce((acc: number, p: number) => acc | p, 0) ?? 0

    if (!hasPermission(permissions, BAN_MEMBERS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Remove from server first (kick)
  await supabase
    .from("server_members")
    .delete()
    .eq("server_id", params.serverId)
    .eq("user_id", userId)

  // Insert ban
  const { error } = await supabase
    .from("server_bans")
    .upsert({
      server_id: params.serverId,
      user_id: userId,
      banned_by: user.id,
      reason: reason ?? null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from("audit_logs").insert({
    server_id: params.serverId,
    actor_id: user.id,
    action: "member_ban",
    target_id: userId,
    target_type: "user",
    changes: { reason },
  })

  return NextResponse.json({ message: "User banned" })
}

// DELETE /api/servers/[serverId]/bans?userId= — unban
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  const isOwner = server?.owner_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", params.serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = (member as any)?.member_roles
      ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
      .reduce((acc: number, p: number) => acc | p, 0) ?? 0

    if (!hasPermission(permissions, BAN_MEMBERS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("server_bans")
    .delete()
    .eq("server_id", params.serverId)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: "User unbanned" })
}
