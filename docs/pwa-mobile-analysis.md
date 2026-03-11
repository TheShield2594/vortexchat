# PWA & Mobile Support Analysis: Stoat vs Fluxer vs Vortex

> Competitive analysis of Progressive Web App and mobile behavior across three chat apps.
> Generated 2026-03-11.

---

## 1. Manifest & Installability

### What Stoat does
- Manifest is **generated inline** by the `vite-plugin-pwa` config in `packages/client/vite.config.ts` (lines 28-73). No separate static file.
- Has `name: "Stoat"`, `short_name: "Stoat"`, `display: "standalone"`, `display_override: ["window-controls-overlay"]` (for desktop PWA titlebar integration), `orientation: "portrait"`, `background_color` and `theme_color` both `"#101823"`.
- Four icons: 192px PNG, 512px PNG, monochrome SVG, and 512px maskable PNG.
- `categories: ["communication", "chat", "messaging"]`.
- Missing: shortcuts, `related_applications`.

### What Fluxer does
- Manifest is **generated at build time** by a custom rspack plugin at `fluxer_app/scripts/build/rspack/static-files.mjs`. The plugin emits `manifest.json` into dist during compilation, allowing CDN URL injection for icon paths.
- Has `display: "standalone"`, `orientation: "portrait-primary"`, `theme_color: "#4641D9"`, `background_color: "#2b2d31"`, `categories: ["social", "communication"]`, `scope: "/"`, `start_url: "/"`.
- Five icons: 192x192 and 512x512 with `purpose: "maskable any"`, apple-touch-icon 180x180, plus two favicons.
- Referenced in `fluxer_app/index.html` line 10.

### What Vortex does
- Static `apps/web/public/manifest.json` with `name: "VortexChat"`, `short_name: "Vortex"`, `display: "standalone"`, `start_url: "/channels/me"`, `theme_color: "#00e5ff"`, `background_color: "#1b1f31"`, `orientation: "portrait-primary"`, `scope: "/channels"`, `categories: ["social", "communication"]`.
- Two icons: 192x192 and 512x512, both with `purpose: "any maskable"`.
- One shortcut to "Friends" at `/channels/me`.
- Apple-touch-icon 180x180, multiple favicons, SVG icon.
- **Meets all PWA installability criteria** (HTTPS, manifest, service worker, icons, display mode).

### Gaps & Recommendations
- **Vortex is strong here.** The static manifest approach is simple and correct.
- Consider adding more shortcuts (e.g., quick-jump to a specific server, or "New DM").
- Consider Fluxer's approach of build-time manifest generation if icons ever need CDN URLs.
- Add `display_override: ["window-controls-overlay"]` like Stoat for a polished desktop PWA titlebar.

---

## 2. Service Worker

### What Stoat does
- **Worker file:** `packages/client/src/serviceWorker.ts` — built on **Workbox**.
- `cleanupOutdatedCaches()` removes stale entries on activation.
- `precacheAndRoute(self.__WB_MANIFEST)` with a filter excluding legacy bundles, locale files, and numbered CSS files.
- Listens for `SKIP_WAITING` messages for immediate activation.
- **No runtime caching strategies** — only precache. No cache-first for assets, no network-first for API calls.
- **No push event handler** in the service worker.

- **Registration:** `packages/client/src/serviceWorkerInterface.ts` using `virtual:pwa-register` from vite-plugin-pwa. Exports a reactive `pendingUpdate` signal. Polls for updates every hour via `setInterval(() => r!.update(), 36e5)`.

### What Fluxer does
- **Worker file:** `fluxer_app/src/service_worker/Worker.tsx` — custom, no Workbox.
- Built as a separate rspack entry point, output as `/sw.js` (stable filename, no content hash).
- Handles `install` (`skipWaiting()`), `activate` (`clients.claim()`), `push` (show notification + `navigator.setAppBadge()`), `notificationclick` (focus/open client).
- Listens for `message` events (`SKIP_WAITING`, `APP_UPDATE_BADGE`) and `pushsubscriptionchange`.
- **No `fetch` event listener — no asset caching whatsoever.** The app is broken offline.

