/**
 * Server-side permission helpers.
 *
 * Use `getMemberPermissions` in API route handlers to resolve the effective
 * bitmask for the calling user without duplicating boilerplate.
 */
import { PERMISSIONS, hasPermission, computePermissions } from "@vortex/shared"
import type { SupabaseClient } from "@supabase/supabase-js"

export { PERMISSIONS, hasPermission, computePermissions }
export type { Permission } from "@vortex/shared"

export interface MemberPerms {
  /** True when the user is the server owner (bypasses all permission checks). */
  isOwner: boolean
  /** OR-combined bitmask of all roles the member holds. */
  permissions: number
  /** Convenience: true if isOwner OR has ADMINISTRATOR bit. */
  isAdmin: boolean
}

/**
 * Fetch the owner of `serverId` and the effective permission bitmask for `userId`
 * (ORed across every role assigned to the member).
 *
 * Returns `{ isOwner: false, permissions: 0, isAdmin: false }` when the user is
 * not a member of the server.
 */
export async function getMemberPermissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  serverId: string,
  userId: string
): Promise<MemberPerms> {
  const [{ data: server }, { data: member }] = await Promise.all([
    supabase.from("servers").select("owner_id").eq("id", serverId).single(),
    supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .single(),
  ])

  const isOwner = server?.owner_id === userId

  const rawPerms: number[] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (member as any)?.member_roles?.flatMap((mr: any) => mr.roles?.permissions ?? 0) ?? []

  const permissions = computePermissions(rawPerms)
  const isAdmin = isOwner || !!(permissions & PERMISSIONS.ADMINISTRATOR)

  return { isOwner, permissions, isAdmin }
}
