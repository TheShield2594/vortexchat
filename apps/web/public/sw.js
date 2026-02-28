// VortexChat Service Worker — handles push notifications and caching

const CACHE_NAME = "vortexchat-v2"
const APP_SHELL_CACHE = "vortexchat-app-shell-v2"
const STATIC_ASSETS = ["/", "/channels/me", "/manifest.json", "/icon-192.png", "/icon-512.png"]

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
    ])
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![CACHE_NAME, APP_SHELL_CACHE].includes(k)).map((k) => caches.delete(k)))
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
          const copy = response.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put("/channels/me", copy))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL_CACHE)
          return (await cache.match("/channels/me")) || (await cache.match("/"))
        })
    )
    return
  }

  if (request.destination === "script" || request.destination === "style" || request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
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

  const { title = "VortexChat", body = "New message", icon = "/icon-192.png", url = "/channels/me", tag } = data

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

// Notification click — open or focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/channels/me"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
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
