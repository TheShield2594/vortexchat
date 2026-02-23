"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { usePresenceSync } from "@/hooks/use-presence-sync"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import type { UserRow, ServerRow } from "@/types/database"

interface AppProviderProps {
  user: UserRow | null
  servers: ServerRow[]
  children: React.ReactNode
}

export function AppProvider({ user, servers, children }: AppProviderProps) {
  const { setCurrentUser, setServers } = useAppStore()
  const { messageDisplay, fontScale, saturation } = useAppearanceStore()

  useEffect(() => {
    setCurrentUser(user)
    setServers(servers)
  }, [user, servers, setCurrentUser, setServers])

  // Apply appearance data-attributes to <html> so CSS selectors can pick them up
  useEffect(() => {
    const root = document.documentElement
    root.dataset.messageDisplay = messageDisplay
    root.dataset.fontScale = fontScale
    root.dataset.saturation = saturation
  }, [messageDisplay, fontScale, saturation])

  // Auto-sync presence: marks user online on mount, offline on tab close
  usePresenceSync(user?.id ?? null, user?.status ?? "online")

  // Register service worker + push notifications if previously granted
  usePushNotifications()

  return <>{children}</>
}
