"use client"

import { useEffect, useMemo, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

export function usePresenceSync(userId: string | null, status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline') {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!userId) return
    const currentUserId = userId

    let currentStatus: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline' = status ?? "online"
    let idleTimer: number | undefined

    const persistStatus = (nextStatus: typeof currentStatus) => {
      currentStatus = nextStatus
      supabase
        .from("users")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", currentUserId)
        .then()

      channelRef.current?.track({
        user_id: currentUserId,
        status: nextStatus,
        online_at: new Date().toISOString(),
      })
    }

    const scheduleIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        if (document.hidden) return
        if (currentStatus === "online") persistStatus("idle")
      }, IDLE_TIMEOUT_MS)
    }

    persistStatus(status ?? "online")

    const channel = supabase.channel("presence:global", {
      config: { presence: { key: currentUserId } },
    })

    channelRef.current = channel

    channel
      .on("presence", { event: "sync" }, () => {})
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUserId,
            status: currentStatus,
            online_at: new Date().toISOString(),
          })
        }
      })

    const onActivity = () => {
      if (currentStatus === "idle") persistStatus("online")
      scheduleIdle()
    }

    const onVisibility = () => {
      if (document.hidden) {
        persistStatus("offline")
      } else {
        persistStatus("online")
        scheduleIdle()
      }
    }

    function handleBeforeUnload() {
      channel.untrack()
      supabase
        .from("users")
        .update({ status: "offline", updated_at: new Date().toISOString() })
        .eq("id", currentUserId)
        .then()
    }

    scheduleIdle()
    window.addEventListener("mousemove", onActivity)
    window.addEventListener("keydown", onActivity)
    window.addEventListener("focus", onActivity)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      window.removeEventListener("mousemove", onActivity)
      window.removeEventListener("keydown", onActivity)
      window.removeEventListener("focus", onActivity)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      handleBeforeUnload()
      supabase.removeChannel(channel)
    }
  }, [userId, status, supabase])
}
