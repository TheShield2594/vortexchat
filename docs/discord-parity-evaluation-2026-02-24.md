# Discord Parity + Opportunity Evaluation (VortexChat)

Date: 2026-02-24  
Evaluator role: Product Engineering + QA + UX Research  
Baseline assumption: Discord desktop/web + mobile ecosystem as of ~2025 (communities, forums, threads, onboarding/screening, role-based permissions, voice/video/screenshare, mod tools, activity status, and richer notification controls).

## Method and evidence sources
- Static repo audit of UI components, hooks, API routes, migrations, and existing audits.
- Core evidence includes feature README, chat/voice hooks and components, auth/session endpoints, moderation endpoints, and search/friends APIs.
- Where implementation is not visible from repository-only inspection (e.g., mobile push delivery reliability, production infra scaling), status is marked as best-guess.

---

## 1) Parity Scorecard (Discord → My App)

| Category | Discord behavior (expected) | My app status | Evidence | Impact | Fix complexity | Proposed implementation approach |
|---|---|---|---|---|---|---|
| Accounts & Identity (login, MFA, sessions) | Password + passkey/MFA options, session list/revoke, trusted devices | ⚠️ partial | Passkey login verify + challenge replay checks + session APIs exist; OTP-style MFA/UI flow not clearly surfaced | High | M | Add full MFA UX in settings, backup codes, recovery flows, step-up auth for risky actions |
| Servers/Guilds (create, invite, roles, permissions) | Server creation, invites, granular role permission model incl overrides | ⚠️ partial | Role bitmask system + server invites/endpoints present; role hierarchy guardrails and admin UX depth unclear | High | M | Add effective-permission inspector, hierarchy constraints, invite lifecycle controls (expiry/uses/scopes) |
| Channels (text/voice/video, categories, threads) | Text/voice/video channels, categories, threads, forum-like flows | ⚠️ partial | Channel types include text/voice/category/forum/media/stage/announcement; thread modals + realtime threads exist; full video channel parity unclear | High | L | Harden channel-type specific UX (stage/forum/media), enforce permissions per type, unify thread discoverability |
| Messaging (send/edit/delete, replies, mentions, embeds, markdown) | Rich editor behavior, edit/delete/reply, mentions, embeds, markdown parity | ✅ matches (core) | Message input + message item support replies, edit/delete, mention autocomplete, embed rendering, markdown-like transforms | High | M | Add remaining edge formatting parity and strict behavior tests (caret, undo, quote/code nesting) |
| Attachments (images/files, previews, limits) | Drag/drop uploads, previews, safety checks, size limits/error clarity | ⚠️ partial | File upload + preview in input and storage pipeline present; explicit AV scanning, MIME hardening, quota UX unclear | High | M | Add signed upload constraints, server-side MIME/extension validation, async scan + quarantine states |
| Search (messages, users, channels) | Scoped search with filters (from/user/has/link/date/channel) | ⚠️ partial | Unified `/api/search` across messages/tasks/docs with FTS; user/channel faceted query UX missing | Med | M | Add filter chips + saved queries + result-type tabs + jump-to-message context |
| Presence & Status (online/idle/dnd, custom status) | Presence + custom status text/emoji, cross-surface consistency | ⚠️ partial | Presence hooks + status types include online/idle/dnd/invisible/offline; custom rich status persistence unclear | Med | S | Add custom status editor, expiry presets, and presence precedence rules |
| Notifications (push, desktop, per-channel overrides, mute) | Granular per-channel/server/device notifications + mention-only rules | ⚠️ partial | Push subscription hook + notification settings modal/API exist; exhaustive override matrix unclear | High | M | Model notification policy hierarchy (global→server→channel→thread) with preview simulator |
| Reactions & Emoji (custom emoji, stickers if applicable) | Fast reactions, custom emoji/sticker support, picker quality | ⚠️ partial | Reactions implemented + server emoji APIs/context; sticker pack/parity and reaction UX polish partial | Med | M | Add unified emoji/sticker picker, recent/frequent sets, skin tone support |
| Moderation basics (ban/kick/timeouts, audit log equivalents) | Ban/kick/timeout/report/audit history with actor/target context | ⚠️ partial | Timeout + bans + moderation timeline + audit-log API present; escalation workflow consistency unclear | High | M | Add moderation command center + action templates + reversible windows |
| Safety controls (spam/rate limits, reporting) | Anti-spam, automod, report abuse, raid mitigation | ⚠️ partial | Automod rules + analytics tables/endpoints exist; user-facing reporting + global anti-raid controls unclear | High | L | Add message/user reporting pipeline, burst mitigation, captcha/risk scoring for suspicious join/send patterns |
| Voice (join/leave, mute/deafen, screenshare, QoS basics) | Stable low-latency voice, mute/deafen, screenshare, device controls | ⚠️ partial | Signal server + WebRTC events + push-to-talk hook + DM call route; QoS, reconnect robustness, device preflight depth unclear | High | L | Add preflight wizard, ICE fallback diagnostics, region preference, auto-reconnect state machine |
| DMs & Groups | 1:1 + group DMs, membership management, call handoff | ⚠️ partial | DM APIs/components exist incl group DM migration; full group admin UX and moderation tools uncertain | Med | M | Add group DM roles/light permissions, invite links, leave/archive semantics |
| Friend system (requests, blocks) | Request/accept/decline/block/unblock with privacy controls | ✅ matches (core) | `/api/friends` implements request lifecycle and block state transitions | Med | S | Add friend discovery privacy toggles + anti-abuse throttles |
| Settings (per-user & per-server) | Deep user/server settings with discoverable IA | ⚠️ partial | Multiple settings modals and admin settings components exist; route-scale IA + advanced controls still thinner than Discord | Med | M | Split into dedicated settings routes with section search and breadcrumbs |
| Accessibility (keyboard nav, screen reader, contrast) | Full keyboard navigation + robust ARIA + contrast compliance | ⚠️ partial | Existing audit flags partial parity on focus/ARIA/keyboard consistency | High | M | Run axe + keyboard CI gates, enforce focus-visible + labeling contracts for icon buttons/menus |
| Performance (message list virtualization, caching) | Smooth large channel history and efficient render behavior | ⚠️ partial | Chat area supports infinite scroll/outbox/realtime; explicit virtualization strategy unclear | High | L | Introduce windowed list virtualization, memoized message groups, cache eviction policy |
| Reliability (offline handling, reconnect behavior) | Offline compose queue, reconnect replay, duplicate prevention | ⚠️ partial | Message consistency model doc + realtime hooks exist; end-to-end reconnect/duplication guarantees need hardening | High | L | Implement authoritative message IDs + idempotent sends + deterministic replay reconciliation |

