/**
 * DELETE /api/servers/[serverId]/members/[userId]
 *   Kick a member from the server.  Requires KICK_MEMBERS permission or ownership.
 *
 * GET /api/servers/[serverId]/members/[userId]
 *   Fetch a single member's profile including timeout status.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { aggregateMemberPermissions } from "@/lib/server-auth"

const KICK_MEMBERS = 8

type Params = { params: Promise<{ serverId: string; userId: string }> }

async function getMemberPermissions(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, serverId: string, userId: string) {
  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .single()

  return aggregateMemberPermissions((member as any)?.member_roles ?? [])
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Must be a member to fetch others' profiles
  const { data: ownMembership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!ownMembership) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  const { data: member, error } = await supabase
    .from("server_members")
    .select("*, user:users(*), roles:member_roles(role_id, roles(*))")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .single()

  if (error || !member) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  // Include timeout status
  const { data: timeout } = await supabase
    .from("member_timeouts")
    .select("timed_out_until, reason, moderator_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle()

  const timedOut =
    timeout && new Date(timeout.timed_out_until) > new Date()
      ? { until: timeout.timed_out_until, reason: timeout.reason }
      : null

  return NextResponse.json({ ...member, timeout: timedOut })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const reason = searchParams.get("reason") ?? undefined

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (userId === server.owner_id) return NextResponse.json({ error: "Cannot kick the server owner" }, { status: 400 })

  const isOwner = server.owner_id === user.id
  if (!isOwner) {
    const perms = await getMemberPermissions(supabase, serverId, user.id)
    if ((perms & KICK_MEMBERS) === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Role hierarchy check: requester must outrank the target.
    // Fetch both members' role positions and compare.
    const [requesterRoles, targetRoles] = await Promise.all([
      supabase
        .from("member_roles")
        .select("roles(position)")
        .eq("server_id", serverId)
        .eq("user_id", user.id),
      supabase
        .from("member_roles")
        .select("roles(position)")
        .eq("server_id", serverId)
        .eq("user_id", userId),
    ])

    const requesterMaxPosition = (requesterRoles.data ?? []).reduce(
      (max: number, mr: any) => Math.max(max, mr.roles?.position ?? 0),
      0
    )
    const targetMaxPosition = (targetRoles.data ?? []).reduce(
      (max: number, mr: any) => Math.max(max, mr.roles?.position ?? 0),
      0
    )

    if (targetMaxPosition >= requesterMaxPosition) {
      return NextResponse.json(
        { error: "Cannot kick a member with equal or higher role" },
        { status: 403 }
      )
    }
  }

  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "member_kick",
    target_id: userId,
    target_type: "user",
    changes: { reason: reason ?? null },
  })

  return NextResponse.json({ message: "Member kicked" })
}
