import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { aggregateMemberPermissions } from "@/lib/server-auth"

export const BAN_MEMBERS = 16
export const ADMINISTRATOR = 128

export function canModerate(permissions: number): boolean {
  return (permissions & BAN_MEMBERS) !== 0 || (permissions & ADMINISTRATOR) !== 0
}

export async function requireModerator(serverId: string) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
      supabase,
      permissions: 0,
    }
  }

  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  const permissions = aggregateMemberPermissions((member as any)?.member_roles)
  if (!canModerate(permissions)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
      supabase,
      permissions,
    }
  }

  return { error: null, user, supabase, permissions }
}
