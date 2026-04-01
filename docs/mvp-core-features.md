# MVP Core Features — Gap Tracker

> Single source of truth for Tier 1 / Tier 2 feature gaps.
> Updated as features are completed during the hardening sprint.

## Emoji System

| Feature | Status | Notes |
|---------|--------|-------|
| Custom emoji upload (PNG/GIF/WEBP, 256 KB) | Done | `POST /api/servers/[serverId]/emojis` — gated by `MANAGE_EMOJIS` permission (bit 20) |
| Emoji autocomplete (`:name:`) | Done | `use-emoji-autocomplete` hook |
| Emoji management page in server settings | Done | `EmojisTab` in server-settings-modal |
| Emoji attribution — uploader name & date | Done | API returns `uploader` join; shown in management UI |
| Audit logging for emoji upload/delete | Done | `audit_logs` entries with `emoji_uploaded` / `emoji_deleted` actions |
| CDN cache-bust on emoji delete | Done | `CDN-Cache-Control: no-store` header on DELETE response |
| Custom emojis in emoji picker (channels) | Done | Server custom emojis shown as "Custom" section at top of emoji picker in `message-input` |
| Custom emojis in emoji picker (DMs) | Done | All server custom emojis fetched via `GET /api/emojis/all` and shown grouped by server in DM picker |

## GIF / Media Picker

| Feature | Status | Notes |
|---------|--------|-------|
| GIF search (Klipy primary, Giphy fallback) | Done | `/api/gif/search` with server-side caching — Klipy is primary provider |
| Trending / featured GIFs section | Done | Shows "Trending" header when browsing without a query |
| Search autocomplete suggestions | Done | `/api/gif/suggestions` — Klipy autocomplete / Giphy related tags |
| Dual-provider support (Klipy + Giphy) | Done | `lib/gif-provider.ts` — Klipy preferred, Giphy as fallback (Tenor removed) |
| Emoji picker in DMs | Done | Full frimousse emoji picker with search, categories, skin tone selector in `dm-channel-area` |
| GIF picker in DMs | Done | Tabbed Emoji/GIF picker with search, trending, autocomplete suggestions in DM composer |
| GIF inline rendering in DMs | Done | Standalone Klipy/Giphy URLs render as inline images in DM messages |
| app-ads.txt for Klipy ads | Done | `public/app-ads.txt` — ad inventory authorization for Klipy monetization |
| Sticker search (Klipy primary, Giphy fallback) | Done | `/api/sticker/search` + `/api/sticker/trending` with server-side caching |
| Sticker picker in channels + DMs | Done | Tabbed Emoji/GIFs/Stickers picker — Discord-style unified picker |
| Separate "memes" picker tab | Gap | Low priority — could add as fourth picker tab |

## Voice / WebRTC

| Feature | Status | Notes |
|---------|--------|-------|
| Voice channels | Done | Socket.IO signal server + WebRTC |
| Compact voice view | Done | Recent addition |

## Real-Time Gateway (#592, #595, #597)

