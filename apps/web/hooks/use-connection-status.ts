"use client"

import { useEffect, useSyncExternalStore, useCallback } from "react"

export type ConnectionState = "connected" | "disconnected" | "reconnecting" | "offline"

// --- External store (singleton) ---------------------------------------------------

let state: ConnectionState = "connected"
const listeners = new Set<() => void>()

function setState(next: ConnectionState) {
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

function getSnapshot(): ConnectionState {
  return state
}

function getServerSnapshot(): ConnectionState {
  return "connected"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --- Reconnection with exponential back-off ---------------------------------------

let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0
const MAX_BACKOFF_S = 30

function scheduleReconnect() {
  if (reconnectTimer) return
  const delay = Math.min(Math.pow(2, failures) * (0.8 + Math.random() * 0.4), MAX_BACKOFF_S) * 1000
  failures++
  setState("reconnecting")
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    if (!navigator.onLine) {
      setState("offline")
      return
    }
    // Network is up — trigger a realtime reconnect attempt.
    // onRealtimeConnect will set "connected" when the channel truly reconnects.
    window.dispatchEvent(new CustomEvent("vortex:realtime-retry"))
  }, delay)
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }
}

// --- Public hook -------------------------------------------------------------------

/**
 * Tracks browser online/offline state with a reconnection FSM.
 *
 * States: connected → disconnected → reconnecting → (connected | offline)
 *
 * Listens to:
 *  - navigator.onLine / offline/online events
 *  - Supabase Realtime channel state changes (via custom events)
 */
export function useConnectionStatus(): {
  status: ConnectionState
  retry: () => void
} {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    function onOnline() {
      cancelReconnect()
      failures = 0
      setState("connected")
    }

    function onOffline() {
      cancelReconnect()
      setState("offline")
    }

    // Listen for Supabase Realtime disconnect events dispatched elsewhere
    function onRealtimeDisconnect() {
      if (!navigator.onLine) {
        setState("offline")
      } else {
        setState("disconnected")
        scheduleReconnect()
      }
    }

    function onRealtimeConnect() {
      cancelReconnect()
      failures = 0
      setState("connected")
    }

    // Seed initial state
    if (!navigator.onLine) setState("offline")

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    window.addEventListener("vortex:realtime-disconnect", onRealtimeDisconnect)
    window.addEventListener("vortex:realtime-connect", onRealtimeConnect)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("vortex:realtime-disconnect", onRealtimeDisconnect)
      window.removeEventListener("vortex:realtime-connect", onRealtimeConnect)
      cancelReconnect()
    }
  }, [])

  const retry = useCallback(() => {
    cancelReconnect()
    if (navigator.onLine) {
      failures = 0
      setState("connected")
      // Trigger a realtime reconnect if available
      window.dispatchEvent(new CustomEvent("vortex:realtime-retry"))
    } else {
      scheduleReconnect()
    }
  }, [])

  return { status, retry }
}
