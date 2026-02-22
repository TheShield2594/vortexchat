import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission, PERMISSIONS } from "@/lib/permissions"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Verify the requester is a member of this server
  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this server" }, { status: 403 })
  }

  const { data: members, error } = await supabase
    .from("server_members")
    .select(`
      *,
      user:users(*),
      roles:member_roles(role_id, roles(*))
    `)
    .eq("server_id", params.serverId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(members)
}

export async function DELETE(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get("userId")
  if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  // Allow self-removal (leaving) or require KICK_MEMBERS permission
  if (targetUserId !== user.id) {
    const { isOwner, permissions, isAdmin } = await getMemberPermissions(supabase, params.serverId, user.id)

    if (!isAdmin && !hasPermission(permissions, "KICK_MEMBERS")) {
      return NextResponse.json({ error: "Missing KICK_MEMBERS permission" }, { status: 403 })
    }

    // Prevent kicking the server owner
    const { data: server } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", params.serverId)
      .single()

    if (targetUserId === server?.owner_id) {
      return NextResponse.json({ error: "Cannot remove the server owner" }, { status: 400 })
    }

    // Non-owners cannot kick admins
    if (!isOwner) {
      const { permissions: targetPerms } = await getMemberPermissions(supabase, params.serverId, targetUserId)
      if (targetPerms & PERMISSIONS.ADMINISTRATOR) {
        return NextResponse.json({ error: "Cannot kick a member with Administrator" }, { status: 403 })
      }
    }
  }

  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", params.serverId)
    .eq("user_id", targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

/**
 * PATCH /api/servers/[serverId]/members?userId=...
 * Body: { timeoutUntil: ISO-string | null }
 *
 * Applies or removes a timeout (MODERATE_MEMBERS permission required).
 * Passing null clears the timeout early.
 */
export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get("userId")
  if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  let body: { timeoutUntil?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { timeoutUntil } = body

  // Validate duration: max 28 days, must be in the future (or null to clear)
  if (timeoutUntil !== null && timeoutUntil !== undefined) {
    const until = new Date(timeoutUntil)
    if (isNaN(until.getTime())) {
      return NextResponse.json({ error: "Invalid timeoutUntil value" }, { status: 400 })
    }
    const maxMs = 28 * 24 * 60 * 60 * 1000
    if (until.getTime() - Date.now() > maxMs) {
      return NextResponse.json({ error: "Timeout duration exceeds 28-day maximum" }, { status: 400 })
    }
    if (until.getTime() <= Date.now()) {
      return NextResponse.json({ error: "timeoutUntil must be in the future" }, { status: 400 })
    }
  }

  // Check MODERATE_MEMBERS permission
  const { isOwner, isAdmin, permissions } = await getMemberPermissions(supabase, params.serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MODERATE_MEMBERS")) {
    return NextResponse.json({ error: "Missing MODERATE_MEMBERS permission" }, { status: 403 })
  }

  // Prevent timing out the server owner or other admins (non-owners)
  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  if (targetUserId === server?.owner_id) {
    return NextResponse.json({ error: "Cannot time out the server owner" }, { status: 400 })
  }

  if (!isOwner) {
    const { permissions: targetPerms } = await getMemberPermissions(supabase, params.serverId, targetUserId)
    if (targetPerms & PERMISSIONS.ADMINISTRATOR) {
      return NextResponse.json({ error: "Cannot time out a member with Administrator" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("server_members")
    .update({ timeout_until: timeoutUntil ?? null })
    .eq("server_id", params.serverId)
    .eq("user_id", targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from("audit_logs").insert({
    server_id: params.serverId,
    actor_id: user.id,
    action: timeoutUntil ? "member_timeout" : "member_timeout_remove",
    target_id: targetUserId,
    target_type: "user",
    changes: { timeout_until: timeoutUntil ?? null },
  })

  return NextResponse.json({ success: true })
}
