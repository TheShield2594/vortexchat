"use client"

import { useEffect, useMemo } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"

/**
 * Syncs the global notification unread count to Zustand on mount and via
 * realtime. This ensures the mobile bottom tab bar badge shows the correct
 * count even when NotificationBell is not mounted (e.g. on mobile home screens).
 */
export function useNotificationCountSync(userId: string | null): void {
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  useEffect(() => {
    if (!userId) return

    // Fetch initial count
    async function fetchCount(): Promise<void> {
      try {
        const res = await fetch("/api/notifications/unread-count")
        if (!res.ok) return
        const data = await res.json() as { count?: number }
        if (typeof data.count === "number") {
          useAppStore.setState({ notificationUnreadCount: data.count })
        }
      } catch {
        // silently ignore — NotificationBell will also sync when mounted
      }
    }
    void fetchCount()

    // Realtime subscription to keep count in sync
    const ch = supabase
      .channel(`notif-count-sync:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          useAppStore.setState((state) => ({
            notificationUnreadCount: (state.notificationUnreadCount ?? 0) + 1,
          }))
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const old = payload.old as { read?: boolean }
          if (old.read === false) {
            useAppStore.setState((state) => ({
              notificationUnreadCount: Math.max(0, (state.notificationUnreadCount ?? 0) - 1),
            }))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId, supabase])
}
