import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { SettingsResponsiveContent } from "@/components/settings/settings-responsive-content"

/** Full-page settings layout — two-panel on desktop, stacked nav on mobile */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [supabase, { data: { user }, error }] = await Promise.all([
    createServerSupabaseClient(),
    getAuthUser(),
  ])

  if (error || !user) redirect("/login")

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) redirect("/login")

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--theme-bg-primary)" }}
    >
      <SettingsResponsiveContent user={profile}>
        {children}
      </SettingsResponsiveContent>
    </div>
  )
}
