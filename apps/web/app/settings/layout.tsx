import { redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { SettingsSidebar } from "@/components/settings/settings-sidebar"

/** Full-page settings layout — two-panel: sidebar + content area */
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
      <SettingsSidebar user={profile} />
      <main
        id="settings-content"
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--theme-bg-primary)" }}
      >
        <div className="max-w-2xl mx-auto px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
