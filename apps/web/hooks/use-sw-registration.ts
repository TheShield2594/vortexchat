"use client"

import { useEffect, useRef, useState, useCallback } from "react"

const SW_UPDATE_POLL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Registers the service worker, polls for updates hourly,
 * detects when a new version is waiting, and manages the
 * `is-standalone` CSS class on the document element.
 */
export function useSwRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  const applyUpdate = useCallback(() => {
    const reg = registrationRef.current
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" })
    }
    // The controllerchange listener below will reload the page
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    // Toggle is-standalone class on <html> for conditional CSS
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add("is-standalone")
    }

    let pollTimer: ReturnType<typeof setInterval> | undefined

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registrationRef.current = reg

        // Detect a new worker waiting
        const onStateChange = () => {
          if (reg.waiting) setUpdateAvailable(true)
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing
          newWorker?.addEventListener("statechange", onStateChange)
        })

        // Already waiting (e.g. page refresh after SW install)
        if (reg.waiting) setUpdateAvailable(true)

        // Poll for updates every hour
        pollTimer = setInterval(() => {
          reg.update().catch(() => {})
        }, SW_UPDATE_POLL_MS)
      })
      .catch((err) => {
        console.warn("SW registration failed:", err)
      })

    // Handle pushsubscriptionchange forwarded from SW
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        // Re-trigger push subscription from the push-notifications hook
        window.dispatchEvent(new CustomEvent("vortex:resubscribe-push"))
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage)

    // Reload when an *upgraded* SW takes control (not on first activation).
    // Without this guard, first-time visitors get an unexpected reload.
    const hadController = !!navigator.serviceWorker.controller
    let refreshing = false
    const onControllerChange = () => {
      if (!hadController) return // first install — no reload needed
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      navigator.serviceWorker.removeEventListener("message", onMessage)
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
    }
  }, [])

  return { updateAvailable, applyUpdate }
}
