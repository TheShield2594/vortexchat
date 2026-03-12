import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { AppProvider } from "@/components/layout/app-provider"
import { ChannelsShell } from "@/components/layout/channels-shell"
import { MobileBottomTabBar } from "@/components/layout/mobile-bottom-tab-bar"
import { OnboardingGate } from "@/components/onboarding/onboarding-gate"
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
    console.error("Failed to load server memberships:", serverMembersError.message)
    redirect("/login")
  }

  const membershipIds = (serverMembers ?? []).map((membership) => membership.server_id)
  const serverListTimer = perfTimer("channels-layout server-list")
  const { data: serverRows, error: serversError } = membershipIds.length
    ? await supabase.from("servers").select("*").in("id", membershipIds)
    : { data: [], error: null }
  serverListTimer.end()

  if (serversError) {
    console.error("Failed to load servers:", serversError.message)
    redirect("/login")
  }

  const serversById = new Map((serverRows ?? []).map((server) => [server.id, server]))
  const servers = membershipIds
    .map((serverId) => serversById.get(serverId))
    .filter((server): server is ServerRow => Boolean(server))

  rootTimer.end()

  // Show onboarding for first-time users (no servers, haven't completed onboarding)
  const needsOnboarding = servers.length === 0 && !profile.onboarding_completed_at

  return (
    <AppProvider user={profile} servers={servers}>
      {needsOnboarding ? (
        <OnboardingGate username={profile.display_name || profile.username} userId={profile.id} />
      ) : (
        <>
          <ChannelsShell>
            {children}
          </ChannelsShell>
          <MobileBottomTabBar />
        </>
      )}
    </AppProvider>
  )
}