| Feature | Status | Notes |
|---------|--------|-------|
| Unified Socket.IO gateway — single transport for all events | Done | `RedisEventBus` + gateway handlers in signal server; replaces dual Supabase Realtime + Socket.IO connections (#592) |
| Redis Streams event bus (IEventBus impl) | Done | `apps/signal/src/event-bus.ts` — persists events per-channel (capped at 1000, 24h TTL), pub/sub fan-out across replicas (#592) |
| Gateway event types + shared constants | Done | `packages/shared/src/gateway-events.ts` — `GatewayClientEvents`, `GatewayServerEvents`, stream/presence constants (#592) |
| HTTP `/publish-event` endpoint | Done | API routes POST events to signal server for gateway fan-out; protected by `SIGNAL_REVOKE_SECRET` (#592) |
| Socket.IO presence manager (Redis-backed) | Done | `apps/signal/src/presence.ts` — offline detection ~10s via Socket.IO `pingTimeout` (was ~90s); per-server online user sets (#595) |
| Socket.IO typing indicators | Done | `gateway:typing` event; server-side auto-stop (5s); rate limited 30/min (#595) |
| Gateway presence hook (`useGatewayPresence`) | Done | `apps/web/hooks/use-gateway-presence.ts` — replaces HTTP heartbeat polling; multi-tab via BroadcastChannel (#595) |
| Gateway typing hook (`useGatewayTyping`) | Done | `apps/web/hooks/use-gateway-typing.ts` — drop-in for `useTyping`; routes through Socket.IO (#595) |
| Reconnection catch-up (Redis Streams replay) | Done | `gateway:resume` event; client sends `lastEventId` per channel; server replays from Redis Streams (up to 500 events); `gateway:resume-complete` signals success or gap-too-large (#597) |
| Gateway messages hook (`useGatewayMessages`) | Done | `apps/web/hooks/use-gateway-messages.ts` — drop-in for `useRealtimeMessages`; handles replay on reconnect (#597) |
| Client gateway context + provider | Done | `GatewayProvider` in `app-provider.tsx`; single Socket.IO connection shared via React context; auto-reconnect with exponential backoff (#592) |

## Moderation

| Feature | Status | Notes |
|---------|--------|-------|
| Audit log viewer | Done | `/moderation/timeline` |
| Role management | Done | CRUD with permission bitmasks |
| Content screening | Done | Accept/reject queue |

## PWA / Mobile

| Feature | Status | Notes |
|---------|--------|-------|
| Installable manifest + service worker | Done | `manifest.json`, `sw.js` with multi-strategy caching |
| Push notifications (Web Push VAPID) | Done | All users, 4-level settings hierarchy |
| Push permission soft-ask | Done | 60s delay, contextual prompt |
| Offline banner + connection state machine | Done | `use-connection-status` FSM, color-coded banner |
| Message outbox (offline queue) | Done | localStorage-persisted, flushes on reconnect |
| Mobile bottom tab bar (no drawer) | Done | 4-tab pill nav, drawer removed; server sidebar desktop-only |
| Servers page segmented control | Done | My Servers / Discover tabs, inline search, recent servers row |
| Mobile back-button handling | Done | Two-entry history stack prevents PWA exit |
| Branded splash + skeleton screens | Done | Shimmer animation, respects reduced-motion |
| SW update detection + toast | Done | Hourly polling, "New version available" toast |
| iOS splash screens | Done | 8 device sizes, SVG |
| App badge for unread mentions | Done | `use-tab-unread-title` → SW `setAppBadge()` |
| Web Share API | Done | `navigator.share()` in message context menu |
| `inputmode` on all inputs | Done | `search`, `email`, `numeric` where appropriate |
| `viewport-fit=cover` + `interactive-widget` | Done | Safe-area insets + keyboard resize |
| `format-detection: telephone=no` | Done | Prevents iOS auto-linking phone numbers |

## Onboarding / First-Time Experience

| Feature | Status | Notes |
|---------|--------|-------|
| Welcome screen (post-signup) | Done | `OnboardingFlow` component, shown when no servers + `onboarding_completed_at` is null |
| Two CTAs: Create server / Browse servers | Done | Links to template-powered creation or `/channels/discover` |
| Server template selector in onboarding | Done | Gaming, Study, Startup, Creator templates surfaced prominently |
| Server name + icon upload during onboarding | Done | Reuses existing icon upload to `server-icons` bucket |
| Auto-join server after creation | Done | Owner auto-joins via existing DB trigger |
| System bot welcome message in #general | Done | `POST /api/onboarding/welcome-message` — AutoMod posts in first text channel |
| Invite link surfaced post-creation | Done | Invite step shows full URL with copy button |
| `onboarding_completed_at` flag persisted | Done | `users.onboarding_completed_at` column (migration 00063) |
| DM empty state "Find People" CTA | Done | `dm-list.tsx` — buttons for "Find People" + "New Message" |
| Server sidebar empty state hint | Done | "No servers yet" label + pulsing "Create" button |
| Skip onboarding option | Done | "Skip for now" link on welcome screen |

## Auth / Security

| Feature | Status | Notes |
|---------|--------|-------|
| Email verification enforcement | Done | `proxy.ts` blocks unverified users → `/verify-email`; login API returns `emailUnverified`; resend button on verify page |
| Terms of Service page | Done | `/terms` — server component, public route, linked from register page |
| Privacy Policy page | Done | `/privacy` — server component, public route, linked from register page |
| Web app health endpoint | Done | `GET /api/health` — checks Supabase connectivity, returns latency; 503 when degraded |
| Markdown XSS sanitization | Done | `rehype-sanitize` with allowlist schema; only vortex-* elements + Twemoji imgs pass through |
| CSRF protection | Done | Origin/Referer validation in `proxy.ts` for all mutation requests to `/api/*`; passthrough routes use bearer tokens |
| Request body size limits | Done | `proxy.ts` rejects oversized payloads: 1 MB for JSON routes, 10 MB for upload routes; returns 413 |
| Input validation hardening | Done | Search query capped at 500 chars; command args at 4000; login email/password format + length checks; passkey registration field type + length validation |
| Signal server auth cache hardening | Done | Cache TTL reduced 30s→10s, fallback 120s→15s with forced disconnect; Redis-backed token revocation list; `/revoke-token` endpoint for immediate session invalidation (#540) |
| Signal server per-event auth validation | Done | `/force-disconnect` endpoint + Redis pub/sub for real-time eviction on kick/ban; 60-second periodic membership re-validation sweep for active voice peers (#542) |
| GDPR data export | Done | `GET /api/users/export` — JSON download of profile, messages, DMs, friends, servers, reactions; button in Security settings |
| Verify all migrations in Supabase | Done | Migration 00070: fixed `search_path` on 5 SECURITY DEFINER functions (00053, 00054, 00065, 00058); fixed NULL-in-IN-list on `user_activity_log.ref_type`; added compat shim for deprecated `auth.users.is_super_admin` in system bot (00015) |
| CSP nonce-based script policy | Done | Removed `unsafe-eval` and `unsafe-inline` from `script-src`; per-request nonce generated in `proxy.ts` with `strict-dynamic`; nonce propagated to layout via `x-nonce` header |
| CSP img-src/connect-src tightened (#544) | Done | Replaced `https:` / `wss:` wildcards with specific domain allowlists (Supabase, Klipy, Giphy, LiveKit, Sentry); domains derived from env vars |
| Username enumeration via friend request (#543) | Done | Normalized POST `/api/friends` responses — always returns generic "Friend request sent (if user exists)" regardless of username validity |
| Supabase `getUser()` error check in middleware (#550) | Done | `middleware.ts` now checks `error` from `getUser()` and returns `user: null` on failure instead of proceeding with undefined user |
| TURN credentials moved server-side (#538) | Done | Replaced `NEXT_PUBLIC_TURN_*` env vars with server-side `TURN_URL`/`TURN_SECRET`; new `GET /api/turn-credentials` generates ephemeral HMAC-based credentials (TURN REST API); clients fetch via `fetchIceServers()` helper |
| Step-up secret isolation (#541) | Done | Removed `STEP_UP_SECRET` fallback to `NEXTAUTH_SECRET`; production requires dedicated `STEP_UP_SECRET` env var |
| Webhook HMAC request signing (#547) | Done | `POST /api/webhooks/[token]` validates optional `X-Webhook-Signature` header (HMAC-SHA256 with token as key); timing-safe comparison |
| Rate limits on role assignment/removal (#551) | Done | `POST/DELETE /api/servers/[serverId]/members/[userId]/roles` — 10 actions per 5 min per moderator via `rateLimiter` |
| Timing-safe cron/webhook token comparison (#555) | Done | All 6 cron endpoints use `verifyBearerToken()` with `crypto.timingSafeEqual` instead of `===` |

## Media Playback

| Feature | Status | Notes |
|---------|--------|-------|
| Inline audio player | Done | `<audio controls>` in `AttachmentDisplay` for `audio/*` MIME types |
| Inline video player | Done | `<video controls>` in `AttachmentDisplay` for `video/*` MIME types |
| Screen share system audio | Done | `getDisplayMedia({ audio: true })` in `use-voice.ts`; audio track forwarded to peers |

## Notifications

| Feature | Status | Notes |
|---------|--------|-------|
| Quiet hours (notification schedule) | Done | Migration 00064; `quiet_hours_enabled/start/end/timezone` columns; `isInQuietHours()` utility; push suppressed in `sendPushToUser()`; UI in Notifications settings |

## Direct Messages

| Feature | Status | Notes |
|---------|--------|-------|
| Reactions in DMs | Done | `dm_reactions` table (migration 00082); `POST/DELETE /api/dm/channels/[channelId]/messages/[messageId]/reactions`; full emoji picker + quick reactions in `dm-channel-area`; realtime sync via Supabase |
| Date separators in DMs | Done | Day-boundary dividers ("Today", "Yesterday", "March 28, 2026") between messages in `dm-channel-area`; timestamps shown on non-grouped messages |
| Date separators in channels | Done | Day-boundary dividers ("Today", "Yesterday", "March 28, 2026") in `chat-area` and `thread-panel`; messages do not group across day boundaries |

## Threads

| Feature | Status | Notes |
|---------|--------|-------|
| Thread auto-archive (Discord-style) | Done | Migration 00065; `auto_archive_inactive_threads()` RPC; Vercel cron every 5 min; configurable durations: 1h, 24h, 3d, 1w; auto-unarchive on message send; duration selector in create modal + thread panel |

## Accessibility

| Feature | Status | Notes |
|---------|--------|-------|
| Screen reader live announcements for new messages | Done | `aria-live="polite"` region announces all incoming messages with author + preview; `role="log"` with `aria-relevant="additions"` on message container |
| Auto-detect `prefers-contrast: more` (#579) | Done | CSS `@media (prefers-contrast: more)` in `globals.css` + JS `matchMedia` detection in `use-apply-appearance.ts`; manual toggle overrides system preference |

## App Store / Bot Apps

| Feature | Status | Notes |
|---------|--------|-------|
| App catalog with marketplace discovery | Done | `app_catalog`, `app_catalog_public` view, `/api/apps/discover` |
| Per-server app install/uninstall | Done | `server_app_installs`, permission-gated install/uninstall |
| Slash command registration + autocomplete | Done | `app_commands` table, `use-slash-command-autocomplete` hook, dropdown UI |
| Slash command execution with rate limiting | Done | `AppInteractionRuntime`, `/api/servers/[serverId]/apps/commands/execute` |
| Welcome Bot — channel assignment, custom message, rules | Done | `welcome_app_configs` table, `/api/servers/[serverId]/apps/welcome`, auto-posts on member join |
| Welcome Bot — DM on join option | Done | `dm_on_join` + `dm_message` fields in config |
| Welcome Bot — embed color + preview | Done | Color picker, live preview in settings |
| Giveaway Bot — channel assignment | Done | `giveaway_app_configs` table, `/api/servers/[serverId]/apps/giveaway` |
| Giveaway Bot — create timed giveaways | Done | Prize, description, duration, winner count; announcement posted by system bot |
| Giveaway Bot — enter/leave giveaways | Done | `/api/servers/[serverId]/apps/giveaway/[giveawayId]` with `enter`/`leave` actions |
| Giveaway Bot — draw winners + announce | Done | Random selection, winner announcement in channel |
| Giveaway Bot — end early, cancel, reroll | Done | Admin actions with confirmation dialogs |
| App config panels in server settings | Done | Inline config UI for all 5 apps in Apps tab |
| Discover page app install | Done | "Add to Server" picker on `/channels/discover` Apps tab |
| Permission-based app management | Done | `MANAGE_WEBHOOKS` / `USE_APPLICATION_COMMANDS` holders can install/uninstall (not just owners) |
| Channel list API endpoint | Done | `GET /api/servers/[serverId]/channels` |
| Standup Assistant — channel, schedule, questions | Done | `standup_app_configs` table, configurable questions (1-10), active days, reminder time/timezone |
| Standup Assistant — submit & view standups | Done | `standup_entries` table, daily per-user submission, team view in config panel |
| Standup Assistant — slash commands | Done | `/standup`, `/standupconfig`, `/standupview`, `/standupremind` |
| Incident Bot — channel, severity levels | Done | `incident_app_configs` table, customizable severity labels |
| Incident Bot — create & track incidents | Done | `incidents` table, status flow: investigating → identified → monitoring → resolved |
| Incident Bot — timeline updates | Done | `incident_updates` table, status change + message history |
| Incident Bot — channel announcements | Done | System bot posts on create, update, and resolve |
| Incident Bot — slash commands | Done | `/incident`, `/iupdate`, `/iresolve`, `/ilist`, `/itimeline` |
| Reminder Bot — personal reminders (up to 24h) | Done | `reminders` table, `reminder_app_configs`, per-user max limit |
| Reminder Bot — slash commands | Done | `/reminder`, `/reminders`, `/rcancel` |
| Giveaway Bot + Reminder Bot marketplace visibility | Done | Fixed via migration 00071 — upsert ensures `is_published = TRUE` (00066/00068 used `ON CONFLICT DO NOTHING` which silently skipped rows) |

## Vanity Invite URLs

| Feature | Status | Notes |
|---------|--------|-------|
| Vanity URL column on servers table | Done | Migration 00078 — `vanity_url TEXT UNIQUE` with slug format CHECK constraint |
| Vanity URL validation (3-32 chars, lowercase slug) | Done | Regex `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` enforced at DB + API level |
| Vanity URL setting in server settings | Done | Owner-only UI in Invites tab with live preview and copy button |
| Invite lookup resolves vanity URLs | Done | `GET/POST /api/invites/[code]` checks `invite_code` then `vanity_url` |
| Vanity URL uniqueness check | Done | API checks uniqueness before save; DB UNIQUE constraint as safety net |

## Profile Badges & Achievements

| Feature | Status | Notes |
|---------|--------|-------|
| Badge definitions table (catalog) | Done | Migration 00079 — `badge_definitions` with category, rarity, icon, color |
| User badges table (assignments) | Done | `user_badges` with `UNIQUE(user_id, badge_id)`, awarded_by tracking |
| 10 default badge definitions seeded | Done | early_adopter, bug_hunter, server_owner, moderator, message_veteran, voice_regular, streak_master, event_host, community_star, verified |
| Badge catalog API | Done | `GET /api/badges` — public catalog of all badge definitions |
| User badges API (read/award/revoke) | Done | `GET/POST/DELETE /api/users/badges` — ADMINISTRATOR permission required for award/revoke |
| Profile badges component | Done | `ProfileBadges` with icon rendering, rarity glow, tooltips |
| Badges section in profile panel | Done | Shown between Roles and Connections sections |
| RLS policies for badges | Done | Public read; service_role manages inserts/updates |

## Attachment Retention / Decay

| Feature | Status | Notes |
|---------|--------|-------|
| Size-based expiry calculation (Fluxer-style) | Done | `@vortex/shared` `computeDecay()` — ≤5 MB → 3 years, ≥500 MB → 14 days, log-linear blend |
| Decay columns on attachments + dm_attachments | Done | Migration 00081 — `expires_at`, `last_accessed_at`, `purged_at`, `lifetime_days`, `decay_cost` |
| Backfill existing attachments with expiry | Done | Migration 00081 DO block computes expiry for all pre-existing rows |
| Expiry set on channel attachment upload | Done | `POST /api/messages` — `insertMessageWithAttachments()` calls `computeDecay()` |
| Expiry set on DM attachment upload | Done | `dm-channel-area.tsx` — `computeDecay()` called on DM file upload |
| Access-based renewal on channel download | Done | `GET /api/attachments/[id]/download` — `maybeRenewExpiry()` extends deadline when accessed near expiry |
| Access-based renewal on DM download | Done | `GET /api/dm/attachments/[id]/download` — same renewal logic |
| Purged file access returns 410 Gone | Done | Both download endpoints return 410 for purged attachments |
| Daily cleanup cron job | Done | `GET /api/cron/attachment-decay` — purges expired files from Supabase Storage in batches of 200 |
| Vercel cron schedule | Done | `vercel.json` — runs daily at midnight UTC |

## User Status / Presence (Fluxer-style)

| Feature | Status | Notes |
|---------|--------|-------|
| Server-side heartbeat endpoint | Done | `POST /api/presence/heartbeat` — client pings every 30s; updates `last_heartbeat_at` in users table |
| Stale-presence cron cleanup | Done | `GET /api/cron/presence-cleanup` — marks users with stale heartbeats (>90s) as offline; runs every minute via Vercel Cron |
| DB migration for heartbeat column | Done | Migration 00083 — `last_heartbeat_at TIMESTAMPTZ` + partial index on online/idle/dnd users |
| Multi-tab session coordination | Done | `BroadcastChannel` API syncs status across tabs; closing one tab doesn't mark offline when others remain |
| Status aggregation (multi-session) | Done | `@vortex/shared` `aggregateStatus()` — precedence: online > dnd > idle > offline; invisible overrides all |
| Idle detection (10min, Fluxer-style) | Done | 10-minute timeout with 25%-interval checks; tab visibility triggers instant idle |
| Presence constants in shared package | Done | `@vortex/shared` — heartbeat interval, stale threshold, idle timeout, activity throttle |
| DB-level status change listener | Done | `member-list.tsx` subscribes to `postgres_changes` on users table for immediate cron-triggered offline updates |
| sendBeacon as fast-path fallback | Done | Still used on tab close for immediate offline; heartbeat cron is the safety net |

## Hardening — Bug Fixes (2026-04-01)

| Fix | Status | Notes |
|-----|--------|-------|
| Hardcoded `color: "white"` in badges (#578) | Done | Added `--theme-danger-foreground` design token; replaced all `color: "white"` on danger backgrounds with theme-aware token |
| Z-index scale misalignment (#577) | Done | Unified Tailwind config to match CSS variable scale; added `z-tabbar` (50) for mobile nav; replaced all `z-40` with semantic classes |
| Mobile touch targets below WCAG 44px (#573) | Done | Tab bar links → 44px; member list rows → `min-h-[44px]`; category buttons → `min-h-[44px]`; reaction chips → `min-h-[44px]` with padding |
| Audit log fire-and-forget (#554) | Done | `insertAuditLog` helper now logs errors; all direct `.from("audit_logs").insert()` calls updated to check and log errors |
| Server deletion cascade non-atomic (#553) | Done | Created `delete_server_cascade` RPC (migration 00084); single-transaction deletion replaces sequential per-table deletes |
| Webhook messages attributed to owner (#548) | Done | Added `webhook_id` FK column to messages (migration 00085); webhook route uses `SYSTEM_BOT_ID` as author; BOT badge shown in message UI |
| Role assignment + audit log atomic (#582) | Done | `assign_member_role` / `remove_member_role` RPCs (migration 00086); single-transaction role mutation + audit log replaces separate inserts |
| Automod rule reorder error handling (#572) | Done | `movePriority` and `toggleEnabled` now validate `Response.ok` and wrap in try/catch with toast notifications on failure |
| Webhook display metadata separation (#581) | Done | Added `webhook_display_name` / `webhook_avatar_url` columns (migration 00087); webhook route stores clean content; message-item renders identity from metadata |
| ChatArea decomposition — extracted hooks (#585) | Done | Created `useChatHistory` (pagination, backfill) and `useChatRealtime` (message/reaction callbacks) hooks in `components/chat/hooks/` |
| Event bus abstraction interface (#586) | Done | Added `IEventBus` interface with publish/subscribe/replay/acknowledge in `@vortex/shared`; typed event system with `VortexEvent` and `VortexEventType` |
| Signal server graceful shutdown + Redis TTL (#587) | Done | 30s connection-draining shutdown; Redis room key TTL (5min) with periodic refresh; crash recovery via auto-expiry; SIGINT+SIGTERM handling |
| Read position tracking API endpoints (#588) | Done | `POST /api/channels/:channelId/ack` for mark-as-read; `GET /api/users/me/read-states` for bulk hydration of channels, DMs, and threads |
| PATCH roles handler try/catch (#567) | Done | Already had top-level try/catch wrapping entire handler body |
| Server-templates POST try/catch + permission check (#568) | Done | Wrapped entire POST handler in try/catch; added membership verification before preview/apply/export modes |
| Voice-channel fetchParticipants double-cast (#569) | Done | Replaced `as unknown as` with local `VoiceStateWithUser` interface; added error handling for Supabase query |
| SearchResult discriminated union (#570) | Done | Split flat `SearchResult` into `MessageSearchResult \| TaskSearchResult \| DocSearchResult` discriminated union |
| Audit log insert failure handling in roles (#571) | Done | PATCH and DELETE role handlers now return 500 if audit log insert fails instead of silently continuing |
| CSS `color-scheme` for native dark mode (#574) | Done | Added `color-scheme: dark` to `:root`; added `color-scheme: light` to clarity preset; sakura-blossom already had it |
| CSS container queries for component responsiveness (#575) | Done | Added `container-type: inline-size` to channel sidebar, member list, message input, thread panel; responsive `@container` rules |
| Named view transitions (#576) | Done | Added `view-transition-name` to server sidebar, channel sidebar, chat area, and chat header surfaces; respects `prefers-reduced-motion` |
| Suspicious login detection enforcement (#545) | Done | `computeLoginRisk` now returns `action` field; score >= 60 requires MFA/email challenge; score >= 80 locks session and requires email verification |

---

*Last updated: 2026-04-01 (sprint 2)*
