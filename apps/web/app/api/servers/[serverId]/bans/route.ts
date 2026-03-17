import { NextRequest, NextResponse } from "next/server"
import { requireAuth, insertAuditLog } from "@/lib/utils/api-helpers"
import { hasPermission as checkPermission } from "@vortex/shared"
import { aggregateMemberPermissions } from "@/lib/server-auth"

// GET /api/servers/[serverId]/bans — list bans
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  // Must be owner or have BAN permission
  const { data: member } = await supabase
    .from("server_members")
    .select("server_id, member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .single()

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  const isOwner = server?.owner_id === user.id
  const permissions = aggregateMemberPermissions((member as any)?.member_roles)

  if (!isOwner && !checkPermission(permissions, "BAN_MEMBERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: bans, error } = await supabase
    .from("server_bans")
    .select("*, user:users!server_bans_user_id_fkey(id, username, display_name, avatar_url), banned_by_user:users!server_bans_banned_by_fkey(id, username, display_name)")
    .eq("server_id", serverId)
    .order("banned_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(bans)
}

// POST /api/servers/[serverId]/bans — ban a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  const { userId, reason } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (userId === server.owner_id) return NextResponse.json({ error: "Cannot ban the server owner" }, { status: 400 })

  const isOwner = server.owner_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = aggregateMemberPermissions((member as any)?.member_roles)

    if (!checkPermission(permissions, "BAN_MEMBERS")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { data: existingBan, error: existingBanError } = await supabase
    .from("server_bans")
    .select("server_id, user_id, banned_by, reason, banned_at")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingBanError) return NextResponse.json({ error: existingBanError.message }, { status: 500 })

  const { error } = await supabase
    .from("server_bans")
    .upsert({
      server_id: serverId,
      user_id: userId,
      banned_by: user.id,
      reason: reason ?? null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: memberDeleteError } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)

  if (memberDeleteError) {
    let rollbackError: { message?: string } | null = null

    if (existingBan) {
      const rollbackResult = await supabase
        .from("server_bans")
        .upsert(existingBan)
      rollbackError = rollbackResult.error
    } else {
      const rollbackResult = await supabase
        .from("server_bans")
        .delete()
        .eq("server_id", serverId)
        .eq("user_id", userId)
      rollbackError = rollbackResult.error
    }

    console.warn("failed to remove member after ban", {
      serverId,
      userId,
      error: memberDeleteError.message,
      rollbackError: rollbackError?.message,
    })
    return NextResponse.json({ error: "Failed to ban user" }, { status: 500 })
  }

  const { error: voiceDeleteError } = await supabase
    .from("voice_states")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)

  if (voiceDeleteError) {
    console.warn("failed to remove voice state after ban", { serverId, userId, error: voiceDeleteError.message })
  }

  // Audit log
  await insertAuditLog(supabase, {
    server_id: serverId,
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
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  const isOwner = server?.owner_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .single()

    const permissions = aggregateMemberPermissions((member as any)?.member_roles)

    if (!checkPermission(permissions, "BAN_MEMBERS")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("server_bans")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: "User unbanned" })
}