- **Registration:** `fluxer_app/src/service_worker/Register.tsx` at end of `bootstrap()` in `src/index.tsx`. Cache-busting via `?v={buildSha}` query param.
- **Versioning:** `src/lib/Versioning.tsx` — `activateLatestServiceWorker()` calls `registration.update()`, sends `SKIP_WAITING`, waits for activation with 4s timeout.

### What Vortex does
- **Worker file:** `apps/web/public/sw.js` — custom, no Workbox.
- Two caches: `vortexchat-v2` (static) and `vortexchat-app-shell-v2` (dynamic).
- Pre-caches app shell: `/`, `/channels/me`, `/manifest.json`, icons.
- **Three-tier strategy:**
  - Navigation requests: **cache-first + network fallback** (falls back to `/channels/me` if fully offline).
  - Scripts/styles/images/fonts: **stale-while-revalidate**.
  - API requests: **network-only**.
- Full push notification handling: `push` event → `showNotification()`, `notificationclick` → navigate to URL.
- `skipWaiting()` on install, old cache cleanup on activation.

- **Registration:** `apps/web/hooks/use-sw-registration.ts` owns registration via `navigator.serviceWorker.register('/sw.js', { scope: '/' })`. The hook detects waiting workers (via `updatefound` + `statechange`), surfaces `updateAvailable` state, polls `registration.update()` hourly, and manages `controllerchange` reloads (upgrade-only, skips first install).
- **Update UI:** `apps/web/components/sw-update-toast.tsx` consumes `useSwRegistration()` and shows a persistent "New version available — Refresh" toast when a waiting worker is detected.
- **Push re-subscribe:** `pushsubscriptionchange` handler in `sw.js` performs SW-side re-subscribe + server sync, then notifies open clients via `postMessage`.

### Gaps & Recommendations
- **Vortex has the most complete caching strategy** of the three. Stoat only precaches, Fluxer caches nothing.
- ~~**Missing: update notification UI.**~~ **Resolved:** `sw-update-toast.tsx` + `use-sw-registration.ts` detect waiting workers and show a refresh toast.
- ~~**Missing: hourly update polling.**~~ **Resolved:** `use-sw-registration.ts` polls `registration.update()` every hour.
- **Missing: Background Sync API.** Neither competitor has this either, but it would be a differentiator for offline message queuing (see section 3).

---

## 3. Mobile UX Behavior

### What Stoat does
- **Startup:** `Deferred` component (`components/ui/components/utils/Deferred.tsx`) defers heavy renders to the next frame, showing a `CircularProgress` spinner. No skeleton screens.
- **Offline/reconnect:** Full connection FSM in `components/client/Controller.ts` with states: `Ready → LoggingIn → Connecting → Connected → Disconnected → Reconnecting → Offline`. Checks `navigator.onLine` on disconnect. Exponential backoff: `(2^failures) * (0.8 + random*0.4)` seconds.
- **Offline banner:** Titlebar in `components/app/interface/desktop/Titlebar.tsx` shows "Device is offline" with a clickable "(reconnect now)" link for `Connecting`, `Disconnected`, `Reconnecting`, and `Offline` states.
- **Message outbox:** `components/state/stores/Draft.ts` — `UnsentMessage` type with `"sending" | "unsent" | "failed"` status. `sendDraft()` adds to outbox, marks `"failed"` on error. `retrySend()` and `cancelSend()` available. Outbox persists across page reloads.
- **Install prompt:** Not implemented. No `beforeinstallprompt` handling.