---

## 2) “Expected Behaviors” Checklist (parity breakpoints)

Status key: ✅ observed, ⚠️ likely partial, ❌ likely missing, ❓ unknown from repo-only view.

1. Enter sends, Shift+Enter newline — ⚠️ — Test composer key handling with multiline draft — Fix: `MessageInput` keydown handling.  
2. Escape closes mention picker before clearing draft — ⚠️ — Type `@`, press Esc repeatedly — Fix: mention autocomplete state machine.  
3. Tab/Enter accepts selected mention suggestion — ✅ — Open suggestions and accept via keyboard — Fix area: mention component regression tests.  
4. Typing indicator appears quickly (<500ms after typing) — ✅ — Type in one client, observe second client — Fix: typing broadcast throttling.  
5. Typing indicator clears within ~3s after stop — ✅ — Stop typing and stopwatch clear behavior — Fix: `useTyping` timeout constants.  
6. Message edit mode saves on Enter, newline on Shift+Enter — ✅ — Edit existing message and verify behavior — Fix: `MessageItem` edit textbox rules.  
7. Deleted message disappears/replaced consistently without ghost spacing — ⚠️ — Delete in one client with second open — Fix: message list reconciliation.  
8. Reply preview shows author + snippet and jumps when clicked — ⚠️ — Reply then click reference — Fix: reply anchor navigation.  
9. Message link deep-links and highlights target row — ❌ — Copy link/open in new tab — Fix: router + scroll/highlight targeting.  
10. New message divider appears exactly once after reconnect — ⚠️ — Disconnect/reconnect mid-scroll — Fix: read-state + divider reducer.
11. Jump-to-present button appears when scrolled away — ⚠️ — Scroll up while receiving messages — Fix: scroll anchor controls.
12. Infinite history load preserves viewport anchor — ⚠️ — Load older messages repeatedly — Fix: virtualizer/offset anchoring.
13. Mention highlight for `@you` distinct from general unread — ⚠️ — Mention user in busy channel — Fix: unread model.
14. `@everyone` permission enforcement per role/channel — ⚠️ — Try as restricted role — Fix: permission gate in send pipeline.
15. Emoji reaction toggles idempotently on rapid clicks — ⚠️ — Spam-click same emoji — Fix: optimistic reaction dedupe.
16. Reaction counts converge correctly across multiple clients — ⚠️ — React from 3 clients simultaneously — Fix: realtime ordering + dedupe.
17. Attachment upload shows progress, failure, retry — ⚠️ — Throttle network and upload file — Fix: upload UI state machine.
18. Image attachment opens in lightbox with keyboard nav — ❌ — Click image and use arrows/Esc — Fix: media viewer component.
19. Drag-drop file onto composer opens attach flow — ❓ — Manual drag/drop test — Fix: dropzone integration.
20. Pasting image from clipboard attaches file — ❓ — Paste screenshot into composer — Fix: clipboard handlers.
21. Markdown inline code, bold, italics render accurately — ✅ — Send formatting samples — Fix: parser tests.
22. Multi-line quote blocks preserve line grouping — ✅ — Send `>` lines — Fix: renderer edge-case tests.
23. Code fences preserve language + whitespace — ✅ — Send triple-backtick content — Fix: renderer snapshot tests.
24. URL embeds suppress when link from blocked domains — ❓ — Test policy-controlled link — Fix: embed sanitizer policy.
25. Presence toggles (online/idle/dnd/invisible) reflect quickly — ⚠️ — Toggle user status and observe member list — Fix: presence sync hook.
26. Custom status emoji/text appears in sidebar + profile — ❌ — Set custom status then inspect UI — Fix: profile/status persistence.
27. Notification mute for channel suppresses badge + sound — ⚠️ — Mute channel then mention/self-message — Fix: notification resolver.
28. Per-thread notification override inherits correctly — ❌ — Override thread notif and test mentions — Fix: notification hierarchy model.
29. Desktop push uses actionable payload and opens exact channel — ⚠️ — Click browser push on closed tab — Fix: service worker click handler.
30. Invite links respect expiry + max-use semantics — ⚠️ — Create short-lived invite and consume repeatedly — Fix: invite enforcement API.
31. Revoked invite fails with friendly UX — ⚠️ — Use deleted invite URL — Fix: invite route errors.
32. Role reordering updates permission precedence immediately — ⚠️ — Swap role order and test channel access — Fix: role hierarchy recompute.
33. Channel permission overrides resolve correctly with deny > allow rules — ⚠️ — Combine multiple roles/overrides — Fix: permission engine tests.
34. Kicked user loses realtime access instantly — ⚠️ — Kick active user and observe socket state — Fix: authz checks in subscriptions.
35. Timeout blocks send but still allows read as configured — ⚠️ — Timeout member and post attempt — Fix: server checks in message POST.
36. Audit log records moderator action with reason metadata — ✅ — Execute timeout/ban with reason — Fix: audit write consistency checks.
37. Search query with channel filter returns only authorized messages — ✅ — Search as non-member — Fix: authorization guard tests.
38. Search results jump to surrounding message context — ⚠️ — Click result and inspect pagination context — Fix: message permalink API.
39. Voice join handles denied mic permissions gracefully — ⚠️ — Reject mic and join voice — Fix: voice preflight UX.
40. Push-to-talk works when app focused and releases on keyup — ⚠️ — Hold configured key during call — Fix: PTT hook key listeners.
41. Screenshare starts/stops with participant state updates — ⚠️ — Start share from one peer, view others — Fix: signaling events + UI badges.
42. Reconnect after network drop restores voice room automatically — ❌ — Cut network 10s during call — Fix: session reconnection state machine.
43. DM unread counts sync between sidebar and tab title — ⚠️ — Receive DM while in server channel — Fix: unread aggregation store.
44. Group DM member add/remove events update all clients — ❓ — Add/remove in group DM — Fix: group realtime events.
45. Blocking user prevents DM delivery and friend requests — ⚠️ — Block then attempt DM/request — Fix: server-side enforcement at send/create.
46. Keyboard shortcut modal reflects actual active bindings — ⚠️ — Compare modal with runtime behavior — Fix: centralized shortcut registry.
47. Command palette/quickswitcher supports fuzzy jump by server/channel/user — ⚠️ — Open quickswitcher and search terms — Fix: indexed local cache.
48. Modal focus trap prevents background interaction — ⚠️ — Open modal and tab-cycle — Fix: dialog primitives + a11y tests.
49. Screen reader announces new messages without excessive verbosity — ❓ — NVDA/VoiceOver test in active channel — Fix: aria-live strategy.
50. Offline send queue retries in-order and avoids duplicates — ⚠️ — Go offline, queue sends, reconnect — Fix: outbox idempotency keys.

