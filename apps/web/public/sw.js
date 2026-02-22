// VortexChat Service Worker — handles push notifications and caching

const CACHE_NAME = "vortexchat-v1"
const STATIC_ASSETS = ["/", "/channels/@me"]

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
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

  const { title = "VortexChat", body = "New message", icon = "/icon-192.png", url = "/channels/@me", tag } = data

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
  const url = event.notification.data?.url || "/channels/@me"

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