### What Fluxer does
- **Startup:** Animated splash screen (`components/layout/SplashScreen.tsx`) with pulsing brand icon via framer-motion. Responsive sizing at 640px/768px/1024px breakpoints. Shown while gateway connects.
- **Offline/reconnect:** Gateway listens for browser `online`/`offline` events in `stores/gateway/GatewayConnectionStore.tsx`, triggers socket reconnection. **No visible offline banner.** No message queue.
- **Install prompt:** Not implemented.

### What Vortex does
- **Startup:** Shimmer skeleton screens (`components/ui/skeleton.tsx`) with staggered animation delays (0ms → 400ms). Used for messages, member lists, channel rows. 1600ms animation cycle. **Branded splash screen** (`components/splash-screen.tsx`) shows a pulsing "V" logo during hydration with a two-phase fade-out. Respects `prefers-reduced-motion`.
- **Offline/reconnect:** Full connection FSM in `hooks/use-connection-status.ts` with states: `connected → disconnected → reconnecting → offline`. Listens to `navigator.onLine` + Supabase Realtime channel events (via `vortex:realtime-connect` / `vortex:realtime-disconnect` custom events emitted by `hooks/use-realtime-messages.ts`). Exponential backoff with jitter, max 30s. **Persistent offline banner** in `components/connection-banner.tsx` — color-coded (red for offline, amber for disconnected/reconnecting), with manual reconnect button.
- **Message outbox/queue:** `lib/chat-outbox.ts` persists queued messages to localStorage. `components/chat/hooks/use-chat-outbox.ts` rehydrates on mount, flushes on reconnect (listens for `online` and `vortex:flush-outbox` events). Messages shown with pending/failed indicators in the message list.
- **Install prompt:** `components/pwa-install-banner.tsx` — captures `beforeinstallprompt`, shows fixed-bottom banner on mobile only. Remembers dismissal in localStorage. **This is better than both competitors**, neither of which has this.
- **Push permission soft-ask:** `components/push-permission-prompt.tsx` — delays 60s before showing a contextual prompt explaining the value of notifications. Only shown when permission is `"default"` and user hasn't dismissed before. Only dismisses on successful subscription.

### Gaps & Recommendations
- ~~**HIGH: Add a connection state machine and offline banner.**~~ **Resolved:** `hooks/use-connection-status.ts` + `components/connection-banner.tsx` implement the full FSM with offline banner.
- ~~**HIGH: Add message outbox/queue.**~~ **Resolved:** `lib/chat-outbox.ts` + `use-chat-outbox.ts` persist and replay queued messages.
- ~~**MEDIUM: Add splash screen for cold starts.**~~ **Resolved:** `components/splash-screen.tsx` shows a branded loading overlay during hydration.

---

## 4. Layout & Responsiveness

### What Stoat does
- **Safe area insets** in `packages/client/components/ui/styles.css` — applies all four `env(safe-area-inset-*)` to `#root` via `position: fixed` with `top/left/right/bottom` offsets. **However, missing `viewport-fit=cover`** in the meta tag, so these insets won't activate on iOS.
- **No CSS media queries.** Panel visibility controlled by JavaScript state (`LAYOUT_SECTIONS.PRIMARY_SIDEBAR`), toggled via `HeaderIcon` component.
- **No dedicated mobile navigation** (no bottom tab bar, no swipe gestures).

### What Fluxer does
- **Responsive layout store** (`stores/MobileLayoutStore.tsx`) with **hysteresis breakpoints**: enable at `<640px`, disable at `>=768px`. Prevents layout flapping on resize.
- **Safe area insets** in 31+ CSS files. Root container (`App.module.css`) applies `padding-left/right: env(safe-area-inset-*)`. Top inset applied only when `is-standalone` class is on `<html>`, toggled by `AppLayoutHooks.tsx`.
- **Mobile bottom nav** (`components/layout/MobileBottomNav.tsx`): fixed bottom bar with Home, Voice (conditional), Notifications, You tabs. Only on top-level routes in mobile mode.
- **Mobile navigation history** (`utils/MobileNavigation.tsx`): builds a two-entry history stack so hardware back navigates to channel list instead of exiting the app.
- **Pinch zoom prevention** in `App.tsx` via `touchstart/touchmove` event listeners.
- **Viewport meta:** `viewport-fit=cover, interactive-widget=resizes-content, maximum-scale=1, user-scalable=no`.

