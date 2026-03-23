// VortexChat Service Worker — dev fallback.
// In production this file is replaced by the output of `scripts/build-sw.mjs`
// (workbox-build injectManifest), which precaches all /_next/static/ chunks.

const PRECACHE = "vortexchat-precache-v5"
const RUNTIME = "vortexchat-runtime-v5"
const APP_SHELL = "vortexchat-shell-v5"
const ALL_CACHES = [PRECACHE, RUNTIME, APP_SHELL]

const APP_SHELL_ASSETS = [
  "/",
  "/channels/me",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
]

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(APP_SHELL).then((c) => c.addAll(APP_SHELL_ASSETS))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
        )
      )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type !== "error") {
            const copy = response.clone()
            caches.open(APP_SHELL).then((c) => c.put("/channels/me", copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL)
          return (await cache.match("/channels/me")) || (await cache.match("/"))
        })
    )
    return
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(RUNTIME).then((c) => c.put(request, copy))
            }
            return response
          })
          .catch(() => cached)
        return cached || fetchPromise
      })
    )
  }
})

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: "VortexChat", body: event.data.text() }
  }

  const {
    title = "VortexChat",
    body = "New message",
    icon = "/icon-192.png",
    url = "/channels/me",
    tag,
  } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/icon-192.png",
      tag: tag || "vortexchat-message",
      data: { url },
      renotify: true,
      requireInteraction: false,
    })
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_UPDATE_BADGE") {
    const count = event.data.count
    if (navigator.setAppBadge) {
      if (count > 0) {
        navigator.setAppBadge(count)
      } else {
        navigator.clearAppBadge()
      }
    }
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription
        let subscribeOptions = oldSub?.options
        if (!subscribeOptions?.applicationServerKey) {
          try {
            const keyRes = await fetch("/api/push/vapid-key")
            if (keyRes.ok) {
              const { key } = await keyRes.json()
              subscribeOptions = { userVisibleOnly: true, applicationServerKey: key }
            }
          } catch {
            // VAPID key fetch failed
          }
        }
        const newSub = await self.registration.pushManager.subscribe(
          subscribeOptions ?? { userVisibleOnly: true }
        )
        const { endpoint, keys } = newSub.toJSON()
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint, keys }),
        })
        if (!res.ok) throw new Error("Server returned " + res.status)
      } catch (err) {
        console.warn("SW pushsubscriptionchange: re-subscribe failed", err)
      }

      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" })
      }
    })()
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/channels/me"

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          existing.focus()
          existing.navigate(url)
        } else {
          self.clients.openWindow(url)
        }
      })
  )
})
