"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"

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

  useEffect(() => {
    if (!userId) {
      document.title = BASE_TITLE
      updateAppBadge(0)
      return
    }
    const unread = notificationUnreadCount + dmUnreadCount
    document.title = unread > 0 ? `(${unread}) VortexChat` : BASE_TITLE
    updateAppBadge(unread)
  }, [userId, notificationUnreadCount, dmUnreadCount])
}
