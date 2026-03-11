import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { SettingsSidebar } from "@/components/settings/settings-sidebar"
import { SettingsMobileWrapper } from "@/components/settings/settings-mobile-wrapper"

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
      {/* Desktop: always show sidebar inline */}
      <div className="hidden md:flex flex-shrink-0">
        <SettingsSidebar user={profile} />
      </div>

      {/* Desktop: content panel */}
      <main
        id="settings-content"
        className="hidden md:block flex-1 overflow-y-auto"
        style={{ background: "var(--theme-bg-primary)" }}
      >
        <div className="max-w-2xl mx-auto px-8 py-10">
          {children}
        </div>
      </main>

      {/* Mobile: show either the sidebar nav or the content with a back button */}
      <SettingsMobileWrapper user={profile}>
        {children}
      </SettingsMobileWrapper>
    </div>
  )
}
