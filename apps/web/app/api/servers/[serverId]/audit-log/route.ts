import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * GET /api/servers/[serverId]/audit-log
 *
 * Query parameters:
 *   limit      – max entries to return (default 50, max 100)
 *   before     – ISO timestamp for cursor-based pagination
 *   action     – filter by a specific action type (e.g. "member_ban")
 *   actor_id   – filter by the actor who performed the action
 *   target_id  – filter by the target of the action
 *
 * Only the server owner may view the audit log.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Only server owner can view audit log
  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  if (server?.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)
  const before = searchParams.get("before")
  const actionFilter = searchParams.get("action")
  const actorFilter = searchParams.get("actor_id")
  const targetFilter = searchParams.get("target_id")

  let query = supabase
    .from("audit_logs")
    .select("id, action, actor_id, target_id, target_type, changes, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) query = query.lt("created_at", before)
  if (actionFilter) query = query.eq("action", actionFilter)
  if (actorFilter) query = query.eq("actor_id", actorFilter)
  if (targetFilter) query = query.eq("target_id", targetFilter)

  const { data: entries, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries?.length) return NextResponse.json([])

  // Collect unique user IDs for actors and targets
  const userIds = new Set<string>()
  for (const e of entries) {
    if (e.actor_id) userIds.add(e.actor_id)
    if (e.target_id && e.target_type === "user") userIds.add(e.target_id)
  }

  const { data: users } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url")
    .in("id", Array.from(userIds))

  const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]))

  const result = entries.map((e) => ({
    id: e.id,
    action: e.action,
    reason: (e.changes as any)?.reason ?? null,
    metadata: e.changes,
    created_at: e.created_at,
    actor: e.actor_id ? userMap[e.actor_id] ?? null : null,
    target:
      e.target_id && e.target_type === "user"
        ? userMap[e.target_id] ?? null
        : null,
    target_id: e.target_id,
    target_type: e.target_type,
  }))

  return NextResponse.json(result)
}
