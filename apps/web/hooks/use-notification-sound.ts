"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"
import { persistBooleanStorage } from "@/lib/utils/storage"

const STORAGE_KEY = "vortexchat:notification-sound-enabled"

// Path to the notification sound file served from /public
const NOTIFICATION_SOUND_URL = "/sounds/notification.wav"

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
  persistBooleanStorage(STORAGE_KEY, enabled)
  notifyListeners()
}

// ---------------------------------------------------------------------------
// Audio file player (replaces Web Audio API tone generator)
// ---------------------------------------------------------------------------

// Preloaded Audio element — we clone it for each play to allow overlapping
let preloadedAudio: HTMLAudioElement | null = null

function getPreloadedAudio(): HTMLAudioElement {
  if (!preloadedAudio) {
    preloadedAudio = new Audio(NOTIFICATION_SOUND_URL)
    preloadedAudio.preload = "auto"
    preloadedAudio.volume = 0.5
  }
  return preloadedAudio
}

async function playNotificationSound(): Promise<void> {
  try {
    const template = getPreloadedAudio()
    // Clone so we can play overlapping sounds if rapid notifications arrive
    const audio = template.cloneNode(true) as HTMLAudioElement
    audio.volume = 0.5
    audio.currentTime = 0
    await audio.play()
  } catch {
    // Autoplay blocked or audio unavailable — fall back to Web Audio API tone
    try {
      await playFallbackTone()
    } catch {
      // Silent fallback — audio not available in this environment
    }
  }
}

/** Fallback: Web Audio API two-tone chime if <audio> playback fails */
async function playFallbackTone(): Promise<void> {
  const ctx = new AudioContext()

  try {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
  } catch {
    ctx.close().catch(() => {})
    return
  }

  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.type = "sine"
  osc1.frequency.setValueAtTime(1047, ctx.currentTime) // C6
  gain1.gain.setValueAtTime(0.15, ctx.currentTime)
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.12)

  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.type = "sine"
  osc2.frequency.setValueAtTime(1319, ctx.currentTime + 0.08) // E6
  gain2.gain.setValueAtTime(0, ctx.currentTime)
  gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.08)
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
  osc2.start(ctx.currentTime + 0.08)
  osc2.stop(ctx.currentTime + 0.25)

  osc2.onended = () => {
    ctx.close().catch(() => {})
  }
  setTimeout(() => {
    if (ctx.state !== "closed") {
      ctx.close().catch(() => {})
    }
  }, 1000)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationSound(): {
  playNotification: () => void
  notificationSoundEnabled: boolean
  setNotificationSoundEnabled: (enabled: boolean) => void
} {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const lastPlayedRef = useRef(0)

  const playNotification = useCallback(() => {
    if (!getSnapshot()) return

    // Debounce rapid successive plays (500ms)
    const now = Date.now()
    if (now - lastPlayedRef.current < 500) return
    lastPlayedRef.current = now

    playNotificationSound()
  }, [])

  return {
    playNotification,
    notificationSoundEnabled: enabled,
    setNotificationSoundEnabled,
  }
}
