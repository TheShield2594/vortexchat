/**
 * PUT    /api/servers/[serverId]/members/[userId]/timeout
 *   Apply or update a timeout for a member.
 *   Body: { duration_seconds: number, reason?: string }
 *
 * DELETE /api/servers/[serverId]/members/[userId]/timeout
 *   Remove an active timeout.
 *
 * Requires MODERATE_MEMBERS (permission bit 40) or ownership.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const MODERATE_MEMBERS = 1 << 10  // 1024

type Params = { params: Promise<{ serverId: string; userId: string }> }

async function checkModeratePermission(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  serverId: string,
  actorId: string,
  ownerId: string
): Promise<boolean> {
  if (actorId === ownerId) return true
  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", actorId)
    .single()

  const perms: number =
    (member as any)?.member_roles
      ?.flatMap((mr: any) => mr.roles?.permissions ?? 0)
      .reduce((acc: number, p: number) => acc | p, 0) ?? 0

  return (perms & MODERATE_MEMBERS) !== 0
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (userId === server.owner_id) return NextResponse.json({ error: "Cannot timeout the server owner" }, { status: 400 })

  const canModerate = await checkModeratePermission(supabase, serverId, user.id, server.owner_id)
  if (!canModerate) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { duration_seconds, reason } = await req.json()
  if (!duration_seconds || duration_seconds <= 0)
    return NextResponse.json({ error: "duration_seconds must be a positive number" }, { status: 400 })

  const until = new Date(Date.now() + duration_seconds * 1000).toISOString()

  const { error } = await supabase.from("member_timeouts").upsert(
    {
      server_id: serverId,
      user_id: userId,
      timed_out_until: until,
      moderator_id: user.id,
      reason: reason ?? null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "server_id,user_id" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "member_timeout",
    target_id: userId,
    target_type: "user",
    changes: { duration_seconds, reason: reason ?? null, until },
  })

  return NextResponse.json({ message: "Member timed out", until })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { serverId, userId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })

  const canModerate = await checkModeratePermission(supabase, serverId, user.id, server.owner_id)
  if (!canModerate) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase
    .from("member_timeouts")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "member_timeout_remove",
    target_id: userId,
    target_type: "user",
    changes: null,
  })

  return NextResponse.json({ message: "Timeout removed" })
}
