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
  "/offline",
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
          return (
            (await cache.match("/channels/me")) ||
            (await cache.match("/offline")) ||
            (await cache.match("/"))
          )
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

// Push notification handler — suppresses notification when the user is
// actively viewing the target conversation in a focused window.
// IMPORTANT: On iOS, every push event MUST call showNotification() or the
// OS may revoke the push subscription.  Never return early without showing.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    try { data = { title: "VortexChat", body: event.data?.text() ?? "New message" } } catch { /* empty payload */ }
  }

  const {
    title = "VortexChat",
    body = "New message",
    icon = "/icon-192.png",
    url = "/channels/me",
    tag,
  } = data

  event.waitUntil(
    (async () => {
      // Check if the user has a focused window on the target URL.
      // If so, suppress the notification — they're already reading it.
      // On mobile PWA, backgrounded apps have zero visible clients,
      // so this correctly allows notifications through.
      let isFocused = false
      try {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
        isFocused = clients.some((client) => {
          if (!client.focused || client.visibilityState !== "visible") return false
          try {
            const clientUrl = new URL(client.url)
            return clientUrl.pathname === url
          } catch {
            return false
          }
        })
      } catch {
        // clients API failed — show notification to be safe
      }

      if (isFocused) {
        // User is looking at this conversation.  On iOS we still must
        // call showNotification to keep the subscription alive, so show
        // a silent, auto-dismissing notification with a very short tag
        // that gets immediately closed.
        await self.registration.showNotification("", {
          tag: "vortex-suppress",
          silent: true,
        })
        // Immediately close it — user won't see it
        const notifications = await self.registration.getNotifications({ tag: "vortex-suppress" })
        notifications.forEach((n) => n.close())
        return
      }

      const actions = url !== "/channels/me" ? [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ] : []

      await self.registration.showNotification(title, {
        body,
        icon,
        badge: "/icon-192.png",
        tag: tag || "vortexchat-message",
        data: { url },
        renotify: true,
        requireInteraction: false,
        actions,
        silent: false,
      })
    })()
  )
})

function updateAppBadge(count) {
  if (!navigator.setAppBadge) return
  if (count > 0) {
    navigator.setAppBadge(count)
  } else {
    navigator.clearAppBadge()
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_UPDATE_BADGE") {
    updateAppBadge(event.data.count)
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

  // Handle action buttons — "dismiss" just closes
  if (event.action === "dismiss") return

  const url = event.notification.data?.url || "/channels/me"
  const fullUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Prefer a tab already on the same channel to avoid a full reload
        const sameChannel = clients.find((c) => {
          try {
            const clientUrl = new URL(c.url)
            const targetUrl = new URL(fullUrl)
            return clientUrl.pathname === targetUrl.pathname && clientUrl.search === targetUrl.search
          } catch { return false }
        })
        const existing = sameChannel || clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          return existing.focus().then(() => {
            existing.postMessage({ type: "NOTIFICATION_NAVIGATE", url })
            return sameChannel ? undefined : existing.navigate(fullUrl)
          })
        } else {
          return self.clients.openWindow(fullUrl)
        }
      })
  )
})

// ─── Periodic background sync ─────────────────────────────────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "vortex-refresh-unread") {
    event.waitUntil(
      fetch("/api/notifications/unread-count", { credentials: "same-origin" })
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          const count = data?.count
          if (typeof count !== "number" || !isFinite(count)) return
          updateAppBadge(count)
        })
        .catch(() => {})
    )
  }
})
