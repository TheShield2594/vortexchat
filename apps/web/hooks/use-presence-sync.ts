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
  const isIdleExplicitRef = useRef<boolean>(status === "idle")
  const idleTimerRef = useRef<number | undefined>(undefined)
  const userIdRef = useRef<string | null>(null)

  const persistStatusRef = useRef<(nextStatus: PresenceStatus) => void>(() => {})

  useEffect(() => {
    if (status === "idle" || status === "dnd" || status === "invisible") {
      explicitStatusRef.current = status
      isIdleExplicitRef.current = status === "idle"
    }
  }, [status])

  useEffect(() => {
    if (!userId) return
    userIdRef.current = userId

    let isInitialCall = true
    const persistStatus = (nextStatus: PresenceStatus, options?: { persistUserRecord?: boolean; rememberExplicit?: boolean }) => {
      const persistUserRecord = options?.persistUserRecord ?? true
      const rememberExplicit = options?.rememberExplicit ?? (nextStatus === "idle" || nextStatus === "dnd" || nextStatus === "invisible")

      const statusChanged = currentStatusRef.current !== nextStatus

      currentStatusRef.current = nextStatus
      if (rememberExplicit) {
        explicitStatusRef.current = nextStatus
      }

      if (nextStatus === "idle") {
        isIdleExplicitRef.current = rememberExplicit
      } else if (nextStatus === "online") {
        isIdleExplicitRef.current = false
      } else if (rememberExplicit) {
        isIdleExplicitRef.current = false
      }

      // Skip redundant track/persist calls when status hasn't actually changed
      if (!statusChanged && !isInitialCall) return
      isInitialCall = false

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

    let lastActivityTime = 0
    const ACTIVITY_THROTTLE_MS = 3000
    const onActivity = () => {
      const now = Date.now()
      if (now - lastActivityTime < ACTIVITY_THROTTLE_MS) return
      lastActivityTime = now
      if (currentStatusRef.current === "idle" && !isIdleExplicitRef.current) {
        persistStatus("online", { persistUserRecord: false, rememberExplicit: false })
      }
      scheduleIdle()
    }

    const onVisibility = () => {
      if (document.hidden) {
        // Tab hidden → mark as idle (not offline). The user is still reachable;
        // they just aren't actively looking at the tab — matching Discord/Slack
        // behaviour where switching tabs shows a yellow idle indicator, not a
        // full "offline" state.
        if (currentStatusRef.current === "online") {
          persistStatus("idle", { persistUserRecord: false, rememberExplicit: false })
        }
        return
      }

      // Tab regained focus — restore the user's explicit status if they had one,
      // otherwise go back to "online" and restart the idle timer.
      if (explicitStatusRef.current === "idle" || explicitStatusRef.current === "dnd" || explicitStatusRef.current === "invisible") {
        persistStatus(explicitStatusRef.current)
        return
      }

      persistStatus("online", { persistUserRecord: false, rememberExplicit: false })
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
