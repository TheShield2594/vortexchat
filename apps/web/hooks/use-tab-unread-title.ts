"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"

const BASE_TITLE = "VortexChat — Chat, Hang Out, Belong"

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
      return
    }
    const unread = notificationUnreadCount + dmUnreadCount
    document.title = unread > 0 ? `(${unread}) VortexChat` : BASE_TITLE
  }, [userId, notificationUnreadCount, dmUnreadCount])
}