---

## 3) Common Discord User Requests (feature opportunities)

### Requested QOL
1. Better channel-level thread discovery: users miss active threads. Keep familiar thread pane + add “hot threads” pill. **Differentiator:** medium.  
2. Message drafts synced across devices (by channel/DM). Use encrypted draft blobs + conflict timestamp. **Differentiator:** high.  
3. Optional compact “power composer” with slash snippets/macros. Keep default Discord-like composer. **Differentiator:** medium.  
4. Better bookmarking/saved messages with folders/tags. Avoid bloat via simple two-level taxonomy. **Differentiator:** high.  
5. Reliable “jump back to where I was” after notifications/search. Implement position snapshots. **Differentiator:** medium.  
6. Native poll UX in channels/threads. Use lightweight schema + message attachment type. **Differentiator:** low-medium.  
7. Calendar/event RSVP in-channel summaries. Build on existing events routes. **Differentiator:** medium.  
8. Better media gallery view for art/photo communities. Use channel-type aware masonry view. **Differentiator:** medium-high.  
9. Collaborative notes/docs pinned to channels. Already partially present with docs/tasks search; ship first-class UI. **Differentiator:** high.  
10. Cleaner onboarding for newcomers (role self-select + channel suggestions). Keep Discord mental model with guided steps. **Differentiator:** high.

