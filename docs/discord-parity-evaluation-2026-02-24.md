# Discord Parity + Opportunity Evaluation (VortexChat)

Date: 2026-02-24 (verified via full codebase audit 2026-02-24)
Evaluator role: Product Engineering + QA + UX Research
Baseline assumption: Discord desktop/web + mobile ecosystem as of ~2025 (communities, forums, threads, onboarding/screening, role-based permissions, voice/video/screenshare, mod tools, activity status, and richer notification controls).

## Method and evidence sources
- Full static repo audit of all UI components, hooks, API routes, migrations, shared packages, and existing audit documents.
- Verified every claim against actual source files with line-number evidence.
- Core evidence includes chat/voice hooks and components, auth/session/passkey endpoints, permission engine, moderation/automod/appeals routes, notification/push system, search API, friends API, and WebRTC signal server.
- Where implementation is not visible from repository-only inspection (e.g., mobile push delivery reliability, production infra scaling), status is marked as best-guess.

---

## 1) Parity Scorecard (Discord → My App)

| Category | Discord behavior (expected) | My app status | Evidence | Impact | Fix complexity | Proposed implementation approach |
|---|---|---|---|---|---|---|
| Accounts & Identity (login, MFA, sessions) | Password + passkey/MFA options, session list/revoke, trusted devices | ⚠️ partial | Passkey login with WebAuthn challenge replay checks (`login/verify/route.ts:59`), TOTP 2FA via Supabase MFA (QR + 6-digit verify in `TwoFactorSection`), session list/revoke-all API, trusted devices with 30-day expiry, security policy controls (passkey-first/enforce). **Missing:** backup/recovery codes, step-up auth for risky actions, individual session revoke (bulk only), session anomaly alerts, OAuth/social login | High | M | Add TOTP backup codes on setup, require re-auth before disabling MFA, implement per-session revocation UI, add suspicious login alerts |
| Servers/Guilds (create, invite, roles, permissions) | Server creation, invites, granular role permission model incl overrides | ✅ mostly | 20-bit permission bitmask in `packages/shared`, role hierarchy enforced via position-based checks in member role routes, channel permission overrides with deny-first precedence formula `(base & ~deny) | allow` in `lib/permissions.ts:75-109`, invite lifecycle with expiry/max-use/revocation and friendly error messages. **Missing:** effective-permission viewer per member+channel context (role manager exists but not computed view) | High | S | Add effective-permission inspector showing computed permissions for member in specific channel, fix permission bit import in timeout route |
| Channels (text/voice/video, categories, threads) | Text/voice/video channels, categories, threads, forum-like flows | ✅ mostly | 7 channel types (text/voice/category/forum/media/stage/announcement) with creation modal, temporary channels with expiry (1h-1w), category nesting, thread creation/panel/realtime, thread discoverability via ThreadList, video in voice channels (camera + screenshare). **Missing:** stage/forum/media channel-type-specific UX depth, per-type permission enforcement | High | S | Harden channel-type specific UX (stage mode, forum posting rules, media masonry), enforce permissions per type |
| Messaging (send/edit/delete, replies, mentions, embeds, markdown) | Rich editor behavior, edit/delete/reply, mentions, embeds, markdown parity | ✅ matches (core) | Enter-to-send/Shift+Enter-newline, edit mode (Enter save/Esc cancel), mention autocomplete with Tab/Enter/Esc, @everyone permission enforcement (403 on violation), reply preview with author+snippet, message permalink deep-link with indigo highlight + 2.2s fade + "back to where you were" button, markdown (bold/italic/underline/strikethrough/code/code-blocks/quotes/spoilers), link embeds via OEmbed, server emoji rendering, slowmode enforcement, typing indicators (3s timeout). **Missing:** click-to-jump on reply references, pinned messages (queued) | High | S | Add reply-reference click-to-scroll, ship pinned messages, add remaining edge formatting tests |
| Attachments (images/files, previews, limits) | Drag/drop uploads, previews, safety checks, size limits/error clarity | ⚠️ partial | Drag-drop (`handleDrop` in message-input.tsx:210-214), clipboard paste for images (`handlePaste`:216-225), file preview with thumbnails and remove button, signed URL upload with 7-day expiry. **Missing:** no general file size limits enforced (only 256KB for emoji), no server-side MIME validation on message attachments, no AV scanning, no file extension blocklist, no quarantine system, no upload progress indicator | High | M | Add server-side MIME sniffing + extension blocklist, enforce size limits, add upload progress UI, implement async AV scan queue |
| Search (messages, users, channels) | Scoped search with filters (from/user/has/link/date/channel) | ⚠️ partial | Unified `/api/search` with Supabase FTS (`textSearch` + `websearch` config) across messages/tasks/docs, channel and server scope filtering. **Missing:** no filter syntax parsing (`from:`, `has:`, `before:`, `after:`), no result-type tabs in UI, no jump-to-surrounding-context from search result | Med | M | Add filter chip parser, result-type tabs, jump-to-message context, saved queries |
| Presence & Status (online/idle/dnd, custom status) | Presence + custom status text/emoji, cross-surface consistency | ⚠️ partial | `usePresenceSync` hook tracks online/offline via Supabase Realtime Presence, DB schema has 5 status types (online/idle/dnd/invisible/offline) and `status_message` column. **Missing:** no API endpoint to update status, no UI for changing presence mode (only auto online/offline), no idle detection mechanism, no custom status editor, no status emoji field, no expiry presets | Med | M | Add status update API + UI, implement idle detection timer, add custom status editor with emoji and expiry |
| Notifications (push, desktop, per-channel overrides, mute) | Granular per-channel/server/device notifications + mention-only rules | ⚠️ partial | In-app notifications (mention/reply/friend_request/server_invite/system), per-channel and per-server settings with modes (all/mentions/muted), notification bell with unread counts and mark-all-read, push notifications via service worker with correct channel routing on click. **Missing:** per-thread notification overrides, notification policy hierarchy engine (global→server→channel→thread), notification precedence explainability UI | High | M | Model notification policy hierarchy with per-thread overrides and preview simulator |
| Reactions & Emoji (custom emoji, stickers if applicable) | Fast reactions, custom emoji/sticker support, picker quality | ❌ mostly missing | Custom emoji CRUD fully implemented (upload PNG/WebP/GIF, 256KB limit, 50/server cap, CRUD API at `/api/servers/[serverId]/emojis`), emoji rendering via `ServerEmojiProvider` context, emoji picker with Giphy GIF search. **CRITICAL:** Reactions have DB schema (`reactions` table with composite key) and realtime subscriptions but **NO API endpoints for adding/removing reactions**. Stickers completely absent (no schema, API, or UI). | Med | M | Build reaction CRUD API endpoints with optimistic UI and rapid-click idempotency, add unified emoji/sticker picker, implement sticker system |
| Moderation basics (ban/kick/timeouts, audit log equivalents) | Ban/kick/timeout/report/audit history with actor/target context | ✅ mostly | Ban (CRUD + removes member), timeout (PUT/DELETE with 28-day max), audit log with comprehensive action coverage (ban/kick/timeout/automod/role/settings/pin/screening), moderation timeline UI with chronological display and diff visualization, moderation appeals system with anti-abuse scoring and status workflow. **Missing:** user-facing reporting pipeline (moderator tools exist but users cannot report messages/users) | High | M | Add user/message reporting pipeline, moderation command center with case management |
| Safety controls (spam/rate limits, reporting) | Anti-spam, automod, report abuse, raid mitigation | ⚠️ partial | AutoMod engine with 5 rule types (keyword/regex/mention_spam/link_spam/rapid_message), safe regex evaluation (200-char limit, 50ms timeout, nested quantifier blocking), dry-run mode, analytics (hit count/false positives), actions (block/quarantine/timeout/warn/alert). Rate limiting: messages 5/10s, appeals 3/hr. **Missing:** user reporting completely absent, no distributed rate limiting (in-memory only), no IP-based limiting, no rate limits on reactions/channel-creation/role-changes, no raid mitigation | High | L | Add message/user reporting pipeline, distributed rate limiter (Redis), IP-based throttles, raid detection |
| Voice (join/leave, mute/deafen, screenshare, QoS basics) | Stable low-latency voice, mute/deafen, screenshare, device controls | ✅ mostly | Signal server (Socket.IO + Supabase auth), WebRTC peer connections with trickle ICE, mute/deafen/speaking (hark.js VAD), screenshare with spotlight UI, camera video in voice channels (1280x720), DM calls (voice + video), push-to-talk with configurable key, comprehensive device controls (input/output selection, hot-swap detection), professional audio pipeline (6-band EQ, compressor, noise gate, presets), spatial audio panning, per-user volume/pan controls, configurable STUN/TURN, heartbeat (5s) + stale peer GC (45s). **Missing:** no QoS monitoring (no getStats/bitrate adaptation/packet-loss tracking), no explicit reconnect state machine (relies on browser/Supabase auto-recovery), no codec negotiation | High | M | Add RTC stats monitoring with adaptive bitrate, implement explicit reconnect state machine, add network quality indicator |
| DMs & Groups | 1:1 + group DMs, membership management, call handoff | ⚠️ partial | 1:1 and group DM creation (auto-detect 3+ members), DM channel listing with unread status and latest message, DM messages with push notifications, DM calls (voice + video) with call-invite/accept/decline flow. Group DM has owner model with add/remove members. **Missing:** no DM attachments (server messages support them but DMs don't), no DM message editing/deletion, no group DM permissions/roles, no group invite links, no block enforcement in DM send path | Med | M | Add DM attachments/editing/deletion, block enforcement in DM send, group DM invite links |
| Friend system (requests, blocks) | Request/accept/decline/block/unblock with privacy controls | ⚠️ partial | Full friend request lifecycle (send/accept/decline/block/unblock), bidirectional relationship handling, auto-accept on mutual request, UI with tabs (Online/All/Pending/Blocked). **CRITICAL:** Block state only enforced in friend request handler; NOT enforced in DM send, reactions, mentions, or search. Users can message blocked contacts via DM API. | Med | M | Central authorization guard checking block state in all DM/message/reaction/mention paths |
| Settings (per-user & per-server) | Deep user/server settings with discoverable IA | ⚠️ partial | Profile settings modal (username/display_name/avatar/banner), security tab (passkeys/2FA/sessions), server moderation settings (verification_level 0-4, content_filter 0-2, default_notifications, screening, automod controls), notification settings per channel/server. **Missing:** no privacy settings, no voice settings persistence API, no appearance settings API (DB column exists but no CRUD), route-scale IA still thinner than Discord | Med | M | Split into dedicated settings routes with section search, add privacy/voice/appearance settings APIs |
| Accessibility (keyboard nav, screen reader, contrast) | Full keyboard navigation + robust ARIA + contrast compliance | ⚠️ partial | Radix Dialog focus trapping, 12 keyboard shortcuts (`use-keyboard-shortcuts.ts`) with scope-aware handling, ARIA labels on notification bell and channel sidebar, mention suggestions with aria-selected. **Missing:** widespread `focus:outline-none` without `focus-visible:ring` fallback, no `aria-live` regions for real-time updates, icon-only buttons lacking consistent labeling, no automated a11y CI checks (axe), no contrast verification | High | M | Run axe + keyboard CI gates, enforce focus-visible globally, add aria-live for messages/typing/presence, label all icon buttons |
| Performance (message list virtualization, caching) | Smooth large channel history and efficient render behavior | ⚠️ partial | Infinite scroll with cursor-based pagination, message grouping (same author within 5min), scroll position persistence in sessionStorage, "Jump to present" with pending count. Service worker caches 2 static routes. **Missing:** no message list virtualization (all messages rendered in DOM), no API response caching layer, service worker cache minimal, no render budget controls | High | L | Introduce windowed list virtualization (@tanstack/react-virtual), expand service worker caching, add React Query for API response caching |
| Reliability (offline handling, reconnect behavior) | Offline compose queue, reconnect replay, duplicate prevention | ⚠️ partial | Outbox pattern in `chat-outbox.ts` with queued/sending/failed states, deterministic replay order via `resolveReplayOrder()`, online/offline detection, Supabase Realtime auto-reconnect. **Missing:** no explicit exponential backoff, no idempotency key enforcement on server, no circuit breaker pattern, voice reconnect relies on manual rejoin | High | L | Implement server-side idempotency keys, add exponential backoff with jitter, implement voice auto-reconnect state machine |

---

## 2) "Expected Behaviors" Checklist (parity breakpoints)

Status key: ✅ verified in code, ⚠️ likely partial, ❌ confirmed missing, ❓ unknown from repo-only view.

1. Enter sends, Shift+Enter newline — ✅ — `resolveComposerKeybinding()` in message-input.tsx:155-188; placeholder confirms behavior — Regression test: composer key handling.
2. Escape closes mention picker before clearing draft — ✅ — `use-mention-autocomplete.ts`:83-106 handles Escape to dismiss — Regression test: mention state machine.
3. Tab/Enter accepts selected mention suggestion — ✅ — Same hook processes Tab/Enter for acceptance — Regression test: mention component.
4. Typing indicator appears quickly (<500ms after typing) — ✅ — `useTyping` broadcasts on keystroke via Supabase Realtime — Regression test: typing broadcast throttling.
5. Typing indicator clears within ~3s after stop — ✅ — `TYPING_TIMEOUT_MS = 3000` in use-typing.ts — Regression test: timeout constants.
6. Message edit mode saves on Enter, newline on Shift+Enter — ✅ — message-item.tsx:326-334 handles Enter/Escape — Regression test: edit textbox rules.
7. Deleted message disappears/replaced consistently without ghost spacing — ⚠️ — Realtime DELETE subscription exists; visual consistency under concurrent sessions untested — Fix: message list reconciliation.
8. Reply preview shows author + snippet and jumps when clicked — ⚠️ — Reply preview with author+content shown (message-input.tsx:244-262); reply displayed in message (message-item.tsx:219-228); **click-to-jump on reply reference NOT implemented** — Fix: reply anchor navigation click handler.
9. Message link deep-links and highlights target row — ✅ — Full implementation: `?message={id}` query param, `loadMessageContextWindow()` with 8-attempt pagination loop, indigo-400/70 ring highlight with 2.2s fade, "Back to where you were" button (chat-area.tsx:642-703, 1149-1158) — Regression test: permalink routing.
10. New message divider appears exactly once after reconnect — ⚠️ — Unread anchor stored in sessionStorage, divider rendered before first unread (chat-area.tsx:1055-1066); reconnect behavior specifically untested — Fix: read-state + divider reducer.
11. Jump-to-present button appears when scrolled away — ✅ — "Jump to present" button with pending message count, shown when `!isAtBottom` (chat-area.tsx:1137-1147) — Regression test: scroll anchor controls.
12. Infinite history load preserves viewport anchor — ⚠️ — Scroll position saved/restored via sessionStorage (chat-area.tsx:543-597); pagination triggered at <120px from top; viewport anchor robustness under high throughput untested — Fix: virtualizer/offset anchoring.
13. Mention highlight for `@you` distinct from general unread — ⚠️ — Mentions rendered with blue highlight (`<@username>` regex in message-item.tsx:124-125); `mention_count` tracked in `read_states` table; visual distinction between mention-unread and general-unread unclear — Fix: unread model.
14. `@everyone` permission enforcement per role/channel — ✅ — `MENTION_EVERYONE` permission checked in messages/route.ts:189-191; returns 403 Forbidden when unpermitted — Regression test: permission gate.
15. Emoji reaction toggles idempotently on rapid clicks — ❌ — **No reaction API endpoints exist.** Schema has `reactions` table with composite key (message_id, user_id, emoji) but no POST/DELETE routes — Fix: build reaction CRUD API with optimistic UI and idempotency.
16. Reaction counts converge correctly across multiple clients — ❌ — Same: no reaction API. Realtime subscriptions for INSERT/DELETE on reactions table exist but nothing writes to it — Fix: build reaction API.
17. Attachment upload shows progress, failure, retry — ⚠️ — File preview shown before send; upload to `attachments` bucket with signed URL; no explicit progress bar or retry UI visible — Fix: upload UI state machine with progress indicator.
18. Image attachment opens in lightbox with keyboard nav — ❌ — No lightbox/media viewer component found; images rendered inline only — Fix: media viewer component with prev/next/Esc keyboard nav.
19. Drag-drop file onto composer opens attach flow — ✅ — `handleDrop()` in message-input.tsx:210-214 extracts files from `dataTransfer`, prevents default — Regression test: dropzone integration.
20. Pasting image from clipboard attaches file — ✅ — `handlePaste()` in message-input.tsx:216-225 filters for image MIME types, converts clipboard items to File objects — Regression test: clipboard handlers.
21. Markdown inline code, bold, italics render accurately — ✅ — Full regex-based rendering in message-item.tsx:101-196 (bold, italic, underline, strikethrough, inline code, spoilers) — Regression test: parser snapshot tests.
22. Multi-line quote blocks preserve line grouping — ✅ — Block quote rendering with left-border styling (message-item.tsx:144-153) — Regression test: renderer edge-case tests.
23. Code fences preserve language + whitespace — ✅ — Triple-backtick parsing with language tag support, monospace styling (message-item.tsx:169-195) — Regression test: renderer snapshot tests.
24. URL embeds suppress when link from blocked domains — ❓ — OEmbed API fetches metadata; no domain blocklist or suppression policy found — Fix: embed sanitizer policy with domain blocklist.
25. Presence toggles (online/idle/dnd/invisible) reflect quickly — ⚠️ — `usePresenceSync` auto-sets online on mount and offline on beforeunload; **no UI exists for manually changing status mode** (dnd/idle/invisible); no idle detection timer — Fix: add status toggle UI and idle detection.
26. Custom status emoji/text appears in sidebar + profile — ❌ — DB has `status_message` column on users table; friends sidebar displays it; **no API endpoint to set custom status, no editor UI** — Fix: status update API + custom status editor with emoji and expiry.
27. Notification mute for channel suppresses badge + sound — ⚠️ — Per-channel notification settings (all/mentions/muted) stored and retrieved via API; push notification sender respects muted setting via `sendPushToChannel`; exact badge/sound suppression behavior needs runtime testing — Fix: notification resolver.
28. Per-thread notification override inherits correctly — ❌ — Notification settings only support server-level and channel-level granularity; **no thread-level notification overrides** — Fix: notification hierarchy model with thread tier.
29. Desktop push uses actionable payload and opens exact channel — ✅ — Service worker `notificationclick` handler extracts URL from notification data, focuses existing window or opens new, navigates to correct channel (sw.js) — Regression test: service worker click routing.
30. Invite links respect expiry + max-use semantics — ✅ — Invite creation supports `max_uses`, `expires_at`, `temporary`; join endpoint checks expiry ("Invite expired"), max-uses ("This invite has been used too many times"), banned status, duplicate membership (invites/[code]/route.ts) — Regression test: invite lifecycle.
31. Revoked invite fails with friendly UX — ✅ — DELETE by owner/creator removes invite; invalid code returns friendly error; existing member returns success — Regression test: invite route errors.
32. Role reordering updates permission precedence immediately — ⚠️ — Roles sorted by `position DESC` in API; hierarchy enforced for assignment (non-admins cannot assign roles at/above their highest position); whether reorder triggers immediate permission recompute on active sessions untested — Fix: role hierarchy recompute + regression tests.
33. Channel permission overrides resolve correctly with deny > allow rules — ✅ — `getChannelPermissions()` in lib/permissions.ts:75-109 implements `(base_perms & ~denyMask) | allowMask`; deny bits removed first, then allow bits re-added; if bit in both deny and allow, allow wins (matches Discord behavior) — Regression test: permission engine matrix.
34. Kicked user loses realtime access instantly — ⚠️ — Ban removes from server_members; Supabase RLS should revoke access; whether active Realtime subscriptions terminate immediately untested — Fix: authz checks in subscriptions + force-disconnect on ban/kick.
35. Timeout blocks send but still allows read as configured — ⚠️ — Timeout stored in `member_timeouts` table; message POST checks `timed_out_until` field; read-access behavior during timeout needs runtime testing — Fix: server checks in message POST.
36. Audit log records moderator action with reason metadata — ✅ — Comprehensive audit logging for ban/kick/timeout/automod/role/settings/pin/screening with reason, duration, actor, target, and changes JSONB; owner-only query API with action/actor/target filters (audit-log/route.ts) — Regression test: audit write consistency.
37. Search query with channel filter returns only authorized messages — ✅ — Search validates serverId and channelId membership before querying — Regression test: authorization guard tests.
38. Search results jump to surrounding message context — ⚠️ — Message permalink system exists (item #9) but search result click-to-jump integration not confirmed in search modal — Fix: wire search results to permalink jump.
39. Voice join handles denied mic permissions gracefully — ✅ — Comprehensive error handling: NotAllowedError/PermissionDeniedError → "Microphone permission denied", NotFoundError → "No device available", NotReadableError → "Device in use", OverconstrainedError → "Device doesn't support constraints" (use-voice.ts) — Regression test: voice preflight UX.
40. Push-to-talk works when app focused and releases on keyup — ✅ — `use-push-to-talk.ts`: configurable key (default Space), persistent via localStorage, smart activation (skips input/textarea/contentEditable), keyup release, race condition prevention via activeRef — Regression test: PTT hook key listeners.
41. Screenshare starts/stops with participant state updates — ✅ — `toggleScreenShare()` in use-voice.ts: getDisplayMedia capture, video track management on peer connections, screenSharing state broadcast, auto-stop on browser stop (track.onended), spotlight UI with participant name overlay — Regression test: signaling events + UI badges.
42. Reconnect after network drop restores voice room automatically — ❌ — Heartbeat (5s) + stale peer GC (45s) handle participant cleanup; Supabase Realtime auto-reconnects; **but no explicit voice room rejoin state machine** — user must manually rejoin if local connection dies — Fix: session reconnection state machine with automatic room rejoin.
43. DM unread counts sync between sidebar and tab title — ⚠️ — DM unread tracked via `dm_read_states` table, sidebar shows `is_unread` boolean; **no `document.title` update with unread count** (browser tab shows no badge) — Fix: unread aggregation store + tab title badge.
44. Group DM member add/remove events update all clients — ❓ — Owner can add/remove members via API; no explicit Realtime subscription for group membership changes found — Fix: group realtime events for member add/remove.
45. Blocking user prevents DM delivery and friend requests — ⚠️ — Block prevents new friend requests (friends/route.ts); **block NOT enforced in DM send endpoint** (dm/channels/[channelId]/messages) — users can message blocked contacts — Fix: server-side block check in DM/message write paths.
46. Keyboard shortcut modal reflects actual active bindings — ✅ — `use-keyboard-shortcuts.ts` defines 12 shortcuts with scopes; shortcuts modal displays them; bindings are the same source — Regression test: centralized shortcut registry.
47. Command palette/quickswitcher supports fuzzy jump by server/channel/user — ⚠️ — Ctrl+K shortcut registered; search modal exists; actual fuzzy matching quality and scope coverage needs runtime testing — Fix: indexed local cache with fuzzy matching.
48. Modal focus trap prevents background interaction — ✅ — All modals use Radix Dialog which provides built-in focus trapping and restore — Regression test: dialog primitives + a11y tests.
49. Screen reader announces new messages without excessive verbosity — ❌ — **No `aria-live` regions found anywhere in the codebase** for messages, typing indicators, presence changes, or notifications — Fix: aria-live strategy for real-time updates.
50. Offline send queue retries in-order and avoids duplicates — ⚠️ — Outbox in `chat-outbox.ts` with queued/sending/failed states, `resolveReplayOrder()` ensures chronological+deterministic ordering, client-generated entry IDs; **no server-side idempotency key enforcement**, no exponential backoff — Fix: outbox idempotency keys + server-side dedupe.

---

## 3) Common Discord User Requests (feature opportunities)

### Requested QOL
1. Better channel-level thread discovery: users miss active threads. Keep familiar thread pane + add "hot threads" pill. **Differentiator:** medium. **Note:** ThreadList component exists but discoverability could improve.
2. Message drafts synced across devices (by channel/DM). Use encrypted draft blobs + conflict timestamp. **Differentiator:** high. **Note:** Local drafts exist (localStorage per-channel in `chat-outbox.ts`) but not synced.
3. Optional compact "power composer" with slash snippets/macros. Keep default Discord-like composer. **Differentiator:** medium.
4. Better bookmarking/saved messages with folders/tags. Avoid bloat via simple two-level taxonomy. **Differentiator:** high.
5. Reliable "jump back to where I was" after notifications/search. Implement position snapshots. **Differentiator:** medium. **Note:** "Back to where you were" button already exists for permalink jumps; extend to search/notification jumps.
6. Native poll UX in channels/threads. Use lightweight schema + message attachment type. **Differentiator:** low-medium.
7. Calendar/event RSVP in-channel summaries. Build on existing events routes. **Differentiator:** medium.
8. Better media gallery view for art/photo communities. Use channel-type aware masonry view. **Differentiator:** medium-high. **Note:** Media channel type exists but needs gallery UX.
9. Collaborative notes/docs pinned to channels. Already partially present with docs/tasks search; ship first-class UI. **Differentiator:** high.
10. Cleaner onboarding for newcomers (role self-select + channel suggestions). Keep Discord mental model with guided steps. **Differentiator:** high. **Note:** Screening/verification system exists (verification_level 0-4, screening configs) — build on this.

### Requested privacy/security
1. Granular "who can add me" and friend request filters. Lightweight privacy panel. **Differentiator:** medium.
2. Session anomaly alerts (new device/IP) with one-click revoke. Build on existing auth sessions (user_agent + ip_address tracked per session). **Differentiator:** high.
3. Client-side encrypted DMs (opt-in E2EE mode). Preserve normal DMs as default for compatibility. **Differentiator:** very high.
4. Ephemeral message timer options for DMs. Time-based deletion with clear UI cues. **Differentiator:** medium-high.
5. Attachment privacy controls (strip EXIF by default). Implement client-side metadata scrubbing toggle. **Differentiator:** high.
6. Safer link handling (preview sandbox + warn on suspicious domains). **Differentiator:** medium. **Note:** OEmbed link preview exists but no domain blocklist or safety warnings.

### Requested community tooling
1. Better audit log querying/export. Build advanced filters + CSV export. **Differentiator:** medium. **Note:** Audit log API already supports action/actor/target filters with pagination; add CSV export.
2. Moderator "case management" timeline with notes and outcomes. Extend moderation timeline model. **Differentiator:** high. **Note:** Moderation timeline UI and appeals system with internal notes already exist; needs case linking.
3. Rule templates for automod with staged rollout/simulation mode. Build on current automod engine. **Differentiator:** high. **Note:** Dry-run mode and analytics already exist; add rule templates.
4. Membership screening analytics (drop-off points). Use existing screening routes + event logs. **Differentiator:** medium-high. **Note:** Screening acceptance tracked in `member_screening` table.
5. Server health dashboard (engagement, churn, incident signals). Keep minimal cards, no vanity metrics bloat. **Differentiator:** high.
6. Community wiki mode from channel docs. Permission-aware collaborative knowledge base. **Differentiator:** medium.

### Requested performance improvements
1. Massive-channel smoothness (virtualized list + render budget controls). **Differentiator:** high. **CRITICAL:** No virtualization exists — all messages rendered in DOM.
2. Incremental hydration for heavy sidebars/panels. **Differentiator:** medium.
3. Smarter media prefetch and cache TTL controls. **Differentiator:** medium. **Note:** Service worker only caches 2 static routes (`/`, `/channels/@me`).
4. Voice call resilience under packet loss (auto fallback + diagnostics). **Differentiator:** high. **Note:** No QoS monitoring (getStats/bitrate adaptation) exists.
5. Low-memory mode (reduced animations, compact assets). **Differentiator:** medium-high.
6. Network-aware quality adaptation for embeds/avatars/media. **Differentiator:** medium.

Implementation principle to avoid "Discord with bloat": ship each opportunity as opt-in modules, defaulting to familiar behavior, and enforce a complexity budget (new feature must replace or simplify existing friction).

---

## 4) Bug & Risk Audit (based on repo patterns)

1. **Realtime event ordering drift**
Risk: INSERT/UPDATE + optimistic UI can duplicate or reorder messages.
Repro: send rapidly from two clients while reconnecting one tab.
Mitigation: client-generated UUID idempotency key + monotonic server sequence + dedupe reducer.

2. **Permission constant mismatch for moderation timeout** **(CONFIRMED CRITICAL)**
Risk: Timeout route at `apps/web/app/api/servers/[serverId]/members/[userId]/timeout/route.ts:15` hardcodes `MODERATE_MEMBERS = 1 << 10` (1024) while `packages/shared/src/index.ts:20` defines `MODERATE_MEMBERS = 1 << 14` (16384). Bit 10 is actually `MUTE_MEMBERS`. **This means anyone with MUTE_MEMBERS permission can timeout users, bypassing the intended MODERATE_MEMBERS requirement.**
Repro: assign only MODERATE_MEMBERS bit (16384) per shared package — timeout API will reject (checks wrong bit). Assign MUTE_MEMBERS bit (1024) — timeout API will allow (wrong authorization).
Mitigation: Import `PERMISSIONS.MODERATE_MEMBERS` from shared package; add contract tests to prevent hardcoded permission constants in API routes. Note: `lib/moderation-auth.ts` correctly defines `BAN_MEMBERS = 16` and `ADMINISTRATOR = 128`.

3. **Auth/session drift between Supabase session and custom session tables**
Risk: revoked custom session may not fully invalidate active Supabase auth tokens.
Repro: revoke all sessions then retry with existing token/cookie race.
Mitigation: unified revocation webhook/middleware check on every privileged route.

4. **Friend/block enforcement gaps** **(CONFIRMED CRITICAL)**
Risk: Block state enforced ONLY in friend request handler (`/api/friends`). NOT checked in: DM message send (`/api/dm/channels/[channelId]/messages`), reactions (no API exists), mentions, or search. **Users can message blocked contacts via the DM API.**
Repro: block user via friends API, then POST to DM message endpoint — message succeeds.
Mitigation: central authorization guard checking block state in all DM/message/reaction/mention write paths.

5. **Attachment security gaps** **(CONFIRMED)**
Risk: MIME validation exists only for emoji uploads (PNG/WebP/GIF, 256KB). Message attachments have **zero server-side validation** — no MIME check, no file extension blocklist, no size enforcement, no AV scanning, no quarantine.
Repro: upload renamed executable or malformed SVG as message attachment — accepted without validation.
Mitigation: strict server-side MIME sniffing on all uploads, extension denylist for active content, async AV scan queue with quarantine state.

6. **Search data exposure edge cases**
Risk: search validates serverId and channelId membership but may not enforce per-channel effective permission checks (allow/deny overrides) for users with restricted channel access.
Repro: user with revoked channel override searches server scope.
Mitigation: enforce per-channel effective permission checks via `getChannelPermissions()` in search query builder.

7. **Notification policy inconsistency**
Risk: global/server/channel settings conflicts cause unexpected ping spam. No per-thread overrides exist.
Repro: set contradictory overrides and trigger mentions.
Mitigation: deterministic precedence engine (global→server→channel→thread) + explainability UI.

8. **Voice reconnection fragility** **(PARTIALLY MITIGATED)**
Risk: transient network loss leaves ghost participants or stale mute state.
Repro: cut connection mid-call, restore quickly.
Current state: heartbeat (5s interval) + stale peer GC (45s timeout with connection state awareness) + `peer-rejoin-request` broadcast exists. **But no automatic room rejoin** — user must manually rejoin if local WebRTC connections die.
Mitigation: add explicit reconnect state machine with automatic room rejoin after network recovery.

9. **Rate-limit/spam vectors on high-frequency actions** **(PARTIALLY MITIGATED)**
Risk: typing/reaction/message endpoints abused for spam/DoS.
Current state: messages rate-limited at 5/10s per user (in-memory sliding window), appeals at 3/hr per user+server, typing indicator has client-side throttle. **In-memory rate limiter breaks on multi-instance deployment.** No rate limits on: channel creation, role changes, server settings, DM messages.
Repro: script rapid POSTs from one account — message rate limit works; deploy second instance — rate limit bypassed.
Mitigation: distributed rate limiter (Redis-backed), IP-based throttles, rate limits on all mutating endpoints.

10. **Audit completeness gaps**
Risk: some destructive actions may bypass audit insert paths.
Current coverage: ban/kick/timeout/automod/role/settings/pin/screening/appeals all logged. **Reason field is not required** on destructive actions (passed when available but not enforced).
Repro: perform delete/edit/role changes via all endpoints and compare audit coverage matrix.
Mitigation: central audit middleware with required action taxonomy; require reason on ban/timeout.

11. **Reactions API entirely missing** **(NEW — CRITICAL)**
Risk: `reactions` table exists in DB with realtime subscriptions active, but **no POST/DELETE API endpoints exist** to add or remove reactions. UI components may reference reaction data but cannot modify it.
Repro: attempt to add a reaction to any message — no endpoint available.
Mitigation: build `/api/messages/[messageId]/reactions` CRUD endpoints with optimistic UI, rapid-click idempotency, and block-state enforcement.

12. **No tab title unread count** **(NEW)**
Risk: users miss messages when VortexChat tab is not focused because browser tab title shows no unread badge. Discord and other chat apps show unread counts in tab title (e.g., "(3) Discord").
Repro: receive DM/mention while in different browser tab — tab title unchanged.
Mitigation: global unread count aggregation + `document.title` update hook.

13. **DM feature gaps** **(NEW)**
Risk: DM messages lack attachment support (server messages have attachments), message editing, and message deletion. Users expect these core messaging features in DMs.
Repro: attempt to edit/delete a DM message or attach a file — not possible.
Mitigation: extend DM message routes with attachment, edit, and soft-delete support.

14. **No idle detection** **(NEW)**
Risk: presence system only auto-sets online (mount) and offline (beforeunload). No activity timer to transition to idle status after inactivity. Users appear permanently online.
Repro: leave app open without interaction for 30+ minutes — status remains "online".
Mitigation: add idle detection timer (e.g., 5min inactivity → idle) using mouse/keyboard/focus events.

15. **Individual session revocation missing** **(NEW)**
Risk: session management only supports bulk revoke-all. Users cannot revoke a single suspicious session without logging out everywhere.
Repro: detect suspicious session in list — only option is "Revoke All Sessions".
Mitigation: add DELETE `/api/auth/sessions/[sessionId]` endpoint for per-session revocation.

---

## 5) "Better Than Discord" Roadmap (prioritized)

### Now (1–2 weeks): quick parity wins
- ~~Fix permission bit mismatch in timeout route (import from shared package) and add contract tests.~~
- ~~Build reaction CRUD API endpoints with optimistic UI and rapid-click idempotency.~~
- ~~Add block enforcement in DM send, mentions, and reaction paths.~~
- ~~Harden attachment validation (server-side MIME + extension blocklist + size limits).~~
- ~~Add per-session revocation endpoint and UI.~~
- ~~Add tab title unread count badge.~~
- ~~Add idle detection for presence status.~~

### Next (1–2 months): major features
- ~~Virtualized message timeline (@tanstack/react-virtual) + robust offline outbox dedupe with server-side idempotency.~~
- ~~Full notification hierarchy engine with per-thread overrides.~~
- ~~Voice auto-reconnect state machine + RTC stats monitoring + network quality indicator.~~
- ~~Advanced search filter syntax parser (`from:`, `has:`, `before:`) and jump-to-context.~~
- ~~Image lightbox/media viewer with keyboard navigation.~~
- ~~Custom status editor UI + API + idle detection.~~
- ~~DM attachment support + message editing/deletion.~~
- ~~Moderation command center (cases, templates, audit explorer, user reporting pipeline).~~

### Later: differentiators
- Optional E2EE DM mode with key backup UX.
- Cross-device draft sync and workspace memory mode.
- AI-assisted channel summarization that respects privacy defaults.
- Community health insights + proactive moderation simulation.
- Unified collaboration layer (tasks/docs/events) inside familiar chat flows.
- Sticker system.
- OAuth/social login providers.

### 5 parity blockers (must-fix)
1. Permission correctness: fix timeout bit mismatch, add contract tests preventing hardcoded permission constants.
2. Reaction API: build the missing CRUD endpoints — reactions are a core Discord interaction.
3. Block enforcement: extend block checks to DM/message/reaction/mention write paths.
4. Voice reliability: implement auto-reconnect state machine + QoS monitoring.
5. Attachment safety: server-side MIME validation + extension blocklist + size limits on all uploads.

### 5 delighters (small, high perceived value)
1. Smart "return to last read point" chip (already partially exists for permalinks — extend to all navigation).
2. One-click role impact preview before saving changes.
3. Tab title unread count badge (trivial to implement, high visibility).
4. Fast emoji/sticker recents with keyboard shortcuts.
5. Session anomaly toast with quick revoke (session metadata already tracked).

### 5 moonshots (familiar but beyond Discord)
1. Privacy-first E2EE DM channels with transparent trust status.
2. Context-aware inbox that groups pings by project/topic.
3. AI moderation copilot in "suggestion mode" (never auto-punish by default).
4. Adaptive UX mode: auto-tunes density and noise controls based on behavior.
5. "Server memory graph" linking docs/tasks/threads to reduce context loss.

---

## 6) Acceptance Tests (40+)

### Manual high-priority (M)
1. (M) Register/login/logout across tabs; confirm session invalidation.
2. (M) Passkey login happy path + replay-attack rejection (counter increment check).
3. (M) TOTP 2FA enrollment (QR + 6-digit verify), disable, re-enable.
4. (M) Revoke all sessions; verify forced sign-out on other devices.
5. (M) Create server, invite user, enforce invite expiry/max use/revocation with friendly error messages.
6. (M) Create roles with overlapping allow/deny and verify channel access resolves via `(base & ~deny) | allow`.
7. (M) Reorder roles and verify effective permission changes immediately.
8. (M) Create text/voice/forum/media/stage/announcement channels under categories, including temporary channels with expiry.
9. (M) Send/edit/delete/reply message; verify realtime propagation across tabs.
10. (M) Mention user and `@everyone` under restricted permissions; verify 403 enforcement.
11. (M) Attach image/file via drag-drop and clipboard paste; verify preview and upload.
12. (M) Post link and confirm OEmbed safety behavior.
13. (M) Add/remove reactions rapidly from two clients (blocked until reaction API exists).
14. (M) Search messages with server and channel scopes; verify FTS accuracy.
15. (M) Click search result and verify context jump via message permalink.
16. (M) Set status online/idle/dnd/invisible and inspect all UI surfaces (blocked until status toggle UI exists).
17. (M) Configure global + channel notifications and verify mute/mentions-only behavior.
18. (M) Start DM, block user, verify message suppression in DM send path (blocked until block enforcement added).
19. (M) Create group DM, add/remove members, validate sync.
20. (M) Ban/kick/timeout and verify immediate enforcement; confirm audit log entries with reason.
21. (M) Configure automod rule (keyword filter) and trigger it; verify block/timeout/alert actions.
22. (M) Test automod dry-run mode: verify logging without enforcement.
23. (M) Submit moderation appeal; verify rate limiting (3/hr), anti-abuse scoring, status workflow.
24. (M) Join voice channel, toggle mute/deafen, verify peer states and speaking detection.
25. (M) Start/stop screenshare and verify spotlight UI and participant updates.
26. (M) Start camera video in voice channel; verify video tiles and layout.
27. (M) DM call (voice + video): initiate, accept, mute, hang up.
28. (M) Deny mic permission and ensure graceful error message.
29. (M) Network drop during voice call; verify stale peer cleanup (45s) and manual rejoin necessity.
30. (M) Push-to-talk: hold key, verify unmute; release key, verify mute; verify disabled in text input.
31. (M) Offline message queue: send while offline, reconnect, confirm order via `resolveReplayOrder()`.
32. (M) Unread divider/jump-to-latest in high-traffic channel.
33. (M) Message permalink: share `?message=` URL, verify highlight + "back to where you were".
34. (M) Quickswitcher keyboard navigation (Ctrl+K) and search accuracy.
35. (M) Keyboard-only navigation for core app shell, channel sidebar, and message actions.
36. (M) Screen reader smoke test for chat announcements and dialogs (expected: mostly failing until aria-live added).
37. (M) Contrast check on tertiary metadata text and focus states.
38. (M) Membership screening: configure rules, verify enforcement on message POST, verify acceptance flow.

### Automated regression suggestions (A)
39. (A) Permission matrix unit tests (role + channel override resolution, deny-first formula).
40. (A) Contract tests ensuring no API route hardcodes permission constants (must import from shared).
41. (A) API authz tests for search/friends/dm/mod routes.
42. (A) Realtime reducer tests for duplicate message/reaction events.
43. (A) Composer keybinding tests (Enter/Shift+Enter/Esc/Tab mention flow).
44. (A) Message renderer snapshot tests for markdown edge cases (bold, italic, code, quotes, spoilers, code blocks).
45. (A) E2E invite lifecycle tests (create/redeem/expire/revoke with friendly errors).
46. (A) E2E moderation tests (timeout/ban/kick + audit log assertions + appeal workflow).
47. (A) WebRTC signaling integration tests for join/leave/reconnect/screenshare.
48. (A) Push notification service worker tests for click routing.
49. (A) Load test for message list performance at 50k+ messages/channel (expected: degradation without virtualization).
50. (A) Accessibility CI checks (axe + keyboard traversal scripts + focus-visible enforcement).
51. (A) Security tests for upload MIME spoof and blocked content types.
52. (A) Rate-limit tests for message/reaction/typing bursts (verify 429 responses and Retry-After headers).
53. (A) Data migration tests for permission schema evolution.
54. (A) Visual regression tests for chat row actions + modal states.
55. (A) Block enforcement tests: verify blocked user cannot DM, react, or send friend request.
56. (A) AutoMod regex safety tests: verify nested quantifier blocking, timeout budget, pattern length limits.

Expected result baseline: all manual critical flows pass with no data leaks, no duplicate sends, and deterministic permission/notification outcomes.

---

## 7) Direct Questions / Unknowns

1. Is mobile app parity (native push, background reconnect, callkit/incoming UX) in scope or web-only for current milestone?
2. Are there production SLOs for message latency, voice reconnect time, and notification delivery success?
3. Is there an explicit threat model for attachments, malicious links, and account takeover recovery?
4. ~~Do channel-level permission overrides fully support Discord-like allow/deny inheritance and deny precedence in DB policies?~~ **ANSWERED: YES.** `getChannelPermissions()` in `lib/permissions.ts:75-109` implements `(base & ~denyMask) | allowMask` — deny-first precedence confirmed.
5. ~~Is block state enforced at DB/RLS level for DMs, reactions, and mentions, or only in API handlers/UI?~~ **ANSWERED: API handler only, and ONLY in friend requests.** Block NOT enforced in DM send, reactions, mentions, or search. No RLS-level block enforcement.
6. What are planned limits (message length, upload size, file types, rate limits) and are they user-visible? **Partial answer:** Message rate limit is 5/10s. Emoji upload limit is 256KB. No general file size limit enforced on message attachments.
7. ~~Is video calling beyond screenshare planned (camera tiles/layout), or intentionally out of scope?~~ **ANSWERED: Already implemented.** Camera video supported in both voice channels (1280x720, video-aware grid layout) and DM calls (full bidirectional video with PiP layout).
8. Are there analytics/privacy constraints (self-hosted telemetry, opt-out defaults) for privacy-by-default positioning?
9. Is E2EE for DMs a strategic goal, and if so, what key management/recovery UX is acceptable?
10. Which platforms are target-tier for accessibility certification (WCAG 2.2 AA across desktop web only vs broader)?

---

## 8) Features Stronger Than Initially Assessed

These areas were undersold or marked as uncertain in the original evaluation but are actually well-implemented:

1. **Message permalink deep-link system** — Full implementation with query param routing, 8-attempt pagination loop to find target message, indigo highlight with 2.2s fade, and "back to where you were" navigation. Not missing as originally stated.
2. **Voice/audio pipeline** — Professional-grade with 6-band parametric EQ, dynamics compressor, noise gate, 4 presets (Voice Clarity/Bass Boost/Broadcast/Flat), spatial audio panning, per-user volume controls, CPU-aware auto-bypass. Far beyond basic "mute/deafen" described.
3. **Camera video** — Already implemented in both voice channels and DM calls, with video-aware grid layout and PiP. Not uncertain as originally stated.
4. **AutoMod engine** — 5 rule types with safe regex evaluation (pattern length limits, timeout budget, nested quantifier blocking), dry-run mode, priority-based evaluation, analytics tracking. More sophisticated than "rules + analytics" suggests.
5. **Moderation appeals** — Full workflow with anti-abuse scoring, evidence sanitization, rate limiting, status state machine, internal notes. Not mentioned in original evaluation.
6. **Membership screening** — Verification levels 0-4, explicit content filter 0-2, screening configs with rules, acceptance tracking, enforcement at message POST. Not mentioned in original evaluation.
7. **Role hierarchy** — Position-based enforcement prevents non-admins from assigning roles at/above their own level. Working as expected, not "unclear" as originally stated.
8. **Channel permission overrides** — Fully implemented with deny-first precedence formula. Working correctly, not uncertain as originally stated.
9. **Invite lifecycle** — Complete with expiry, max-use, temporary flag, revocation by owner/creator, friendly error messages for all failure cases. More complete than suggested.
10. **Security policy controls** — Passkey-first, enforce-passkey, fallback password/magic-link toggles with UI in security settings. Not mentioned in original evaluation.

---

## 9) Verified Parity Estimate

Based on the full codebase audit, estimated Discord feature parity:

| Area | Parity | Notes |
|---|---|---|
| Authentication | ~80% | Strong passkey/TOTP/sessions; missing backup codes, step-up, OAuth |
| Servers/Roles/Permissions | ~85% | Solid bitmask + hierarchy + overrides; one critical bit mismatch bug |
| Channels/Threads | ~85% | All 7 types + threads + temporary channels; missing type-specific UX depth |
| Core Messaging | ~90% | Rich features; missing reply-jump, pinned messages |
| Attachments | ~50% | Upload works; no validation, no AV, no lightbox |
| Search | ~40% | FTS works; no filter syntax, no facets |
| Presence/Status | ~30% | Online/offline auto-set; no manual status change, no idle, no custom status UI |
| Notifications | ~65% | Push + per-channel settings work; no thread overrides, no hierarchy engine |
| Reactions/Emoji | ~40% | Custom emoji CRUD complete; reaction API missing entirely, no stickers |
| Moderation | ~80% | Ban/kick/timeout/automod/appeals/audit; missing user reporting |
| Safety | ~45% | AutoMod strong; no attachment security, limited rate limiting, no reporting |
| Voice/Video | ~80% | Excellent audio pipeline + video + screenshare; no QoS, no auto-reconnect |
| DMs/Groups | ~55% | Core works; no DM attachments/editing, block gap, limited group features |
| Friends/Blocks | ~60% | Friend lifecycle complete; block enforcement critical gap |
| Settings | ~50% | Core settings exist; missing privacy, voice persistence, appearance APIs |
| Accessibility | ~35% | Radix focus trap + shortcuts; no aria-live, inconsistent focus-visible |
| Performance | ~40% | Outbox + pagination; no virtualization, minimal caching |
| Reliability | ~55% | Outbox replay + voice heartbeat; no server idempotency, no auto-reconnect |

**Weighted overall estimate: ~60-65% Discord feature parity** (core messaging flows are strong at ~85-90%, but supporting systems drag the average down significantly).

Even with these gaps, the immediate recommendation is to run a 2-week parity hardening sprint focused on: (1) permission bit mismatch fix, (2) reaction API, (3) block enforcement, (4) attachment security, and (5) voice auto-reconnect before layering differentiators.
