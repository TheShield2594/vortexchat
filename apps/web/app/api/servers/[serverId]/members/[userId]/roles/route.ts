import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"
import { getActorMaxRolePosition } from "@/lib/role-utils"

async function assertRoleMutationAllowed(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  serverId: string,
  actorUserId: string,
  roleId: string,
  denyMessage: string,
) {
  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, actorUserId)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_ROLES")) {
    return NextResponse.json({ error: "Missing MANAGE_ROLES permission" }, { status: 403 })
  }

  const { data: targetRole, error: roleError } = await supabase
    .from("roles")
    .select("position")
    .eq("id", roleId)
    .eq("server_id", serverId)
    .single()

  if (roleError) {
    if (roleError.code === "PGRST116") {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to fetch role" }, { status: 500 })
  }

  if (!targetRole) return NextResponse.json({ error: "Role not found" }, { status: 404 })

  if (isAdmin) return null

  const actorMaxPosition = await getActorMaxRolePosition(supabase, serverId, actorUserId)

  if (targetRole.position >= actorMaxPosition) {
    return NextResponse.json({ error: denyMessage }, { status: 403 })
  }

  return null
}

// POST /api/servers/[serverId]/members/[userId]/roles — assign a role to a member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; userId: string }> }
) {
  try {
    const { serverId, userId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { roleId } = await req.json()
    if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

    const permissionError = await assertRoleMutationAllowed(
      supabase,
      serverId,
      user.id,
      roleId,
      "Cannot assign a role at or above your own highest role"
    )
    if (permissionError) return permissionError

    const { data: roleData } = await supabase
      .from("roles")
      .select("id, name")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .single()

    const { error } = await supabase
      .from("member_roles")
      .insert({ server_id: serverId, user_id: userId, role_id: roleId })

    if (error) {
      if (error.code === "23505") return NextResponse.json({ ok: true }) // already assigned
      return NextResponse.json({ error: "Failed to assign role" }, { status: 500 })
    }

    const { error: auditErr } = await supabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "role_assigned",
      target_id: userId,
      target_type: "user",
      changes: {
        role_id: roleId,
        role_name: roleData?.name ?? null,
        before: { has_role: false },
        after: { has_role: true },
      },
    })
    if (auditErr) {
      console.error("[roles] Audit log insert failed for role_assigned", { serverId, userId, roleId, error: auditErr.message })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error("[servers/[serverId]/members/[userId]/roles POST] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/servers/[serverId]/members/[userId]/roles?roleId=... — remove a role
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; userId: string }> }
) {
  try {
    const { serverId, userId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const roleId = searchParams.get("roleId")
    if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

    const permissionError = await assertRoleMutationAllowed(
      supabase,
      serverId,
      user.id,
      roleId,
      "Cannot remove a role at or above your own highest role"
    )
    if (permissionError) return permissionError

    const { error } = await supabase
      .from("member_roles")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .eq("role_id", roleId)

    if (error) return NextResponse.json({ error: "Failed to remove role" }, { status: 500 })

    const { data: roleData } = await supabase
      .from("roles")
      .select("id, name")
      .eq("id", roleId)
      .eq("server_id", serverId)
      .single()

    const { error: removeAuditErr } = await supabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "role_removed",
      target_id: userId,
      target_type: "user",
      changes: {
        role_id: roleId,
        role_name: roleData?.name ?? null,
        before: { has_role: true },
        after: { has_role: false },
      },
    })
    if (removeAuditErr) {
      console.error("[roles] Audit log insert failed for role_removed", { serverId, userId, roleId, error: removeAuditErr.message })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error("[servers/[serverId]/members/[userId]/roles DELETE] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
