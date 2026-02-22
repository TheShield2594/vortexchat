/**
 * Shared server-side auth utilities for API route handlers.
 */
import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * Fixed UUID of the system/AutoMod bot user (seeded in 00015_system_bot.sql).
 * Used as author_id for system-generated messages such as AutoMod channel alerts
 * so they are not attributed to the violating member.
 */
export const SYSTEM_BOT_ID = "00000000-0000-0000-0000-000000000001"

export type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Aggregates permissions from a member_roles join result into a single
 * bitwise OR number.  Accepts the `member_roles` array as returned by
 * Supabase when selecting `member_roles(roles(permissions))`.
 */
export function aggregateMemberPermissions(memberRoles: unknown): number {
  if (!Array.isArray(memberRoles)) return 0
  return memberRoles
    .map((mr: any) => mr.roles?.permissions ?? 0)
    .reduce((acc: number, p: number) => acc | p, 0)
}

/**
 * Verifies that the authenticated user is the owner of the given server.
 *
 * Returns `{ supabase, user, error: null }` on success, or
 * `{ supabase, user, error: NextResponse }` when any check fails so callers
 * can do:
 *
 *   const { supabase, user, error } = await requireServerOwner(serverId)
 *   if (error) return error
 */
export async function requireServerOwner(serverId: string) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  if (!server)
    return { supabase, user, error: NextResponse.json({ error: "Server not found" }, { status: 404 }) }
  if (server.owner_id !== user.id)
    return { supabase, user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  return { supabase, user, error: null }
}