### Requested privacy/security
1. Granular “who can add me” and friend request filters. Lightweight privacy panel. **Differentiator:** medium.  
2. Session anomaly alerts (new device/IP) with one-click revoke. Build on existing auth sessions. **Differentiator:** high.  
3. Client-side encrypted DMs (opt-in E2EE mode). Preserve normal DMs as default for compatibility. **Differentiator:** very high.  
4. Ephemeral message timer options for DMs. Time-based deletion with clear UI cues. **Differentiator:** medium-high.  
5. Attachment privacy controls (strip EXIF by default). Implement client-side metadata scrubbing toggle. **Differentiator:** high.  
6. Safer link handling (preview sandbox + warn on suspicious domains). **Differentiator:** medium.

### Requested community tooling
1. Better audit log querying/export. Build advanced filters + CSV export. **Differentiator:** medium.  
2. Moderator “case management” timeline with notes and outcomes. Extend moderation timeline model. **Differentiator:** high.  
3. Rule templates for automod with staged rollout/simulation mode. Build on current automod engine. **Differentiator:** high.  
4. Membership screening analytics (drop-off points). Use existing screening routes + event logs. **Differentiator:** medium-high.  
5. Server health dashboard (engagement, churn, incident signals). Keep minimal cards, no vanity metrics bloat. **Differentiator:** high.  
6. Community wiki mode from channel docs. Permission-aware collaborative knowledge base. **Differentiator:** medium.

### Requested performance improvements
1. Massive-channel smoothness (virtualized list + render budget controls). **Differentiator:** high.  
2. Incremental hydration for heavy sidebars/panels. **Differentiator:** medium.  
3. Smarter media prefetch and cache TTL controls. **Differentiator:** medium.  
4. Voice call resilience under packet loss (auto fallback + diagnostics). **Differentiator:** high.  
5. Low-memory mode (reduced animations, compact assets). **Differentiator:** medium-high.  
6. Network-aware quality adaptation for embeds/avatars/media. **Differentiator:** medium.

Implementation principle to avoid “Discord with bloat”: ship each opportunity as opt-in modules, defaulting to familiar behavior, and enforce a complexity budget (new feature must replace or simplify existing friction).

---

## 4) Bug & Risk Audit (based on repo patterns)

1. **Realtime event ordering drift**  
Risk: INSERT/UPDATE + optimistic UI can duplicate or reorder messages.  
Repro: send rapidly from two clients while reconnecting one tab.  
Mitigation: client-generated UUID idempotency key + monotonic server sequence + dedupe reducer.

