import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { ServerSidebar } from "@/components/layout/server-sidebar"
import { AppProvider } from "@/components/layout/app-provider"
import type { ServerRow } from "@/types/database"

export default async function ChannelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase, { data: { user }, error }] = await Promise.all([
    createServerSupabaseClient(),
    getAuthUser(),
  ])

  if (error || !user) {
    redirect("/login")
  }

  // Fetch user profile and servers in parallel
  const [{ data: profile }, { data: serverMembers }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).single(),
    supabase.from("server_members").select("server_id, servers(*)").eq("user_id", user.id).order("joined_at", { ascending: true }),
  ])

  type ServerMemberWithServer = { server_id: string; servers: ServerRow | null }
  const servers = ((serverMembers ?? []) as unknown as ServerMemberWithServer[])
    .map((m) => m.servers)
    .filter((s): s is ServerRow => s !== null)

  return (
    <AppProvider user={profile} servers={servers}>
      <div className="flex h-screen overflow-hidden" style={{ background: '#313338' }}>
        <ServerSidebar />
        {children}
      </div>
    </AppProvider>
  )
}
