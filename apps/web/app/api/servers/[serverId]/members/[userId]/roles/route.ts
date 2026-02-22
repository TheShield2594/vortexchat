import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

// POST /api/servers/[serverId]/members/[userId]/roles — assign a role to a member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; userId: string }> }
) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify caller is owner or has MANAGE_ROLES permission
  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_ROLES")) {
    return NextResponse.json({ error: "Missing MANAGE_ROLES permission" }, { status: 403 })
  }

  const { roleId } = await req.json()
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

  const { error } = await supabase
    .from("member_roles")
    .insert({ server_id: serverId, user_id: userId, role_id: roleId })

  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true }) // already assigned
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/servers/[serverId]/members/[userId]/roles?roleId=... — remove a role
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; userId: string }> }
) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_ROLES")) {
    return NextResponse.json({ error: "Missing MANAGE_ROLES permission" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const roleId = searchParams.get("roleId")
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

  const { error } = await supabase
    .from("member_roles")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .eq("role_id", roleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
