# MVP Core Features — Gap Tracker

> Single source of truth for Tier 1 / Tier 2 feature gaps.
> Updated as features are completed during the hardening sprint.

## Emoji System

| Feature | Status | Notes |
|---------|--------|-------|
| Custom emoji upload (PNG/GIF/WEBP, 256 KB) | Done | `POST /api/servers/[serverId]/emojis` |
| Emoji autocomplete (`:name:`) | Done | `use-emoji-autocomplete` hook |
| Emoji management page in server settings | Done | `EmojisTab` in server-settings-modal |
| Emoji attribution — uploader name & date | Done | API returns `uploader` join; shown in management UI |
| Audit logging for emoji upload/delete | Done | `audit_logs` entries with `emoji_uploaded` / `emoji_deleted` actions |
| CDN cache-bust on emoji delete | Done | `CDN-Cache-Control: no-store` header on DELETE response |

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
| Mobile bottom tab bar + drawer nav | Done | Responsive `md:` breakpoint with hysteresis |
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
| GDPR data export | Done | `GET /api/users/export` — JSON download of profile, messages, DMs, friends, servers, reactions; button in Security settings |

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

## Threads

| Feature | Status | Notes |
|---------|--------|-------|
| Thread auto-archive (Discord-style) | Done | Migration 00065; `auto_archive_inactive_threads()` RPC; Vercel cron every 5 min; configurable durations: 1h, 24h, 3d, 1w; auto-unarchive on message send; duration selector in create modal + thread panel |

## Accessibility

| Feature | Status | Notes |
|---------|--------|-------|
| Screen reader live announcements for new messages | Done | `aria-live="polite"` region announces all incoming messages with author + preview; `role="log"` with `aria-relevant="additions"` on message container |

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

---

*Last updated: 2026-03-18*
