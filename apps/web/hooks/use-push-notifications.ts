"use client"

import { useEffect, useCallback } from "react"

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from(Array.from(rawData).map((char) => char.charCodeAt(0)))
}

export function usePushNotifications() {
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false
    if (!PUBLIC_VAPID_KEY) return false

    try {
      // Use .ready instead of .register — useSwRegistration handles registration.
      // This avoids a duplicate register() call and potential race conditions.
      const registration = await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== "granted") return false

      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        }))

      const { endpoint, keys } = subscription.toJSON() as any
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys }),
      })
      return true
    } catch (e) {
      console.warn("Push notification setup failed:", e)
      return false
    }
  }, [])

  useEffect(() => {
    // Auto-subscribe if already granted.
    // Guard typeof Notification: on iOS Safari < 16.4 and some Android WebViews
    // the Notification global is not defined at all.  Accessing it without this
    // check throws a ReferenceError that React 18 routes to the nearest error
    // boundary, producing the "Something went wrong" screen on mobile.
    if (
      typeof window !== "undefined" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      subscribe()
    }

    // Re-subscribe when the browser rotates push keys (forwarded from SW
    // via useSwRegistration → vortex:resubscribe-push custom event)
    const onResubscribe = () => subscribe()
    window.addEventListener("vortex:resubscribe-push", onResubscribe)
    return () => window.removeEventListener("vortex:resubscribe-push", onResubscribe)
  }, [subscribe])

  return { subscribe }
}
