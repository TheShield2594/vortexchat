// VortexChat Service Worker — source file.
// In production this is processed by `scripts/build-sw.mjs` (workbox-build
// injectManifest), which replaces the WB_MANIFEST placeholder with the list of
// content-hashed /_next/static/ assets and writes the result to public/sw.js.
// In development, public/sw.js is used directly as a fallback.

// ─── VAPID key helper ────────────────────────────────────────────────────────
// Convert a base64url-encoded VAPID public key to a Uint8Array.
// PushManager.subscribe() requires BufferSource on iOS Safari; the string
// form is not universally supported.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// ─── Cache names ────────────────────────────────────────────────────────────
const PRECACHE = "vortexchat-precache-v7"
const RUNTIME = "vortexchat-runtime-v7"
const APP_SHELL = "vortexchat-shell-v7"
const ALL_CACHES = [PRECACHE, RUNTIME, APP_SHELL]

// ─── Precache manifest ───────────────────────────────────────────────────────
// Injected by workbox-build: list of { url, revision } objects for every
// /_next/static/ chunk produced by `next build`. Falls back to [] in dev.
const PRECACHE_MANIFEST = self.__WB_MANIFEST || []
const PRECACHE_URLS = PRECACHE_MANIFEST.map((e) =>
  typeof e === "string" ? e : e.url
)

// Static app-shell assets — not content-hashed, cached separately.
const APP_SHELL_ASSETS = [
  "/",
  "/channels/me",
  "/offline",
  "/manifest.json",
  "/icon-192.png?v=2",
  "/icon-192-maskable.png?v=2",
  "/icon-512.png?v=2",
  "/icon-512-maskable.png?v=2",
]

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    Promise.all([
      // Content-hashed Next.js chunks — safe to cache aggressively.
      PRECACHE_URLS.length > 0
        ? caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS))
        : Promise.resolve(),
      // App shell — offline navigation fallback.
      caches.open(APP_SHELL).then((c) => c.addAll(APP_SHELL_ASSETS)),
    ])
  )
})

// ─── Activate ────────────────────────────────────────────────────────────────
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

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigation — network-first, offline fallback to app shell.
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
            (await cache.match("/")) ||
            new Response("Offline", { status: 503, statusText: "Service Unavailable" })
          )
        })
    )
    return
  }

  // /_next/static/ — cache-first (URLs are content-hashed and immutable).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(PRECACHE).then((c) => c.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  // Scripts, styles, fonts, images — stale-while-revalidate.
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

// ─── Push notifications ───────────────────────────────────────────────────────
// Always show the notification regardless of whether the app is focused.
// On iOS, every push event MUST call showNotification() or the OS may
// revoke the push subscription.
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
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/icon-192.png",
      tag: tag || "vortexchat-message",
      data: { url },
      renotify: true,
      requireInteraction: false,
      actions: url !== "/channels/me" ? [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ] : [],
      silent: false,
    })
  )
})

// ─── App badge helper ────────────────────────────────────────────────────────
function updateAppBadge(count) {
  // In service worker scope, badge API is on `self` (ServiceWorkerGlobalScope)
  if (!self.navigator?.setAppBadge) return
  if (count > 0) {
    self.navigator.setAppBadge(count)
  } else {
    self.navigator.clearAppBadge()
  }
}

// ─── App badge + SW messages ──────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_UPDATE_BADGE") {
    updateAppBadge(event.data.count)
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

// ─── Push subscription rotation ───────────────────────────────────────────────
// Re-subscribe if the browser rotates push keys, then sync to the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription

        // Clean up the stale old endpoint from the server (best-effort).
        if (oldSub?.endpoint) {
          fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: oldSub.endpoint }),
          }).catch(() => {})
        }

        // Build subscribe options — prefer the old subscription's options
        // (which already contain the applicationServerKey as an ArrayBuffer),
        // but fall back to fetching the VAPID public key from the server and
        // converting it to a Uint8Array.  The string form of
        // applicationServerKey is NOT supported on all browsers (notably iOS
        // Safari), so we must always pass a BufferSource.
        let subscribeOptions = oldSub?.options
        if (!subscribeOptions?.applicationServerKey) {
          try {
            const keyRes = await fetch("/api/push/vapid-key")
            if (keyRes.ok) {
              const { key } = await keyRes.json()
              if (typeof key === "string" && key) {
                subscribeOptions = {
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(key),
                }
              }
            }
          } catch {
            // VAPID key fetch failed — proceed with userVisibleOnly only
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

      // Notify open tabs so the client-side hook can re-subscribe.
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" })
      }
    })()
  )
})

// ─── Notification click ───────────────────────────────────────────────────────
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
        // Prefer a tab that's already on the same channel to avoid a full reload
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
            // Post a message so the client can handle in-app navigation
            // without a full page reload when already on the right channel.
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
// Fires when the browser grants a periodic sync opportunity.
// Used to refresh unread counts and prefetch latest messages so the app
// opens instantly with fresh data.
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
        .catch(() => {
          // Sync failed — silently ignore, will retry next interval
        })
    )
  }
})
