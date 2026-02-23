import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { AppProvider } from "@/components/layout/app-provider"
import { ChannelsShell } from "@/components/layout/channels-shell"
import type { ServerRow } from "@/types/database"

export default async function ChannelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/login")
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  // Fetch user's servers
  const { data: serverMembers } = await supabase
    .from("server_members")
    .select("server_id, servers(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })

  type ServerMemberWithServer = { server_id: string; servers: ServerRow | null }
  const servers = ((serverMembers ?? []) as unknown as ServerMemberWithServer[])
    .map((m) => m.servers)
    .filter((s): s is ServerRow => s !== null)

  return (
    <AppProvider user={profile} servers={servers}>
      <ChannelsShell>
        {children}
      </ChannelsShell>
    </AppProvider>
  )
}
