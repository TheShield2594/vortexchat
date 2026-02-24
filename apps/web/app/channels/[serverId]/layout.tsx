import { redirect, notFound } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { ChannelSidebar } from "@/components/layout/channel-sidebar"
import { ServerEmojiProvider } from "@/components/chat/server-emoji-context"
import type { RoleRow } from "@/types/database"

interface Props {
  children: React.ReactNode
  params: Promise<{ serverId: string }>
}

/** Server-rendered layout that verifies membership and renders the channel sidebar alongside the active channel. */
export default async function ServerLayout({ children, params: paramsPromise }: Props) {
  const params = await paramsPromise

  const [supabase, { data: { user }, error }] = await Promise.all([
    createServerSupabaseClient(),
    getAuthUser(),
  ])

  if (error || !user) redirect("/login")

  // Fetch membership, server, channels, and roles in parallel
  const [{ data: member }, { data: server }, { data: channels }, { data: memberRoles }] = await Promise.all([
    supabase.from("server_members").select("server_id").eq("server_id", params.serverId).eq("user_id", user.id).single(),
    supabase.from("servers").select("*").eq("id", params.serverId).single(),
    supabase.from("channels").select("*").eq("server_id", params.serverId).order("position", { ascending: true }),
    supabase.from("member_roles").select("role_id, roles(*)").eq("server_id", params.serverId).eq("user_id", user.id),
  ])

  if (!server) notFound()
  if (!member) notFound()

  type MemberRoleWithRole = { role_id: string; roles: RoleRow | null }
  const userRoles = ((memberRoles ?? []) as unknown as MemberRoleWithRole[])
    .map((mr) => mr.roles)
    .filter((r): r is RoleRow => r !== null)

  return (
    <ServerEmojiProvider serverId={params.serverId}>
      <div className="flex flex-1 overflow-hidden">
        <ChannelSidebar
          server={server}
          channels={channels ?? []}
          currentUserId={user.id}
          isOwner={server.owner_id === user.id}
          userRoles={userRoles}
        />
        {children}
      </div>
    </ServerEmojiProvider>
  )
}
