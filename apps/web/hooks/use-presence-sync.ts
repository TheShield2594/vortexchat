"use client"

import { useEffect, useMemo, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'

export function usePresenceSync(userId: string | null, status?: PresenceStatus) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const currentStatusRef = useRef<PresenceStatus>(status ?? "online")
  const explicitStatusRef = useRef<PresenceStatus>((status === "dnd" || status === "invisible") ? status : "online")
  const idleTimerRef = useRef<number | undefined>(undefined)
  const userIdRef = useRef<string | null>(null)

  const persistStatusRef = useRef<(nextStatus: PresenceStatus) => void>(() => {})

  useEffect(() => {
    if (status === "dnd" || status === "invisible") {
      explicitStatusRef.current = status
    }
  }, [status])

  useEffect(() => {
    if (!userId) return
    userIdRef.current = userId

    const persistStatus = (nextStatus: PresenceStatus) => {
      currentStatusRef.current = nextStatus
      if (nextStatus === "dnd" || nextStatus === "invisible") {
        explicitStatusRef.current = nextStatus
      }

      supabase
        .from("users")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .then()

      channelRef.current?.track({
        user_id: userId,
        status: nextStatus,
        online_at: new Date().toISOString(),
      })
    }

    persistStatusRef.current = persistStatus

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current)
      }
      idleTimerRef.current = undefined
    }

    const scheduleIdle = () => {
      clearIdleTimer()
      idleTimerRef.current = window.setTimeout(() => {
        if (document.hidden) return
        if (currentStatusRef.current === "online") persistStatus("idle")
      }, IDLE_TIMEOUT_MS)
    }

    const initialStatus = status ?? "online"
    persistStatus(initialStatus)

    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    })

    channelRef.current = channel

    channel
      .on("presence", { event: "sync" }, () => {})
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            status: currentStatusRef.current,
            online_at: new Date().toISOString(),
          })
        }
      })

    const onActivity = () => {
      if (currentStatusRef.current === "idle") {
        persistStatus("online")
      }
      scheduleIdle()
    }

    const onVisibility = () => {
      if (document.hidden) {
        persistStatus("offline")
        return
      }

      if (explicitStatusRef.current === "dnd" || explicitStatusRef.current === "invisible") {
        persistStatus(explicitStatusRef.current)
        return
      }

      persistStatus("online")
      scheduleIdle()
    }

    scheduleIdle()
    window.addEventListener("mousemove", onActivity)
    window.addEventListener("keydown", onActivity)
    window.addEventListener("focus", onActivity)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      clearIdleTimer()
      window.removeEventListener("mousemove", onActivity)
      window.removeEventListener("keydown", onActivity)
      window.removeEventListener("focus", onActivity)
      document.removeEventListener("visibilitychange", onVisibility)
      supabase.removeChannel(channel)
    }
  }, [userId, status, supabase])

  useEffect(() => {
    function handleBeforeUnload() {
      const currentUserId = userIdRef.current
      if (!currentUserId) return

      channelRef.current?.untrack()
      supabase
        .from("users")
        .update({ status: "offline", updated_at: new Date().toISOString() })
        .eq("id", currentUserId)
        .then()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [supabase])
}
