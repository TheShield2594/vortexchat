"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { usePresenceSync } from "@/hooks/use-presence-sync"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { useTabUnreadTitle } from "@/hooks/use-tab-unread-title"
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
  const {
    messageDisplay, fontScale, saturation, themePreset, reducedMotion, customCss,
    fontFamily, lineHeight, codeFont, colorMode, chatBubbleStyle, messageGrouping,
    emojiSize, accentColorOverride, highContrast, gifAutoplay, linkPreviews,
    imagePreviews, notificationBadgeStyle, focusIndicator, hydrateFromSettings,
  } = useAppearanceStore(
    useShallow((s) => ({
      messageDisplay: s.messageDisplay, fontScale: s.fontScale, saturation: s.saturation,
      themePreset: s.themePreset, reducedMotion: s.reducedMotion, customCss: s.customCss,
      fontFamily: s.fontFamily, lineHeight: s.lineHeight, codeFont: s.codeFont,
      colorMode: s.colorMode, chatBubbleStyle: s.chatBubbleStyle, messageGrouping: s.messageGrouping,
      emojiSize: s.emojiSize, accentColorOverride: s.accentColorOverride, highContrast: s.highContrast,
      gifAutoplay: s.gifAutoplay, linkPreviews: s.linkPreviews, imagePreviews: s.imagePreviews,
      notificationBadgeStyle: s.notificationBadgeStyle, focusIndicator: s.focusIndicator,
      hydrateFromSettings: s.hydrateFromSettings,
    }))
  )

  useEffect(() => {
    setCurrentUser(user)
    setServers(servers)
    setIsLoadingServers(false)
    hydrateFromSettings(user?.appearance_settings as Parameters<typeof hydrateFromSettings>[0], user?.id ?? null)
    if (user) void loadNotificationSettings()
  }, [user, servers, setCurrentUser, setServers, setIsLoadingServers, hydrateFromSettings, loadNotificationSettings])

  // Apply appearance data-attributes to <html> so CSS selectors can pick them up
  useEffect(() => {
    const root = document.documentElement
    root.dataset.messageDisplay = messageDisplay
    root.dataset.fontScale = fontScale
    root.dataset.saturation = saturation
    root.dataset.themePreset = themePreset
    root.dataset.reducedMotion = reducedMotion
    root.dataset.fontFamily = fontFamily
    root.dataset.lineHeight = lineHeight
    root.dataset.codeFont = codeFont
    root.dataset.colorMode = colorMode
    root.dataset.chatBubbleStyle = chatBubbleStyle
    root.dataset.messageGrouping = messageGrouping
    root.dataset.emojiSize = emojiSize
    root.dataset.highContrast = String(highContrast)
    root.dataset.gifAutoplay = String(gifAutoplay)
    root.dataset.linkPreviews = String(linkPreviews)
    root.dataset.imagePreviews = String(imagePreviews)
    root.dataset.notificationBadgeStyle = notificationBadgeStyle
    root.dataset.focusIndicator = focusIndicator

    // Apply accent color override as a CSS variable
    if (accentColorOverride) {
      root.style.setProperty("--theme-accent-override", accentColorOverride)
      root.style.setProperty("--theme-accent", accentColorOverride)
    } else {
      root.style.removeProperty("--theme-accent-override")
    }

    const customCssStyleId = "vortex-custom-theme-css"
    let styleTag = document.getElementById(customCssStyleId) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement("style")
      styleTag.id = customCssStyleId
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = customCss.trim()
    // No cleanup: attributes and style tag persist until the app unmounts (page unload).
    // Removing them on every dependency change caused a visible theme flash on each re-render.
  }, [
    messageDisplay, fontScale, saturation, themePreset, reducedMotion, customCss,
    fontFamily, lineHeight, codeFont, colorMode, chatBubbleStyle, messageGrouping,
    emojiSize, accentColorOverride, highContrast, gifAutoplay, linkPreviews,
    imagePreviews, notificationBadgeStyle, focusIndicator,
  ])

  // Auto-sync presence: marks user online on mount, offline on tab close
  usePresenceSync(user?.id ?? null, user?.status ?? "online")

  // Register service worker + push notifications if previously granted
  usePushNotifications()
  useTabUnreadTitle(user?.id ?? null)

  return <>{children}</>
}
