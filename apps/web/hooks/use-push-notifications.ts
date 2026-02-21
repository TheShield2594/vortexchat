"use client"

import { useEffect, useCallback } from "react"

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function usePushNotifications() {
  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    if (!PUBLIC_VAPID_KEY) return

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== "granted") return

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
    } catch (e) {
      console.warn("Push notification setup failed:", e)
    }
  }, [])

  useEffect(() => {
    // Auto-subscribe if already granted
    if (typeof window !== "undefined" && Notification.permission === "granted") {
      subscribe()
    }
  }, [subscribe])

  return { subscribe }
}
