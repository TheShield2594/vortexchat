import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
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

  // Use service role for the full member list payload because RLS policies can
  // legitimately scope user-token reads down to only the requester row.
  let adminSupabase
  try {
    adminSupabase = await createServiceRoleClient()
  } catch (error) {
    const errorId = crypto.randomUUID()
    const errorName = error instanceof Error ? error.name : "UnknownError"
    console.error(`[${errorId}] Failed to initialize service-role Supabase client for member list (${errorName})`)
    return NextResponse.json({ error: "Failed to initialize member list service" }, { status: 500 })
  }

  const { data: members, error } = await adminSupabase
    .from("server_members")
    .select(`
      server_id,
      user_id,
      nickname,
      user:users!server_members_user_id_fkey(
        id,
        username,
        display_name,
        avatar_url,
        status_message,
        bio,
        banner_color,
        custom_tag,
        created_at
      ),
      roles:member_roles(
        role_id,
        roles(
          id,
          server_id,
          name,
          color,
          permissions,
          position,
          created_at
        )
      )
    `)
    .eq("server_id", params.serverId)
    .order("nickname", { ascending: true, nullsFirst: false })
    .order("user_id", { ascending: true })

  if (error) {
    console.error("[members] GET query failed", { serverId: params.serverId, code: error.code, message: error.message, details: error.details })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(members, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
  })
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
    const { isOwner, isAdmin, permissions, ownerId } = await getMemberPermissions(supabase, params.serverId, user.id)

    if (!isAdmin && !hasPermission(permissions, "KICK_MEMBERS")) {
      return NextResponse.json({ error: "Missing KICK_MEMBERS permission" }, { status: 403 })
    }

    // Prevent kicking the server owner
    if (targetUserId === ownerId) {
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

  // Check MODERATE_MEMBERS permission; also get ownerId to avoid an extra servers query
  const { isOwner, isAdmin, permissions, ownerId } = await getMemberPermissions(supabase, params.serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MODERATE_MEMBERS")) {
    return NextResponse.json({ error: "Missing MODERATE_MEMBERS permission" }, { status: 403 })
  }

  // Prevent timing out the server owner
  if (targetUserId === ownerId) {
    return NextResponse.json({ error: "Cannot time out the server owner" }, { status: 400 })
  }

  // Non-owners cannot time out admins
  if (!isOwner) {
    const { permissions: targetPerms } = await getMemberPermissions(supabase, params.serverId, targetUserId)
    if (targetPerms & PERMISSIONS.ADMINISTRATOR) {
      return NextResponse.json({ error: "Cannot time out a member with Administrator" }, { status: 403 })
    }
  }

  // Persist to member_timeouts (the table messages/route.ts checks) via the
  // set_member_timeout SECURITY DEFINER function so no broad UPDATE policy is
  // required on server_members.
  const { error } = await supabase.rpc("set_member_timeout", {
    p_server_id: params.serverId,
    p_member_id: targetUserId,
    p_timeout_until: timeoutUntil ?? null,
    p_moderator_id: user.id,
    p_reason: null,
  })

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
