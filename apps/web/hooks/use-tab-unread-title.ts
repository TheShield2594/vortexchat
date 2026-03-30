"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useFaviconBadge } from "@/hooks/use-favicon-badge"

const BASE_TITLE = "VortexChat — Chat, Hang Out, Belong"

/** Post the unread count to the service worker so it can call navigator.setAppBadge(). */
function updateAppBadge(count: number) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "APP_UPDATE_BADGE", count })
    })
    .catch(() => {})
}

export function useTabUnreadTitle(userId: string | null) {
  const { notificationUnreadCount, dmUnreadCount } = useAppStore(
    useShallow((s) => ({
      notificationUnreadCount: s.notificationUnreadCount,
      dmUnreadCount: s.dmUnreadCount,
    }))
  )

  const unread = userId ? notificationUnreadCount + dmUnreadCount : 0

  // Update browser tab favicon with red badge dot when there are unreads
  useFaviconBadge(unread > 0)

  useEffect(() => {
    if (!userId) {
      document.title = BASE_TITLE
      updateAppBadge(0)
      return
    }
    document.title = unread > 0 ? `(${unread}) VortexChat` : BASE_TITLE
    updateAppBadge(unread)
  }, [userId, unread])
}
