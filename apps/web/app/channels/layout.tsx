import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { ServerSidebar } from "@/components/layout/server-sidebar"
import { AppProvider } from "@/components/layout/app-provider"
import { MobileBottomTabBar } from "@/components/layout/mobile-bottom-tab-bar"
import type { ServerRow } from "@/types/database"
import { perfTimer } from "@/lib/perf"

/** Root layout for all /channels routes — authenticates the user, loads profile and server list, wraps children in AppProvider. */
export default async function ChannelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const rootTimer = perfTimer("channels-layout total")
  const authTimer = perfTimer("channels-layout auth")
  const [supabase, { data: { user }, error }] = await Promise.all([
    createServerSupabaseClient(),
    getAuthUser(),
  ])
  authTimer.end()

  if (error || !user) {
    redirect("/login")
  }

  // Fetch user profile and server memberships in parallel
  const profileTimer = perfTimer("channels-layout profile+memberships")
  const [{ data: profile, error: profileError }, { data: serverMembers, error: serverMembersError }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).single(),
    supabase.from("server_members").select("server_id, joined_at").eq("user_id", user.id).order("joined_at", { ascending: true }),
  ])
  profileTimer.end()

  if (profileError || !profile) redirect("/login")

  if (serverMembersError) {
    throw new Error(`Failed to load server memberships: ${serverMembersError.message}`)
  }

  const membershipIds = (serverMembers ?? []).map((membership) => membership.server_id)
  const serverListTimer = perfTimer("channels-layout server-list")
  const { data: serverRows, error: serversError } = membershipIds.length
    ? await supabase.from("servers").select("*").in("id", membershipIds)
    : { data: [], error: null }
  serverListTimer.end()

  if (serversError) {
    throw new Error(`Failed to load servers for membershipIds (${membershipIds.join(", ")}): ${serversError.message}`)
  }

  const serversById = new Map((serverRows ?? []).map((server) => [server.id, server]))
  const servers = membershipIds
    .map((serverId) => serversById.get(serverId))
    .filter((server): server is ServerRow => Boolean(server))

  rootTimer.end()

  return (
    <AppProvider user={profile} servers={servers}>
      <div className="flex h-screen overflow-hidden pb-16 md:pb-0" style={{ background: "var(--app-bg-primary)" }}>
        <div className="hidden md:flex">
          <ServerSidebar />
        </div>
        <div className="flex flex-1 min-w-0 overflow-hidden">{children}</div>
      </div>
      <MobileBottomTabBar />
    </AppProvider>
  )
}
