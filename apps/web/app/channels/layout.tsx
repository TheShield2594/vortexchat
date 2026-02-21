import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { AppProvider } from "@/components/layout/app-provider"
import { ChannelsShell } from "@/components/layout/channels-shell"

export default async function ChannelsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
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

  const servers = serverMembers
    ?.map((m) => m.servers)
    .filter(Boolean) as any[] ?? []

  return (
    <AppProvider user={profile} servers={servers}>
      <ChannelsShell>
        {children}
      </ChannelsShell>
    </AppProvider>
  )
}
