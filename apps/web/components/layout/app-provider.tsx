"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { useApplyAppearance } from "@/hooks/use-apply-appearance"
import { usePresenceSync } from "@/hooks/use-presence-sync"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { useTabUnreadTitle } from "@/hooks/use-tab-unread-title"
import { useGifAutoplay } from "@/hooks/use-gif-autoplay"
import { prefetchNotificationPreferences, clearPreferencesCache } from "@/hooks/use-notification-preferences"
import { useDmNotificationSound } from "@/hooks/use-dm-notification-sound"
import { setActiveChannel as setNotifManagerActiveChannel } from "@/lib/notification-manager"
import type { UserRow, ServerRow } from "@/types/database"

interface AppProviderProps {
  user: UserRow | null
  servers: ServerRow[]
  children: React.ReactNode
}

/** Root client-side provider that seeds Zustand stores, syncs presence, applies appearance settings, and registers push notifications. */
export function AppProvider({ user, servers, children }: AppProviderProps) {
  const { setCurrentUser, setServers, setIsLoadingServers, loadNotificationSettings } = useAppStore(
    useShallow((s) => ({ setCurrentUser: s.setCurrentUser, setServers: s.setServers, setIsLoadingServers: s.setIsLoadingServers, loadNotificationSettings: s.loadNotificationSettings }))
  )
  const { gifAutoplay, hydrateFromSettings } = useAppearanceStore(
    useShallow((s) => ({
      gifAutoplay: s.gifAutoplay,
      hydrateFromSettings: s.hydrateFromSettings,
    }))
  )

  // Apply all appearance data-attributes and CSS custom properties to <html>
  useApplyAppearance()

  useEffect(() => {
    setCurrentUser(user)
    setServers(servers)
    setIsLoadingServers(false)
    hydrateFromSettings(user?.appearance_settings as Parameters<typeof hydrateFromSettings>[0], user?.id ?? null)
    if (user) {
      void loadNotificationSettings()
      // Pre-warm notification preferences cache (sound_enabled, quiet hours, etc.)
      prefetchNotificationPreferences()
    } else {
      // Clear cached prefs on logout so next user doesn't inherit stale values
      clearPreferencesCache()
    }
  }, [user, servers, setCurrentUser, setServers, setIsLoadingServers, hydrateFromSettings, loadNotificationSettings])

  // Auto-sync presence: marks user online on mount, offline on tab close
  usePresenceSync(user?.id ?? null, user?.status ?? "online")

  // GIF autoplay: freeze/restore GIF images based on user preference
  useGifAutoplay(gifAutoplay)

  // Register service worker + push notifications if previously granted
  usePushNotifications()
  useTabUnreadTitle(user?.id ?? null)

  // Global DM notification sound — always mounted so DM sounds fire even on server pages
  useDmNotificationSound(user?.id ?? null)

  // Sync Zustand activeChannelId to the notification manager so it can
  // suppress sounds/notifications when the user is viewing a channel
  const activeChannelId = useAppStore((s) => s.activeChannelId)
  useEffect(() => {
    setNotifManagerActiveChannel(activeChannelId)
  }, [activeChannelId])

  return <>{children}</>
}
