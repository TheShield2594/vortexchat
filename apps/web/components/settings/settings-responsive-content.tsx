"use client"

import { useMobileLayout } from "@/hooks/use-mobile-layout"
import { SettingsMobileWrapper } from "./settings-mobile-wrapper"
import type { UserRow } from "@/types/database"

interface Props {
  user: UserRow
  children: React.ReactNode
}

/**
 * Renders settings children in exactly one branch — desktop or mobile —
 * so effects and queries in child pages only execute once.
 */
export function SettingsResponsiveContent({ user, children }: Props) {
  const isMobile = useMobileLayout()

  if (isMobile) {
    return (
      <SettingsMobileWrapper user={user}>
        {children}
      </SettingsMobileWrapper>
    )
  }

  return (
    <main
      id="settings-content"
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--theme-bg-primary)" }}
    >
      <div className="max-w-2xl mx-auto px-8 py-10">
        {children}
      </div>
    </main>
  )
}
