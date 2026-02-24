"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { usePresenceSync } from "@/hooks/use-presence-sync"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import type { UserRow, ServerRow } from "@/types/database"

interface AppProviderProps {
  user: UserRow | null
  servers: ServerRow[]
  children: React.ReactNode
}

/** Root client-side provider that seeds Zustand stores, syncs presence, applies appearance settings, and registers push notifications. */
export function AppProvider({ user, servers, children }: AppProviderProps) {
  const { setCurrentUser, setServers } = useAppStore(
    useShallow((s) => ({ setCurrentUser: s.setCurrentUser, setServers: s.setServers }))
  )
  const { messageDisplay, fontScale, saturation, themePreset, customCss, hydrateFromSettings } = useAppearanceStore(
    useShallow((s) => ({ messageDisplay: s.messageDisplay, fontScale: s.fontScale, saturation: s.saturation, themePreset: s.themePreset, customCss: s.customCss, hydrateFromSettings: s.hydrateFromSettings }))
  )

  useEffect(() => {
    setCurrentUser(user)
    setServers(servers)
    hydrateFromSettings(user?.appearance_settings as Parameters<typeof hydrateFromSettings>[0])
  }, [user, servers, setCurrentUser, setServers, hydrateFromSettings])

  // Apply appearance data-attributes to <html> so CSS selectors can pick them up
  useEffect(() => {
    const root = document.documentElement
    root.dataset.messageDisplay = messageDisplay
    root.dataset.fontScale = fontScale
    root.dataset.saturation = saturation
    root.dataset.themePreset = themePreset

    const customCssStyleId = "vortex-custom-theme-css"
    let styleTag = document.getElementById(customCssStyleId) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement("style")
      styleTag.id = customCssStyleId
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = customCss.trim()
  }, [messageDisplay, fontScale, saturation, themePreset, customCss])

  // Auto-sync presence: marks user online on mount, offline on tab close
  usePresenceSync(user?.id ?? null, user?.status ?? "online")

  // Register service worker + push notifications if previously granted
  usePushNotifications()

  return <>{children}</>
}
