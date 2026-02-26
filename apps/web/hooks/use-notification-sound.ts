"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"

const STORAGE_KEY = "vortexchat:notification-sound-enabled"

// ---------------------------------------------------------------------------
// localStorage-backed setting with useSyncExternalStore for React sync
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach((cb) => cb())
}

// Cross-tab sync: listen for storage events from other tabs
function onStorageEvent(e: StorageEvent) {
  if (e.key === STORAGE_KEY || e.key === null) notifyListeners()
}

function subscribe(cb: () => void) {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorageEvent)
  }
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorageEvent)
    }
  }
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(STORAGE_KEY) !== "false"
}

function getServerSnapshot(): boolean {
  return true
}

function setNotificationSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled))
  notifyListeners()
}

// ---------------------------------------------------------------------------
// Web Audio API tone generator
// ---------------------------------------------------------------------------

function playTone() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = "sine"
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08)

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)

    osc.onended = () => ctx.close()
  } catch {
    // Audio context unavailable — silent fallback
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationSound() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const lastPlayedRef = useRef(0)

  const playNotification = useCallback(() => {
    if (!getSnapshot()) return

    // Debounce rapid successive plays (500ms)
    const now = Date.now()
    if (now - lastPlayedRef.current < 500) return
    lastPlayedRef.current = now

    playTone()
  }, [])

  return {
    playNotification,
    notificationSoundEnabled: enabled,
    setNotificationSoundEnabled,
  }
}