### What Vortex does
- **Mobile bottom tab bar** (`components/layout/mobile-bottom-tab-bar.tsx`): 4 tabs (Discover, DMs, Friends, Profile), `md:hidden`, fixed bottom with `env(safe-area-inset-bottom)` padding.
- **Mobile sidebar** (`components/layout/mobile-nav.tsx`): hamburger + drawer with overlay. Swipe-to-open zone on left edge via `use-swipe.ts` hook (56px min distance, 80px cross-axis threshold).
- **Server sidebar** (`components/layout/server-sidebar-wrapper.tsx`): hidden on mobile, slide-in drawer overlaying content.
- **Main layout** (`components/layout/channels-shell.tsx`): `pb-16 md:pb-0` reserves space for bottom tab bar on mobile.
- **Viewport meta:** `width=device-width, initialScale=1, userScalable=true, themeColor="#00e5ff"`.
- **Missing: `viewport-fit=cover`** — safe-area-inset values won't activate on iOS notch devices.
- **Missing: `interactive-widget=resizes-content`** — keyboard overlay behavior is uncontrolled.

### Gaps & Recommendations
- **HIGH: Add `viewport-fit=cover` to the viewport meta tag** in `apps/web/app/layout.tsx`. Without this, `env(safe-area-inset-*)` values are always zero on iOS Safari. Fluxer has this; Stoat is missing it too.
- **HIGH: Add `interactive-widget=resizes-content`** to the viewport meta — this tells mobile browsers to resize the layout when the virtual keyboard opens, preventing the keyboard from overlapping the message input.
- **MEDIUM: Add hysteresis breakpoints** like Fluxer's `MobileLayoutStore` (enable at 640px, disable at 768px) to prevent layout flapping when resizing near the breakpoint.
- **MEDIUM: Add mobile back-button history management** like Fluxer's two-entry history stack so hardware back on Android navigates to the channel list instead of exiting the PWA.
- **LOW: Add `is-standalone` CSS class** to conditionally apply top safe-area-inset only in installed PWA mode (like Fluxer), avoiding unnecessary padding in the browser.

---

## 5. Notifications

### What Stoat does
- **Browser Notification API only** (`components/client/NotificationsWorker.tsx`) — uses `new Notification()` constructor, not Push API or service worker.
- Requests `Notification.requestPermission()` on first user click; remembers denial in localStorage.
- Filters: ignores own messages, blocked users, muted channels, busy/focus presence.
- Uses `tag` (channel ID) for deduplication, `silent: true`.
- Click handler focuses window and navigates to message.
- **No Web Push.** The `vapid` field exists in config but is unused. Push notification settings toggle is commented out.

### What Fluxer does
- **Full VAPID-based Web Push** (`services/push/PushSubscriptionService.tsx`): retrieves VAPID public key from `RuntimeConfigStore`, calls `pushManager.subscribe()`, POSTs subscription to backend.
- **Gated to installed PWAs only** — `isWebPushSupported()` requires `isInstalledPwa()` to be true. Browser tab users get no push.
- **App badge:** `App.tsx` subscribes to `ReadStateStore`, posts total mention count to service worker, which calls `navigator.setAppBadge()` / `clearAppBadge()`.
- **Service worker:** `push` event shows notification, `notificationclick` focuses/opens client at target URL.
- **Notification nagbar** (`nagbars/DesktopNotificationNagbar.tsx`): shows different copy for PWA mobile vs desktop browser. Dismissal goes through confirmation modal.
- **No permission timing logic** — just a nagbar on first load.

