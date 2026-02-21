import { redirect, notFound } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ChannelSidebar } from "@/components/layout/channel-sidebar"
import type { RoleRow } from "@/types/database"

interface Props {
  children: React.ReactNode
  params: Promise<{ serverId: string }>
}

export default async function ServerLayout({ children, params: paramsPromise }: Props) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Verify user is member of this server
  const { data: member } = await supabase
    .from("server_members")
    .select("server_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .single()

  if (!member) notFound()

  // Fetch server with channels
  const { data: server } = await supabase
    .from("servers")
    .select("*")
    .eq("id", params.serverId)
    .single()

  if (!server) notFound()

  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .eq("server_id", params.serverId)
    .order("position", { ascending: true })

  // Fetch member's roles for permission checks
  const { data: memberRoles } = await supabase
    .from("member_roles")
    .select("role_id, roles(*)")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)

  const userRoles = memberRoles?.map((mr) => mr.roles).filter(Boolean) as unknown as RoleRow[] ?? []

  return (
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
  )
}