2. **Permission constant mismatch for moderation timeout**  
Risk: timeout route comment/constant uses `1<<10` while shared permissions define `MODERATE_MEMBERS` as `1<<14`; may deny valid mods or allow wrong role bit.  
Repro: assign only moderate-members bit per shared package and test timeout API.  
Mitigation: import shared permission enum in API routes; add contract tests.

3. **Auth/session drift between Supabase session and custom session tables**  
Risk: revoked custom session may not fully invalidate active auth tokens.  
Repro: revoke all sessions then retry with existing token/cookie race.  
Mitigation: unified revocation webhook/middleware check on every privileged route.

4. **Friend/block enforcement gaps**  
Risk: block state exists but may not be enforced consistently in DM send/reply/search.  
Repro: block user, then send DM via direct API endpoint.  
Mitigation: central authorization guard for DM/message write paths.

5. **Attachment security gaps**  
Risk: MIME spoofing/polyglot files and unsafe previews.  
Repro: upload renamed executable or malformed SVG.  
Mitigation: strict server-side MIME sniffing, denylist active content, virus scan queue.

6. **Search data exposure edge cases**  
Risk: broad channel list resolution may include channels user cannot currently read if permission checks rely on membership only.  
Repro: user with revoked channel override searches server scope.  
Mitigation: enforce per-channel effective permission checks in search query builder.

7. **Notification policy inconsistency**  
Risk: global/server/channel settings conflicts cause unexpected ping spam.  
Repro: set contradictory overrides and trigger mentions.  
Mitigation: deterministic precedence engine + explainability UI.

8. **Voice reconnection fragility**  
Risk: transient network loss leaves ghost participants or stale mute state.  
Repro: cut connection mid-call, restore quickly.  
Mitigation: heartbeat + room rejoin handshake + stale peer GC.

9. **Rate-limit/spam vectors on high-frequency actions**  
Risk: typing/reaction/message endpoints abused for spam/DoS.  
Repro: script rapid POSTs/realtime events from one account/IP.  
Mitigation: token bucket limits per route and behavior-based throttles.

10. **Audit completeness gaps**  
Risk: some destructive actions may bypass audit insert paths.  
Repro: perform delete/edit/role changes via all endpoints and compare audit coverage matrix.  
Mitigation: central audit middleware with required action taxonomy.

---

## 5) “Better Than Discord” Roadmap (prioritized)

### Now (1–2 weeks): quick parity wins
- Fix permission bit mismatch and add permission contract tests.
- Ship unread/jump-to-latest reliability polish.
- Add message permalink deep-link + highlight.
- Harden attachment validation + clearer upload failure UX.
- Add session/security settings polish (device labels, revoke clarity).

### Next (1–2 months): major features
- Virtualized message timeline + robust offline outbox dedupe.
- Full notification hierarchy engine with per-thread overrides.
- Voice preflight + reconnect diagnostics and region preference.
- Advanced search filters and context jump.
- Moderation command center (cases, templates, audit explorer).

### Later: differentiators
- Optional E2EE DM mode with key backup UX.
- Cross-device draft sync and workspace memory mode.
- AI-assisted channel summarization that respects privacy defaults.
- Community health insights + proactive moderation simulation.
- Unified collaboration layer (tasks/docs/events) inside familiar chat flows.

### 5 parity blockers (must-fix)
1. Permission correctness and override resolution integrity.  
2. Reliable unread/read-state and jump mechanics.  
3. Voice reliability under reconnect/device edge cases.  
4. Notification override determinism.  
5. Attachment safety + anti-spam baseline protections.

### 5 delighters (small, high perceived value)
1. Smart “return to last read point” chip.  
2. One-click role impact preview before saving changes.  
3. Drafts synced across sessions.  
4. Fast emoji/sticker recents with keyboard shortcuts.  
5. Session anomaly toast with quick revoke.

### 5 moonshots (familiar but beyond Discord)
1. Privacy-first E2EE DM channels with transparent trust status.  
2. Context-aware inbox that groups pings by project/topic.  
3. AI moderation copilot in “suggestion mode” (never auto-punish by default).  
4. Adaptive UX mode: auto-tunes density and noise controls based on behavior.  
5. “Server memory graph” linking docs/tasks/threads to reduce context loss.

---

## 6) Acceptance Tests (40+)

