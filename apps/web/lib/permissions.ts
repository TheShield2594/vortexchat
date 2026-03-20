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
  /** True when the user has a row in server_members for this server. */
  isMember: boolean
  /** OR-combined bitmask of all roles the member holds. */
  permissions: number
  /** Convenience: true if isOwner OR has ADMINISTRATOR bit. */
  isAdmin: boolean
  /** The server owner's user ID, or null if the server row was not found. */
  ownerId: string | null
  /** Whether the server has member screening enabled. */
  screeningEnabled: boolean
}

/**
 * Fetch the owner of `serverId` and the effective permission bitmask for `userId`
 * (ORed across every role assigned to the member).
 *
 * Returns `{ isOwner: false, isMember: false, permissions: 0, isAdmin: false, ownerId: null, screeningEnabled: false }`
 * when the user is not a member of the server.
 *
 * Throws on infrastructure (DB) failures so callers surface a 500 instead of
 * silently falling back to deny-all.
 */
export async function getMemberPermissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  serverId: string,
  userId: string
): Promise<MemberPerms> {
  const [{ data: server, error: serverError }, { data: member, error: memberError }, { data: defaultRole, error: defaultRoleError }] = await Promise.all([
    supabase.from("servers").select("owner_id, screening_enabled").eq("id", serverId).single(),
    supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("roles").select("permissions").eq("server_id", serverId).eq("is_default", true).maybeSingle(),
  ])

  if (serverError) throw new Error(`Failed to fetch server: ${serverError.message}`)
  if (memberError) throw new Error(`Failed to fetch member: ${memberError.message}`)
  if (defaultRoleError) throw new Error(`Failed to fetch default role: ${defaultRoleError.message}`)

  const ownerId: string | null = server?.owner_id ?? null
  const isOwner = ownerId === userId
  const isMember = member !== null || isOwner

  const rawPerms: number[] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (member as any)?.member_roles?.flatMap((mr: any) =>
      mr.roles?.permissions != null ? [mr.roles.permissions] : []
    ) ?? []

  // Only include default role permissions for actual members — non-members
  // must not inherit any server permissions from the @everyone role.
  if (isMember && defaultRole?.permissions != null) rawPerms.push(defaultRole.permissions)

  const permissions = computePermissions(rawPerms)
  const isAdmin = isOwner || !!(permissions & PERMISSIONS.ADMINISTRATOR)
  const screeningEnabled: boolean = !!(server as any)?.screening_enabled

  return { isOwner, isMember, permissions, isAdmin, ownerId, screeningEnabled }
}

/**
 * Resolve a member's effective permissions for a specific channel by applying
 * role-level channel overwrite rows (deny first, then allow).
 */
export async function getChannelPermissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  serverId: string,
  channelId: string,
  userId: string
): Promise<MemberPerms> {
  const [memberPerms, memberRolesResult, defaultRoleResult, overwritesResult] = await Promise.all([
    getMemberPermissions(supabase, serverId, userId),
    supabase.from("member_roles").select("role_id").eq("server_id", serverId).eq("user_id", userId),
    supabase.from("roles").select("id").eq("server_id", serverId).eq("is_default", true).maybeSingle(),
    supabase.from("channel_permissions").select("role_id, allow_permissions, deny_permissions").eq("channel_id", channelId),
  ])

  if (memberRolesResult.error) throw new Error(`Failed to fetch member roles: ${memberRolesResult.error.message}`)
  if (defaultRoleResult.error) throw new Error(`Failed to fetch default role: ${defaultRoleResult.error.message}`)
  if (overwritesResult.error) throw new Error(`Failed to fetch channel overrides: ${overwritesResult.error.message}`)

  if (memberPerms.isOwner || memberPerms.isAdmin) {
    return memberPerms
  }

  const roleIds = new Set((memberRolesResult.data ?? []).map((r) => r.role_id))
  const defaultRoleId = defaultRoleResult.data?.id ?? null
  if (defaultRoleId) roleIds.add(defaultRoleId)
  if (roleIds.size === 0) return memberPerms

  const relevantOverwrites = (overwritesResult.data ?? []).filter((row) => roleIds.has(row.role_id))

  const denyMask = relevantOverwrites.reduce((acc, row) => acc | (row.deny_permissions ?? 0), 0)
  const allowMask = relevantOverwrites.reduce((acc, row) => acc | (row.allow_permissions ?? 0), 0)
  const permissions = (memberPerms.permissions & ~denyMask) | allowMask

  return { ...memberPerms, permissions }
}