### What Vortex does
- **Full VAPID-based Web Push** (`hooks/use-push-notifications.ts` + `lib/push.ts` + `app/api/push/route.ts`).
- Service worker handles `push` and `notificationclick` events in `public/sw.js`.
- **Notification settings hierarchy** (`lib/notification-resolver.ts`): thread → channel → server → global → default ("all"). Supports `"all" | "mentions" | "muted"` modes.
- **Server-side push** (`lib/push.ts`): `sendPushToUser()` and `sendPushToChannel()` with per-user settings resolution, mention detection, expired subscription cleanup (410/404).
- Push subscription stored in Supabase `push_subscriptions` table with deduplication on `(user_id, endpoint)`.
- Notification payload: title, body (truncated 100 chars), deep-link URL, tag for grouping.
- **Not gated to installed PWA** — works for browser tab users too.

### Gaps & Recommendations
- **Vortex has the most complete notification system.** The settings hierarchy is more sophisticated than either competitor.
- **MEDIUM: Add app badge support** like Fluxer — post unread mention count to the service worker via `postMessage`, call `navigator.setAppBadge()`. This shows a badge on the app icon on Android and iOS.
- **MEDIUM: Consider gating push permission requests.** Currently the hook requests permission in `useEffect` on mount. Consider delaying until the user has been active for a session or showing a soft-ask UI first (like Fluxer's nagbar) before triggering the browser prompt.
- **LOW: Add `pushsubscriptionchange` handling** in the service worker (like Fluxer) to re-register if the browser rotates keys.

---

## 6. Build & Caching Strategy

### What Stoat does
- **Build:** Vite with `vite-plugin-pwa` (`strategies: "injectManifest"`, `registerType: "autoUpdate"`).
- **Precache limit:** `maximumFileSizeToCacheInBytes: 4000000` (4MB per file).
- **File hashing:** Vite's default content-hash filenames for JS/CSS.
- **Service worker updates:** `registerType: "autoUpdate"` triggers auto-update. Client-side hourly polling via `setInterval(() => r!.update(), 36e5)`. UI shows "Update" button via `pendingUpdate` signal when new worker is waiting.
- **No runtime cache strategies** beyond precache.

### What Fluxer does
- **Build:** rspack with custom plugins.
- **File hashing:** `assets/[contenthash:16].js/css/wasm` — content-hash filenames enabling long-lived cache headers.
- **Code splitting:** 18 named cache groups in production (react, mobx, sentry, livekit, highlight.js, katex, framer-motion, react-aria, icons, validation, datetime, rxjs, unicode, dnd, radix, UI libs, utils, networking, catch-all vendor).
- **CDN:** Production public path `https://fluxerstatic.com/`.
- **Service worker:** Stable `/sw.js` filename (no hash), separate entry point excluded from HTML injection and code splitting.
- **SW updates:** `Versioning.tsx` — `registration.update()` + `SKIP_WAITING` message + 4s activation timeout.
- **No asset caching** in the service worker.

### What Vortex does
- **Build:** Next.js with default configuration.
- **File hashing:** Next.js automatic content-hash filenames for `_next/static/` assets.
- **Code splitting:** Next.js automatic page/route-based splitting.
- **Cache headers:** Defined in `next.config.js` — CSP, HSTS (2 years), Permissions-Policy. **No explicit `Cache-Control` headers for static assets** (Next.js defaults handle `_next/static/` with immutable cache, but custom assets in `public/` may not be cached aggressively).
- **SW updates:** `skipWaiting()` on install, old cache cleanup on activation. **No client-side update detection or prompt.**

### Gaps & Recommendations
- **MEDIUM: Add explicit long-lived `Cache-Control` headers** for `public/` assets (icons, splash screens, manifest). Add to `next.config.js` `headers()`:
  ```
  /icon-*.png, /apple-touch-icon.png, /startup/* → Cache-Control: public, max-age=31536000, immutable
  /manifest.json → Cache-Control: public, max-age=86400
  /sw.js → Cache-Control: no-cache (must always be fresh)
  ```
- **MEDIUM: Add "new version available" toast.** Listen for the service worker `controllerchange` event or use a `statechange` listener on the registration to detect when a new worker is waiting. Show a dismissable toast with a "Refresh" button.
- **MEDIUM: Add hourly SW update polling** like Stoat — `setInterval(() => registration.update(), 3600000)` in the push-notifications hook or a dedicated registration hook.
- **LOW: Consider more granular code splitting.** Fluxer's 18 named cache groups are aggressive, but Vortex could benefit from explicit splitting of heavy dependencies (e.g., livekit, emoji data) to keep initial bundle small.

---

## Prioritized PWA/Mobile Improvement Checklist

### High — Must-have to feel like a real mobile chat app

| # | Item | Relevant files | Why |
|---|------|---------------|-----|
| H1 | **Add `viewport-fit=cover` to viewport meta** | `apps/web/app/layout.tsx` | Without this, `env(safe-area-inset-*)` is always 0 on iOS — content renders under the notch and home indicator |
| H2 | **Add `interactive-widget=resizes-content` to viewport meta** | `apps/web/app/layout.tsx` | Prevents the virtual keyboard from overlapping the message input on mobile browsers |
| H3 | **Add connection state machine + offline banner** | New: `hooks/use-connection-status.ts`, update `components/layout/channels-shell.tsx` | Users get no feedback when disconnected. Adopt Stoat's FSM pattern: `Connected → Disconnected → Reconnecting → Offline` with a persistent banner |
| H4 | **Add message outbox/queue for offline sends** | New: add `pending` status to message store, update `hooks/use-send-message.ts` or equivalent | Messages silently fail when offline. Queue them locally, show with a "pending" indicator, flush on reconnect. Stoat's `Draft.ts` is the model |
| H5 | **Add mobile back-button history management** | New: `utils/mobile-navigation.ts`, update router navigation calls | Hardware back on Android exits the PWA instead of navigating to channel list. Adopt Fluxer's two-entry history stack pattern |

### Medium — Good UX and performance wins

| # | Item | Relevant files | Why |
|---|------|---------------|-----|
| M1 | **Add "new version available" toast** | New: `components/sw-update-toast.tsx`, update `hooks/use-push-notifications.ts` | Users may run stale cached versions indefinitely. Add `controllerchange` listener → show "Refresh" toast |
| M2 | **Add hourly SW update polling** | `hooks/use-push-notifications.ts` or new `hooks/use-sw-registration.ts` | Catches SW updates when tabs stay open. Pattern: `setInterval(() => registration.update(), 3600000)` |
| M3 | **Add app badge for unread mentions** | `public/sw.js` + new read-state sync in the main thread | Fluxer shows unread count on the app icon via `navigator.setAppBadge()`. Post count to SW via `postMessage` |
| M4 | **Add explicit Cache-Control headers for public assets** | `apps/web/next.config.js` `headers()` | Icons, splash SVGs, and manifest lack aggressive caching. Add `immutable` for hashed assets, `no-cache` for `sw.js` |
| M5 | **Delay push permission request with soft-ask** | `hooks/use-push-notifications.ts`, new: `components/push-permission-prompt.tsx` | Currently requests on mount. Show a contextual prompt (e.g., after first message received) explaining the value before triggering the browser dialog |
| M6 | **Add hysteresis for mobile/desktop layout breakpoints** | `components/layout/channels-shell.tsx` or new layout store | Prevents layout flapping near the 768px breakpoint. Adopt Fluxer's pattern: enable at 640px, disable at 768px |
| M7 | **Add branded splash/loading overlay for cold starts** | New: `components/splash-screen.tsx` | Between HTML load and React hydration, users see a blank screen. Show a branded overlay like Fluxer's animated splash |
| M8 | **Add `pushsubscriptionchange` handler to SW** | `apps/web/public/sw.js` | If the browser rotates push keys, re-register the subscription. Fluxer broadcasts to all clients to trigger re-registration |

### Low — Nice-to-have polish

| # | Item | Relevant files | Why |
|---|------|---------------|-----|
| L1 | **Add `display_override: ["window-controls-overlay"]` to manifest** | `apps/web/public/manifest.json` | Enables a polished desktop PWA titlebar (like Stoat) with custom content in the title bar area |
| L2 | **Add `is-standalone` CSS class for conditional styling** | `apps/web/app/layout.tsx` or a client component | Only apply `safe-area-inset-top` padding when running as installed PWA, not in browser tab (Fluxer pattern) |
| L3 | **Add more PWA shortcuts** | `apps/web/public/manifest.json` | Currently only "Friends". Add shortcuts for "New DM", "Discover Servers", etc. |
| L4 | **Add Web Share API integration** | New: share button in message context menu | Allow users to share messages/media to other apps via `navigator.share()` |
| L5 | **Add `inputmode` attributes to input fields** | Various input components | Proper `inputmode="text"`, `inputmode="email"`, `inputmode="search"` to optimize the mobile keyboard |
| L6 | **Consider granular code splitting for heavy deps** | `apps/web/next.config.js` | Explicitly split livekit, emoji data, and other large packages to reduce initial bundle size |
| L7 | **Add `format-detection: telephone=no` meta tag** | `apps/web/app/layout.tsx` | Prevents iOS from auto-linking numbers in chat messages as phone numbers (Fluxer has this) |

---

## Summary Comparison Matrix

| Capability | Stoat | Fluxer | Vortex |
|-----------|-------|--------|--------|
| Manifest & installability | Inline via Vite plugin | Build-time generated | Static file ✅ |
| PWA icons (192 + 512 + maskable) | ✅ | ✅ | ✅ |
| iOS splash screens | ❌ | ❌ | ✅ 8 device sizes |
| Service worker caching | Precache only | None | ✅ Multi-strategy |
| SW update notification | ✅ Titlebar button | Code-level only | ✅ Toast + hourly poll |
| Push notifications (Web Push) | ❌ Browser API only | ✅ PWA-gated | ✅ All users |
| Notification settings hierarchy | Basic filters | Basic | ✅ 4-level hierarchy |
| App badge | ❌ | ✅ | ❌ Missing |
| Install prompt (`beforeinstallprompt`) | ❌ | ❌ | ✅ Custom banner |
| Offline banner | ✅ Full FSM | ❌ | ✅ Full FSM + banner |
| Message outbox/queue | ✅ Persistent | ❌ | ✅ Persistent (localStorage) |
| Mobile bottom nav | ❌ | ✅ | ✅ |
| Swipe gestures | ❌ | ❌ | ✅ Left-edge swipe |
| Safe area insets | Partial (missing viewport-fit) | ✅ Full | Partial (missing viewport-fit) |
| `viewport-fit=cover` | ❌ | ✅ | ❌ Missing |
| Mobile back-button handling | ❌ | ✅ History stack | ✅ History stack + guard |
| Skeleton loading screens | ❌ Spinners only | ✅ | ✅ Shimmer |
| Splash/loading screen | ❌ | ✅ Animated | ✅ Branded + iOS |
| Presence/online status | ✅ | ✅ | ✅ |
| `prefers-reduced-motion` | Unknown | ✅ | ✅ |

### Key Takeaway

**Vortex now has the most complete PWA support** of the three — it's the only one with all of: multi-strategy service worker caching, Web Push for all users, a custom install prompt, iOS splash screens, skeleton loading, swipe gestures, a connection state machine with offline banner, a persistent message outbox, SW update detection with toast UI, hourly update polling, a branded splash screen, mobile back-button history management, and a push permission soft-ask. The remaining gaps are in **mobile viewport handling** (missing `viewport-fit=cover` and `interactive-widget`) and **app badge support**. See remaining items H1, H2, and M3 above.
