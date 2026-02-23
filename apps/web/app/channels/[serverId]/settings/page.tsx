import { notFound, redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ServerSettingsAdmin } from "@/components/settings/server-settings-admin"
import type { RoleRow } from "@/types/database"

export default async function ServerSettingsPage({ params: paramsPromise }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await paramsPromise
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: member } = await supabase
    .from("server_members")
    .select("server_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .single()

  if (!member) notFound()

  const { data: server } = await supabase
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .single()

  if (!server) notFound()

  const { data: channels } = await supabase
    .from("channels")
    .select("id,name,type")
    .eq("server_id", serverId)

  const { data: memberRoles } = await supabase
    .from("member_roles")
    .select("role_id, roles(*)")
    .eq("server_id", serverId)
    .eq("user_id", user.id)

  type MemberRoleWithRole = { role_id: string; roles: RoleRow | null }
  const userRoles = ((memberRoles ?? []) as unknown as MemberRoleWithRole[])
    .map((mr) => mr.roles)
    .filter((r): r is RoleRow => r !== null)

  const isOwner = server.owner_id === user.id
  const canAccessAdminSettings = isOwner || userRoles.length > 0
  if (!canAccessAdminSettings) notFound()

  const webhookEligibleChannels = (channels ?? [])
    .filter((channel) => ["text", "announcement", "forum", "media"].includes(channel.type))
    .map((channel) => ({ id: channel.id, name: channel.name }))

  return (
    <ServerSettingsAdmin
      serverId={serverId}
      serverName={server.name}
      isOwner={isOwner}
      channels={webhookEligibleChannels}
    />
  )
}
