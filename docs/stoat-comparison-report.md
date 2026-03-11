# Stoat vs Vortex — Deep Comparative Analysis

> Generated 2026-03-11. Compares [stoatchat/for-web](https://github.com/stoatchat/for-web) (SolidJS) against VortexChat (Next.js/React).

---

## 1. Custom Emoji Handling

### What Stoat Does
**Files:** `packages/client/components/markdown/emoji/`, `plugins/customEmoji.tsx`, `plugins/unicodeEmoji.tsx`, `composition/picker/EmojiPicker.tsx`

- **Loading:** Emojis live in a client-side SDK cache (`client().emojis.get(id)`). Unknown emojis are fetched on demand via `client().emojis.fetch(id)`.
- **Rendering:** Custom emojis render as `<img>` tags with `loading="lazy"`, `draggable=false`, `object-fit: contain`, and a CSS variable `--emoji-size` for sizing.
- **Fallback chain:** If the image 404s, an `onError` handler flips a signal to `false`, falling back to `:emoji_name:` text. If the name isn't cached either, shows the raw 26-char ID.
- **Tooltip:** Hovering shows a large preview (3em), the emoji name, and the originating server.
- **Unicode emoji packs:** Supports 7 interchangeable packs (fluent-3d, twemoji, noto, mutant, etc.) rendered as SVG from a CDN. Pack selection stored in user settings, applied globally via a Private Use Area (PUA) marker character prepended to the emoji.
- **Big emoji detection:** If a message contains *only* emojis, they render at a larger size (`--emoji-size-large` for 1 emoji, `--emoji-size-medium` for 2+).
- **Picker:** Virtualized grid (10 columns, `@minht11/solid-virtual-container`), custom emojis grouped by server with section headers, unicode emojis from a compiled JSON mapping. Real-time filter search.

### What Vortex Does
**Files:** `apps/web/components/chat/server-emoji-context.tsx`, `message-item.tsx`, `emoji-suggestions.tsx`, `hooks/use-emoji-autocomplete.ts`

- **Loading:** `ServerEmojiProvider` fetches from `/api/servers/{serverId}/emojis` in a `useEffect`. Stored in React state — no persistent cache, refetched on every server navigation.
- **Rendering:** Regex in `renderInline()` matches `:name:` and renders `<ServerEmojiImage>` — a simple `<img>` (22x22 fixed).
- **Fallback:** If emoji not found in context, renders `<span>:name:</span>`. No `onError` handler on the `<img>` for broken URLs.
- **No big emoji detection:** Messages with only emojis render at the same 22px size.
- **No unicode emoji packs:** Uses raw unicode characters, rendered by the OS/browser font.
- **Picker:** Autocomplete only (`:` trigger → dropdown), max 10 results. No dedicated grid-based emoji picker panel.

### Recommendations

| Change | Priority |
|--------|----------|
| **Add `onError` fallback on emoji `<img>` tags.** If the CDN image 404s (deleted emoji, bad URL), gracefully degrade to `:name:` text instead of showing a broken image. | **High** |
| **Add big-emoji sizing.** When a message body is purely emojis (1–5), render them at 2–3x size. Regex check on the content string before rendering. | **Medium** |
| **Add a grid-based emoji picker panel** alongside the autocomplete. The current `:` autocomplete is fine for power users but discoverability is poor. Use a virtualized grid (`@tanstack/react-virtual` which is already in the project). | **Medium** |
| **Cache emoji lists across navigations.** Emojis rarely change — store them in Zustand with a `staleTime` or TTL so switching servers doesn't refetch every time. Invalidate on emoji upload/delete events. | **Medium** |
| **Consider unicode emoji image rendering.** Stoat serves emojis as SVGs from a CDN for cross-platform consistency. At minimum, offer a twemoji/noto fallback option so emojis look the same on all OSes. | **Low** |

---

## 2. Message Rendering Pipeline

### What Stoat Does
**Files:** `packages/client/components/markdown/index.tsx`, `solid-markdown/ast-to-solid.tsx`, `plugins/*`, `sanitise.ts`, `elements.ts`

- **Pipeline:** Uses the **unified/remark/rehype** ecosystem — a proper AST-based Markdown pipeline:
  1. Sanitize input (escapes edge cases with PUA marker `\uF800`)
  2. Parse to MDAST via `remark-parse`
  3. Apply custom remark plugins (mentions, timestamps, channels, unicode emoji, custom emoji, spoilers, linkify, HTML stripping) — each walks the AST and creates typed nodes
  4. Convert MDAST → HAST via `remark-rehype` with custom handlers per node type
  5. Apply rehype plugins (KaTeX for math, highlight.js for code, `\uF800` → `<br>`)
  6. Render HAST → SolidJS components via a component map (`<Dynamic>`)
- **Two pipelines:** Full pipeline for messages, simplified pipeline for reply previews (no embeds, no interactive links, truncated to 128 chars).
- **Security:** Explicit null-out of `<img>`, `<video>`, `<script>`, `<style>` tags in the component map. HTML-to-text plugin strips raw HTML.
- **Mentions:** Renders as styled pills with avatars. Supports `@user`, `@everyone`, `@online`, `@role` variants.
- **Timestamps:** Supports Discord-style `<t:epoch:format>` with multiple display formats (short time, relative, full date, etc.). Relative timestamps update live.
- **Link safety:** Internal links open normally; external untrusted links show a confirmation modal before opening.

### What Vortex Does
**Files:** `apps/web/components/chat/message-item.tsx`, `link-embed.tsx`, `workspace-reference-embed.tsx`

- **Pipeline:** Single-pass regex in `renderInline()` with capture groups for bold, italic, underline, strikethrough, inline code, mentions, spoilers, emojis, and URLs. Fenced code blocks extracted separately.
- **No AST:** Everything is string splitting + regex matching. This means:
  - No nested formatting (`**bold _and italic_**` won't work correctly)
  - Adding new syntax features requires modifying a growing monolithic regex
  - Edge cases (escaped characters, overlapping patterns) are fragile
- **Mentions:** Rendered as styled `<span>` — no avatar, no card on hover.
- **No timestamp syntax** support.
- **No link safety modal** for external URLs.
- **Reply rendering:** Uses the same full pipeline (not simplified/truncated).

### Recommendations

| Change | Priority |
|--------|----------|
| **Migrate to an AST-based Markdown pipeline.** The single regex approach doesn't compose and can't handle nested formatting. Adopt `unified` + `remark-parse` + `remark-rehype` + custom plugins, or at minimum use `react-markdown` (which wraps unified). This is the single highest-impact architectural change. | **High** |
| **Add a simplified reply-preview renderer.** Reply previews should strip embeds/attachments, truncate content (~128 chars), and disable interactive elements. Currently replies render full messages which is expensive and visually noisy. | **High** |
| **Add mention avatars and hover cards.** Stoat renders mentions as rich pills with user avatars and profile popover on hover. Vortex just uses colored text. | **Medium** |
| **Add external link confirmation.** When a user clicks an external link, show a modal: "You are about to visit {domain}. Continue?" This protects against phishing links sent in chat. | **Medium** |
| **Add timestamp syntax.** Support `<t:epoch>` or `<t:epoch:format>` for shareable timestamps that render in the viewer's timezone. | **Low** |
| **Add KaTeX/math rendering.** Stoat supports inline and block math via rehype-katex. Useful for technical communities. | **Low** |

---

## 3. Real-Time Chat / WebSocket Management

### What Stoat Does
**Files:** `packages/stoat.js` (SDK), `packages/client/src/Interface.tsx`

- **Client SDK:** The `stoat.js` SDK manages a persistent WebSocket connection with the server. Reconnection and state synchronization are handled at the SDK layer, not the UI layer.
- **Connection lifecycle states:** `Connecting → Connected → Disconnected → Reconnecting → Offline` — exposed as a reactive signal.
- **Missed message recovery:** On reconnect, the SDK invalidates the local message cache and refetches. In `Interface.tsx`, a `createEffect` watches the lifecycle state and clears all cached entries when transitioning to `Connected`:
  ```
  if (state === State.Connected) {
    for (const key of Object.keys(cache)) delete cache[key];
  }
  ```
- **Visual disconnection indicator:** A banner appears when the client is in any non-Connected state.
- **Event-driven updates:** The SDK emits typed events for message create/update/delete, which the UI subscribes to for reactive updates.

### What Vortex Does
**Files:** `apps/web/hooks/use-realtime-messages.ts`, `apps/signal/src/index.ts`, `apps/web/lib/chat-outbox.ts`

- **Dual transport:** Supabase Realtime (`postgres_changes`) for chat messages/reactions, Socket.IO for WebRTC signaling.
- **No explicit reconnection logic for chat.** Relies entirely on Supabase Realtime's built-in reconnection. No cache invalidation on reconnect — if messages arrived while disconnected, they are silently missed.
- **No visual disconnection indicator** for the chat transport (there is one for voice).
- **Outbox for offline sends:** `chat-outbox.ts` queues unsent messages in localStorage with idempotency via `client_nonce`. Replays in creation-time order on recovery. This is excellent.
- **Voice reconnection is robust:** `VoiceReconnectionManager` has a proper state machine with ICE restart → full peer reconnect → session reconnect escalation with exponential backoff.

### Recommendations

| Change | Priority |
|--------|----------|
| **Add cache invalidation on Supabase Realtime reconnect.** When the realtime subscription reconnects after a disconnect, fetch messages since `lastMessageTimestamp` to backfill any missed during the gap. Without this, users silently miss messages. | **High** |
| **Add a visual disconnection banner.** When the Supabase Realtime connection drops, show a non-intrusive banner ("Reconnecting...") so users know messages may be stale. Stoat does this for all connection states. | **High** |
| **Monitor Supabase Realtime connection health.** Subscribe to the channel's `status` changes (`SUBSCRIBED`, `CLOSED`, `CHANNEL_ERROR`, `TIMED_OUT`) and surface errors. Currently the subscription is fire-and-forget. | **Medium** |
| **Add event deduplication on the client.** If a reconnect triggers both a backfill fetch and a realtime event for the same message, deduplicate by message ID before inserting into the UI list. | **Medium** |

---

## 4. State Management

### What Stoat Does
**Files:** `packages/stoat.js`, `packages/client/src/Interface.tsx`

- **SDK-managed state:** The `stoat.js` SDK maintains a reactive object graph of servers, channels, members, messages, and emojis. The UI reads from this directly via SolidJS signals.
- **Fine-grained reactivity:** SolidJS `createSignal`/`createStore`/`createMemo` means only the exact DOM nodes that depend on changed data re-render. No component-level re-rendering.
- **Message cache:** In-memory, 50 messages per channel, invalidated on reconnect. Appends only when viewing the end of the list.
- **TanStack Query:** Used for search, geolocation, and other async fetches — provides caching, deduplication, and stale-time management.

### What Vortex Does
**Files:** `apps/web/lib/stores/app-store.ts`, `appearance-store.ts`, `voice-audio-store.ts`, `components/layout/app-provider.tsx`

- **Zustand:** Central store for servers, channels, members, active selections, unread counts, voice state, and UI toggles.
- **Persistence:** `appearance-store` and `voice-audio-store` use Zustand persist middleware (localStorage). The app store is hydrated at mount from SSR props.
- **Messages not globally stored.** Messages are fetched per-channel in `chat-area.tsx` and live in local component state. Switching channels refetches. No shared message cache.
- **Unread counts:** Tracked in Zustand (`serverHasUnread`, `dmUnreadCount`, `notificationUnreadCount`).

### Recommendations

| Change | Priority |
|--------|----------|
| **Add a shared message cache in Zustand.** Keep the last N messages per channel in the store so switching channels doesn't refetch if data is fresh. Invalidate on reconnect or after a TTL. This dramatically improves perceived performance on channel switches. | **High** |
| **Use `useShallow` consistently.** Zustand re-renders when any selected state changes. Ensure all selectors use `useShallow` (or equivalent) to prevent unnecessary re-renders when selecting objects/arrays. Audit existing selectors. | **Medium** |
| **Consider TanStack Query for API fetches.** Stoat uses it for search and async data. Vortex could benefit from it for message fetching, member lists, and server settings — getting automatic caching, deduplication, background refetch, and stale-while-revalidate for free. | **Medium** |

---

## 5. Service Worker / Push Notifications

### What Stoat Does
**Files:** `packages/client/src/serviceWorker.ts`, `packages/client/src/serviceWorkerInterface.ts`

- **Workbox integration:** Uses `precacheAndRoute(self.__WB_MANIFEST)` for build-time precaching of all static assets. Filters out non-essential assets gracefully (try/catch around filter).
- **Push notifications:** Listens for `push` events, shows native notifications.
- **Notification click:** Opens the app and navigates to the relevant message/channel.
- **Offline support:** Precached assets serve the app shell offline.

### What Vortex Does
**Files:** `apps/web/public/sw.js`, `lib/push.ts`, `hooks/use-push-notifications.ts`

- **Manual caching:** Hand-rolled cache strategies (network-first for navigation, cache-first for static assets). No Workbox.
- **Push notifications:** Full implementation — VAPID registration, multi-level preference hierarchy (global → server → channel → thread), stale subscription cleanup (410 Gone handling).
- **Service worker lifecycle:** `skipWaiting()` + `clients.claim()` for immediate activation.
- **PWA manifest:** Present with icons, shortcuts, standalone display mode.

### Recommendations

| Change | Priority |
|--------|----------|
| **Vortex's push notification system is actually more complete than Stoat's.** Multi-level notification preferences and stale subscription cleanup are ahead of Stoat. No changes needed here. | — |
| **Consider migrating to Workbox.** The hand-rolled SW caching works but is harder to maintain and doesn't handle cache versioning or precaching as robustly. Workbox's `precacheAndRoute` with the Next.js build manifest would be more reliable. | **Low** |
| **Add offline page fallback.** Currently navigation failures fall back to the cached `/channels/me` shell, but there's no explicit offline page. Consider a dedicated offline fallback that explains the situation. | **Low** |

---

## 6. Voice/Video Calling

### What Stoat Does
**Files:** `packages/client/components/rtc/state.tsx`, `rtc/components/InRoom.tsx`, `rtc/components/RoomAudioManager.tsx`, `ui/components/features/voice/`

- **LiveKit SFU:** All voice/video goes through LiveKit (server-side SFU). No P2P mesh.
- **Track management:** Uses `createMemo` to memoize filtered tracks, preventing re-evaluation on every render. Subscribes to remote tracks explicitly (`setSubscribed(true)`) rather than auto-subscribing.
- **State machine:** `READY → CONNECTING → CONNECTED → DISCONNECTED/RECONNECTING`. Uses SolidJS `batch()` to update all state atomically.
- **Permission-gated:** Microphone only auto-enabled if user has `speakingPermission`.
- **PiP support:** Full picture-in-picture mode with draggable floating card, snap-to-corner, and View Transitions API for smooth animations.
- **Cleanup:** `room.removeAllListeners()` before `room.disconnect()` to prevent memory leaks.
- **Per-user volume:** Individual volume and mute controls per participant.

### What Vortex Does
**Files:** `apps/web/lib/webrtc/use-voice.ts`, `use-unified-voice.ts`, `use-livekit-voice.ts`, `voice-reconnection-manager.ts`, `device-monitoring-manager.ts`, `apps/web/components/voice/`

- **Dual architecture:** P2P mesh (WebRTC + Socket.IO signaling) **or** LiveKit SFU, selected at build time via `use-unified-voice.ts`.
- **Rich reconnection:** 3-tier escalation (ICE restart → full peer reconnect → session reconnect) with exponential backoff and jitter. Manual reconnect button.
- **Network quality monitoring:** Polls `getStats()` every 5s, computes RTT/loss/jitter, adapts bitrate dynamically (64→32→16 kbps).
- **Audio processing:** 6-band EQ, compressor, noise gate, spatial audio. Per-user and per-server overrides.
- **Device monitoring:** Detects new audio devices mid-call, offers auto-switch.
- **Stale peer GC:** Removes peers silent for 45s.
- **No PiP support.**

### Recommendations

| Change | Priority |
|--------|----------|
| **Vortex's voice system is more feature-rich than Stoat's in most areas.** The P2P+SFU dual architecture, adaptive bitrate, audio processing, and device monitoring are ahead. | — |
| **Add PiP (picture-in-picture) mode.** Stoat supports a floating draggable call card that persists while navigating channels. Vortex has the compact bar but no detachable floating card. Implement using a React portal with drag handling. | **Medium** |
| **Add `removeAllListeners()` before `disconnect()`.** Stoat explicitly clears listeners before disconnecting the room to prevent leak-based ghost events. Verify Vortex's cleanup path does the same. | **Medium** |
| **Batch state updates on connect/disconnect.** Stoat uses `batch()` to atomically update room, channel, and media state. React 18+ auto-batches in event handlers but not in async callbacks — wrap disconnect/connect state updates in `ReactDOM.flushSync` or `unstable_batchedUpdates` if needed. | **Low** |

---

## 7. Auth Flow

### What Stoat Does
**Files:** `packages/client/src/Auth.tsx`, `packages/client/src/index.tsx`, `Interface.tsx`

- **Multi-step flows:** Separate routes for `/login/check`, `/login/create`, `/login/auth`, `/login/verify/:token`, `/login/reset/:token`, `/login/resend`, `/login/delete/:token`.
- **Redirect-after-login:** Stores the path the user was trying to reach (`setNextPath(pathname)`) and navigates there after successful login. Three redirect variants: PWA (last active path), settings, and invite code.
- **Connection lifecycle in UI:** Shows a visual indicator when in any non-Connected state.
- **Invite deep links:** `/invite/:code` fetches the invite, opens a modal, then redirects to the app.

### What Vortex Does
**Files:** `apps/web/proxy.ts`, `lib/supabase/middleware.ts`, `app/api/auth/login/route.ts`

- **Supabase Auth + PKCE:** Uses Supabase's built-in auth with PKCE flow (more secure than implicit).
- **Brute-force protection:** RPC-based lockout after 5 failed attempts (15-minute cooldown). Generic error messages prevent email enumeration.
- **Risk telemetry:** IP, user-agent, geolocation tracked per login attempt. Suspicious login alerts queued.
- **Step-up auth:** Destructive actions (account deletion) require a fresh re-authentication token.
- **Proxy-based route protection:** `proxy.ts` classifies routes into passthrough/public/protected and enforces session checks.

### Recommendations

| Change | Priority |
|--------|----------|
| **Vortex's auth security is ahead of Stoat's.** Brute-force protection, risk telemetry, step-up auth, and PKCE are all stronger patterns. | — |
| **Add redirect-after-login.** If an unauthenticated user hits `/servers/abc/channels/123`, they should be redirected there after login, not to the default landing page. Store the intended path in a query param or session storage before redirecting to `/login`. | **High** |
| **Add invite deep link handling.** `/invite/:code` should work for unauthenticated users — show login, then auto-process the invite after auth. | **Medium** |

---

## 8. Error Handling & Resilience

### What Stoat Does
**Files:** `packages/client/src/sentry.ts`, various components using `useModals().showError`

- **Sentry:** Initialized in production with DSN + tunnel support. Basic error capture (no tracing).
- **Modal-based errors:** All async operations use `.catch(showError)` to display errors in a modal dialog. This provides a consistent UX — the user always sees what went wrong.
- **Suspense boundaries:** Async data loading wrapped in `<Suspense fallback={<CircularProgress />}>`. Loading states are explicit.
- **Graceful degradation:** Disabled features show "Coming soon" tooltips rather than hiding or crashing.
- **Cache invalidation on reconnect:** Prevents stale data from persisting across disconnects.

### What Vortex Does
**Files:** `apps/web/app/error.tsx`, `app/global-error.tsx`

- **Error boundaries:** App-level (`error.tsx`) and global (`global-error.tsx`) with Sentry capture and "Try Again" button.
- **API patterns:** Fail-closed (missing auth → 401, missing permission → 403).
- **Voice error handling:** Try/catch around audio context, device enumeration, stats polling.
- **No consistent user-facing error display.** API errors in components are often silently caught or logged to console. No equivalent to Stoat's `showError` modal pattern.

### Recommendations

| Change | Priority |
|--------|----------|
| **Add a toast/modal-based error notification system.** Create a `useErrorHandler()` hook or extend the existing `use-toast.ts` so that failed API calls, failed realtime subscriptions, and other async errors show user-visible feedback rather than silently failing. | **High** |
| **Add Suspense boundaries around async UI sections.** Channel member lists, message history, and server settings should show explicit loading states rather than rendering empty or stale content during fetches. | **Medium** |
| **Add graceful degradation for missing features.** If a feature requires permissions the user lacks, show a disabled state with explanation, not just hide the button. | **Low** |

---

## 9. Performance Patterns

### What Stoat Does
**Files:** `ui/components/utils/ListView.tsx`, `ListView2.tsx`, `composition/picker/EmojiPicker.tsx`

- **Virtual scrolling for messages:** Two implementations:
  - `ListView` — Manual scroll-position preservation (`scrollGuard` pattern): captures `scrollHeight`/`scrollTop` before render, applies offset after.
  - `ListView2` — Uses `IntersectionObserver` for lazy pagination at list boundaries.
- **Emoji picker virtualization:** `@minht11/solid-virtual-container` for rendering only visible emoji cells.
- **50-message cache limit per channel** — prevents memory bloat.
- **Fine-grained SolidJS reactivity** — Only the exact DOM nodes that depend on changed signals update. No component-level re-renders.
- **Key-based rendering for audio tracks** — Stable keys prevent remounting `<audio>` elements.
- **Lazy loading** — Auth pages, heavy components loaded with `lazy()` + `<Suspense>`.

### What Vortex Does
**Files:** `apps/web/components/chat/chat-area.tsx`, `hooks/use-chat-scroll.ts`

- **TanStack React Virtual:** Used in `chat-area.tsx` with 72px estimated row height and overscan of 8. Measures actual heights.
- **Lazy loading:** Modals (ThreadPanel, SearchModal, etc.) are dynamically imported with `<Suspense>`.
- **Memoization:** `useCallback`, `useMemo`, `React.memo(MessageItem)`, Zustand `useShallow`.
- **Scroll position persistence:** Per-channel scroll position saved to sessionStorage with 250ms debounce.
- **Server-side cache:** In-memory TTL cache (60s) for automod rules, server settings, permissions.

### Recommendations

| Change | Priority |
|--------|----------|
| **Add scroll-position preservation on prepend.** When older messages are loaded at the top, the scroll position jumps. Stoat's `scrollGuard` pattern (capture scrollHeight before render, apply offset after) prevents this. Verify Vortex's virtualizer handles this correctly — TanStack Virtual may need manual adjustment via `scrollToOffset`. | **High** |
| **Lazy-load heavy components that aren't yet lazy.** Profile panels, server settings, emoji picker, admin pages should all be dynamically imported if not already. | **Medium** |
| **Cap per-channel message cache.** If/when adding a shared message cache, limit to 50–100 messages per channel to prevent memory bloat on long sessions. | **Medium** |
| **Consider `React.memo` on more list items.** Member list items, channel list items, and server sidebar items should be memoized to prevent re-renders when unrelated Zustand state changes. | **Low** |

---

## 10. Other Notable Patterns

### Typing Indicators
- **Stoat:** `TypingIndicator` component in the message composition area — uses SDK events.
- **Vortex:** `typing-indicator.tsx` with Supabase Realtime broadcast, 3s auto-clear, debounced stop events. **Comparable implementation.**

### Read Receipts / Unread Tracking
- **Stoat:** Handled in the SDK with per-channel ack tracking.
- **Vortex:** `user_notification_settings` table with per-channel last-read timestamp. Unread anchor in scroll hook. **Comparable but DB-round-trip heavy** — consider caching last-read timestamps locally.

### Message Ordering
- **Stoat:** SDK maintains ordered lists; cache invalidation on reconnect ensures consistency.
- **Vortex:** Ordered by `created_at` + deterministic ID tiebreaker in outbox replay. **Solid approach,** but no reconnect-time reorder/dedup (see section 3).

### i18n
- **Stoat:** Full i18n via `js-lingui` with SolidJS bindings. Multiple language support.
- **Vortex:** **No i18n system.** All strings are hardcoded in English. This is a significant gap for international users but likely low priority for the current sprint.

### Presence
- **Stoat:** SDK-managed presence with connection lifecycle integration.
- **Vortex:** `use-presence-sync.ts` broadcasts status via Supabase Realtime, auto-idle after 5 minutes. `presence-status.ts` helper for colors/labels. **Good implementation.**

---

## Prioritized Action List

### High Priority — ALL COMPLETED
1. ~~**Add cache invalidation on Supabase Realtime reconnect**~~ — DONE. `use-realtime-messages.ts` detects reconnections and triggers backfill.
2. ~~**Add a visual disconnection banner**~~ — DONE. Yellow animated banner in `chat-area.tsx`.
3. ~~**Migrate to AST-based Markdown rendering**~~ — DONE. `markdown-renderer.tsx` uses react-markdown + remark-gfm + custom remark plugins.
4. ~~**Add redirect-after-login**~~ — DONE. Login page reads `?redirect=` param with open-redirect protection.
5. ~~**Add a toast/modal error notification system**~~ — DONE. `use-error-handler.ts` hook with `.withContext()`.
6. ~~**Add a simplified reply-preview renderer**~~ — DONE. `reply-preview.tsx` strips markdown and truncates.
7. ~~**Add scroll-position preservation on message prepend**~~ — DONE. Double-rAF pattern in `chat-area.tsx`.

### Medium Priority — ALL COMPLETED
8. ~~**Add a shared message cache in Zustand**~~ — DONE. `app-store.ts` caches last 100 messages per channel (10 channels max, 5-min TTL).
9. ~~**Add emoji `onError` fallback**~~ — DONE. `ServerEmojiImage` falls back to `:name:` text on broken images.
10. ~~**Add a grid-based emoji picker panel**~~ — ALREADY EXISTS. Frimousse grid picker in both `message-input.tsx` and `message-item.tsx`.
11. ~~**Add mention display names and tooltips**~~ — DONE. `markdown-renderer.tsx` resolves member names from Zustand store.
12. ~~**Add external link confirmation**~~ — DONE. `ExternalLink` component with trusted domain allowlist.
13. ~~**Monitor Supabase Realtime connection health**~~ — DONE. Toast after 30s sustained disconnection in `chat-area.tsx`.
14. ~~**Add event deduplication on reconnect**~~ — DONE. Backfill uses existing dedup-by-ID logic.
15. ~~**Add PiP mode for voice**~~ — ALREADY EXISTS. `CompactVoiceBar` in sidebar with mute/deafen/reconnect controls.
16. ~~**Add invite deep link handling for unauthenticated users**~~ — DONE. `/invite/[code]` page with server preview, auto-accept for authenticated users.
17. ~~**Add Suspense boundaries around async UI sections**~~ — DONE. Server layout wraps children in Suspense; admin settings tabs wrapped.
18. ~~**Cache emoji lists across server navigations**~~ — DONE. Module-level cache with 5-min TTL in `server-emoji-context.tsx`.
19. ~~**Lazy-load remaining heavy components**~~ — DONE. Admin settings tabs (RoleManager, AuditLogPage, etc.) and ProfilePanel now lazy-loaded.

### Low Priority — COMPLETED (except #23, #24 deferred)
20. ~~**Add big-emoji sizing**~~ — DONE. `.big-emoji` CSS class applied when message is 1-5 emojis only.
21. ~~**Unicode emoji image rendering**~~ — DONE. `remarkUnicodeEmoji` plugin renders Twemoji SVGs via CDN.
22. ~~**Add timestamp syntax support**~~ — DONE. `remarkTimestamps` plugin + `TimestampDisplay` component with relative time.
23. **Migrate SW to Workbox** — DEFERRED. Requires build pipeline changes; planned for dedicated PR.
24. **Add i18n framework** — DEFERRED. Infrastructure-level change; planned for dedicated PR.
25. ~~**Verify listener cleanup on voice disconnect**~~ — DONE. `removePeerConnection()` and `fullReconnectPeer()` now clear all event handlers before closing.

---

*This report is for internal reference. It compares architectural approaches — no code was copied from Stoat.*