### Manual high-priority (M)
1. (M) Register/login/logout across tabs; confirm session invalidation.
2. (M) Passkey login happy path + replay-attack rejection.
3. (M) Revoke all sessions; verify forced sign-out on other devices.
4. (M) Create server, invite user, enforce invite expiry/max use.
5. (M) Create roles with overlapping allow/deny and verify channel access.
6. (M) Reorder roles and verify effective permission changes immediately.
7. (M) Create text/voice/forum/media channels under categories.
8. (M) Send/edit/delete/reply message; verify realtime propagation.
9. (M) Mention user and `@everyone` under restricted permissions.
10. (M) Attach image/file; verify preview, upload failure handling, and retry.
11. (M) Post link and confirm embed safety behavior.
12. (M) Add/remove reactions rapidly from two clients.
13. (M) Search messages with server and channel scopes.
14. (M) Click search result and verify context jump accuracy.
15. (M) Set status online/idle/dnd/invisible and inspect all UI surfaces.
16. (M) Configure global + channel + thread notifications and verify precedence.
17. (M) Mute channel then test mention behavior.
18. (M) Start DM, block user, verify message suppression.
19. (M) Create group DM, add/remove members, validate sync.
20. (M) Ban/kick/timeout and verify immediate enforcement.
21. (M) Validate audit log entries for each moderation action.
22. (M) Configure automod rule and trigger it with sample content.
23. (M) Join voice channel, toggle mute/deafen, verify peer states.
24. (M) Start/stop screenshare and verify participant updates.
25. (M) Deny mic permission and ensure graceful fallback UI.
26. (M) Network drop during voice call; verify auto-reconnect outcome.
27. (M) Offline message queue: send while offline, reconnect, confirm order/dedupe.
28. (M) Unread divider/jump-to-latest in high-traffic channel.
29. (M) Quickswitcher keyboard navigation and fuzzy search accuracy.
30. (M) Keyboard-only navigation for core app shell and message actions.
31. (M) Screen reader smoke test for chat announcements and dialogs.
32. (M) Contrast check on tertiary metadata text and focus states.

### Automated regression suggestions (A)
33. (A) Permission matrix unit tests (role + channel override resolution).
34. (A) Contract tests to ensure API routes use shared permission constants.
35. (A) API authz tests for search/friends/dm/mod routes.
36. (A) Realtime reducer tests for duplicate message/reaction events.
37. (A) Composer keybinding tests (Enter/Shift+Enter/Esc/Tab mention flow).
38. (A) Message renderer snapshot tests for markdown edge cases.
39. (A) E2E invite lifecycle tests (create/redeem/expire/revoke).
40. (A) E2E moderation tests (timeout/ban/kick + audit assertions).
41. (A) WebRTC signaling integration tests for join/leave/reconnect.
42. (A) Push notification service worker tests for click routing.
43. (A) Load test for message list performance at 50k+ messages/channel.
44. (A) Accessibility CI checks (axe + keyboard traversal scripts).
45. (A) Security tests for upload MIME spoof and blocked content.
46. (A) Rate-limit tests for message/reaction/typing bursts.
47. (A) Data migration tests for permission schema evolution.
48. (A) Visual regression tests for chat row actions + modal states.

Expected result baseline: all manual critical flows pass with no data leaks, no duplicate sends, and deterministic permission/notification outcomes.

---

## 7) Direct Questions / Unknowns

1. Is mobile app parity (native push, background reconnect, callkit/incoming UX) in scope or web-only for current milestone?
2. Are there production SLOs for message latency, voice reconnect time, and notification delivery success?
3. Is there an explicit threat model for attachments, malicious links, and account takeover recovery?
4. Do channel-level permission overrides fully support Discord-like allow/deny inheritance and deny precedence in DB policies?
5. Is block state enforced at DB/RLS level for DMs, reactions, and mentions, or only in API handlers/UI?
6. What are planned limits (message length, upload size, file types, rate limits) and are they user-visible?
7. Is video calling beyond screenshare planned (camera tiles/layout), or intentionally out of scope?
8. Are there analytics/privacy constraints (self-hosted telemetry, opt-out defaults) for privacy-by-default positioning?
9. Is E2EE for DMs a strategic goal, and if so, what key management/recovery UX is acceptable?
10. Which platforms are target-tier for accessibility certification (WCAG 2.2 AA across desktop web only vs broader)?

Even with these unknowns, the immediate recommendation is to run a 2-week parity hardening sprint focused on permission correctness, unread/notification reliability, and voice reconnect robustness before layering differentiators.
