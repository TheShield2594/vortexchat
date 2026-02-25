"use client"

import { useEffect, useMemo, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'

function resolveInitialPresenceStatus(status?: PresenceStatus): PresenceStatus {
  return status === "idle" || status === "dnd" || status === "invisible" ? status : "online"
}

export function usePresenceSync(userId: string | null, status?: PresenceStatus) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const currentStatusRef = useRef<PresenceStatus>(resolveInitialPresenceStatus(status))
  const explicitStatusRef = useRef<PresenceStatus>(resolveInitialPresenceStatus(status))
  const idleTimerRef = useRef<number | undefined>(undefined)
  const userIdRef = useRef<string | null>(null)

  const persistStatusRef = useRef<(nextStatus: PresenceStatus) => void>(() => {})

  useEffect(() => {
    if (status === "idle" || status === "dnd" || status === "invisible") {
      explicitStatusRef.current = status
    }
  }, [status])

  useEffect(() => {
    if (!userId) return
    userIdRef.current = userId

    const persistStatus = (nextStatus: PresenceStatus, options?: { persistUserRecord?: boolean; rememberExplicit?: boolean }) => {
      const persistUserRecord = options?.persistUserRecord ?? true
      const rememberExplicit = options?.rememberExplicit ?? (nextStatus === "idle" || nextStatus === "dnd" || nextStatus === "invisible")

      currentStatusRef.current = nextStatus
      if (rememberExplicit) {
        explicitStatusRef.current = nextStatus
      }

      if (persistUserRecord) {
        supabase
          .from("users")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", userId)
          .then()
      }

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
        if (currentStatusRef.current === "online") {
          persistStatus("idle", { persistUserRecord: false, rememberExplicit: false })
        }
      }, IDLE_TIMEOUT_MS)
    }

    const initialStatus = resolveInitialPresenceStatus(status)
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
        persistStatus("online", { persistUserRecord: false, rememberExplicit: false })
      }
      scheduleIdle()
    }

    const onVisibility = () => {
      if (document.hidden) {
        persistStatus("offline", { persistUserRecord: false, rememberExplicit: false })
        return
      }

      if (explicitStatusRef.current === "idle" || explicitStatusRef.current === "dnd" || explicitStatusRef.current === "invisible") {
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
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [supabase])
}
