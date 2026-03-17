# Critical Gap Implementation Plans

> Generated: 2026-03-17
> Companion to: [feature-parity-audit.md](./feature-parity-audit.md)

This document provides concrete implementation plans for all 🔴 Critical gaps.
Gaps 1–5 have been **scaffolded** (code written). Gap 6 is planned here.

---

## Gap 1: Inline Audio/Video Player ✅ IMPLEMENTED

**Complexity:** S (Small)
**Stack fit:** Yes — native `<audio>` and `<video>` HTML5 elements, no new deps.

### Files Modified
- `apps/web/components/chat/message-item.tsx` — `AttachmentDisplay` component

### What Changed
- Added MIME-type detection: `isVideo = content_type?.startsWith("video/")`, `isAudio = content_type?.startsWith("audio/")`
- Video: Renders `<video controls preload="metadata">` with max-height 320px, filename + size label below
- Audio: Renders `<audio controls preload="metadata">` inside a styled card with file extension badge
- Both use existing `/api/attachments/{id}/download` URL pattern
- Only shown for `isDownloadable` (clean scan state) attachments
- Includes `<track kind="captions" />` for accessibility compliance on video

### Not Changed
- DM message rendering (`dm-channel-area.tsx`) — uses markdown-link pattern for images, not `AttachmentDisplay`. DMs would need separate work if file uploads are added to DMs beyond the current image-only flow.

---

## Gap 2: Screen Share with System Audio ✅ IMPLEMENTED

**Complexity:** S (Small)
**Stack fit:** Yes — browser-native `getDisplayMedia` API.

### Files Modified
- `apps/web/lib/webrtc/use-voice.ts` — P2P WebRTC screen share

### What Changed
- Changed `audio: false` → `audio: true` in `getDisplayMedia()` constraints
- Added audio track forwarding: after capturing, `stream.getAudioTracks()[0]` is added to each peer connection via `pc.addTrack(audioTrack, stream)`
- Added cleanup: `onended` handler now also stops audio tracks

### Not Changed
- `use-livekit-voice.ts` — LiveKit handles `setScreenShareEnabled()` internally and already supports system audio capture by default when the browser offers it. No change needed.
- The dual WebRTC/LiveKit architecture is preserved.

---

## Gap 3: Notification Quiet Hours ✅ IMPLEMENTED

**Complexity:** M (Medium)
**Stack fit:** Yes — Supabase columns + Intl.DateTimeFormat for timezone math.

### Files Created
- `supabase/migrations/00064_quiet_hours.sql` — Adds 4 columns to `user_notification_preferences`
- `apps/web/lib/quiet-hours.ts` — `isInQuietHours()` utility

### Files Modified
- `apps/web/app/api/user/notification-preferences/route.ts` — Extended type, GET select, PUT validation for new fields
- `apps/web/lib/push.ts` — `sendPushToUser()` checks quiet hours before sending
- `apps/web/components/settings/notifications-settings-page.tsx` — New "Quiet Hours" UI section

### Schema
```sql
ALTER TABLE user_notification_preferences
  ADD quiet_hours_enabled  BOOLEAN DEFAULT FALSE,
  ADD quiet_hours_start    TIME    DEFAULT '22:00',
  ADD quiet_hours_end      TIME    DEFAULT '08:00',
  ADD quiet_hours_timezone TEXT    DEFAULT 'UTC';
```

### How It Works
1. User enables quiet hours and sets start/end times + timezone in Settings > Notifications
2. When `sendPushToUser()` fires, it queries the user's quiet hours preferences
3. `isInQuietHours()` uses `Intl.DateTimeFormat` to convert current UTC time to user's local timezone
4. If current time falls within the quiet window, push is suppressed (function returns early)
5. Supports overnight ranges (e.g., 22:00 → 08:00) and same-day ranges (e.g., 09:00 → 17:00)

---

## Gap 4: Screen Reader aria-live for Chat ✅ IMPLEMENTED

**Complexity:** S (Small)
**Stack fit:** Yes — native ARIA attributes.

### Files Modified
- `apps/web/components/chat/chat-area.tsx`

### What Changed
1. **Message container** — Added `aria-label="Message history"` and `aria-relevant="additions"` to the scroll container (`role="log"`)
2. **Live announcements** — Moved the `setLiveAnnouncement()` call to fire for ALL incoming messages from other users, not just when the user is scrolled away. Includes a content preview (first 120 chars) so screen reader users get context.
3. The existing `aria-live="polite"` region and typing announcement region were already present and are now more useful.

### Not Changed
- The `role="log"` and `aria-atomic="true"` structure was already correct. No structural changes to the message list.

---

## Gap 5: User Data Export (GDPR) ✅ IMPLEMENTED

**Complexity:** M (Medium)
**Stack fit:** Yes — standard Supabase queries + JSON download.

### Files Created
- `apps/web/app/api/users/export/route.ts` — GET endpoint that assembles user data

### Files Modified
- `apps/web/components/settings/security-settings-page.tsx` — Added "Your Data" section with Download button

### How It Works
1. `GET /api/users/export` authenticates via Supabase session (same pattern as all other API routes)
2. Runs 7 parallel queries to gather: profile, messages (10k), DM messages (10k), friendships, server memberships, notification preferences, reactions (5k)
3. Returns JSON with `Content-Disposition: attachment` header to trigger browser download
4. UI button in Security & Privacy settings triggers fetch → blob → download via temporary `<a>` element

### Data Included
| Category | Source Table | Limit |
|---|---|---|
| Profile | `users` | 1 row |
| Messages | `messages` | 10,000 |
| DM Messages | `dm_messages` | 10,000 |
| Friendships | `friendships` | All |
| Server Memberships | `server_members` + `servers` | All |
| Notification Preferences | `user_notification_preferences` | 1 row |
| Reactions | `reactions` | 5,000 |

### Future Enhancements
- Add file attachment export (ZIP with actual files from Supabase Storage)
- Add background job processing for very large exports
- Add rate limit (once per 24h) — currently client-gated only

---

## Gap 6: Public Bot API + Token Auth 📋 PLANNED

**Complexity:** L (Large) — ~1-2 weeks
**Stack fit:** Mostly yes. Requires new auth path (bearer token) alongside existing session cookies.

### Overview
Create a bot user type and token-based authentication so external developers can build integrations. This is the highest-effort gap but critical for ecosystem growth.

### Migration: `00065_bot_tokens.sql`

```sql
-- Bot accounts (subset of users table)
CREATE TABLE IF NOT EXISTS public.bot_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url  TEXT,
  bio         TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API tokens for bots
CREATE TABLE IF NOT EXISTS public.bot_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES public.bot_accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,  -- SHA-256 of the token (never store plaintext)
  name        TEXT NOT NULL DEFAULT 'default',
  scopes      TEXT[] NOT NULL DEFAULT ARRAY['messages.read', 'messages.write'],
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bot installations per server
CREATE TABLE IF NOT EXISTS public.bot_installations (
  bot_id     UUID NOT NULL REFERENCES public.bot_accounts(id) ON DELETE CASCADE,
  server_id  UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  installed_by UUID NOT NULL REFERENCES public.users(id),
  permissions INTEGER NOT NULL DEFAULT 0,  -- bitmask from @vortex/shared
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot_id, server_id)
);

ALTER TABLE public.bot_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_installations ENABLE ROW LEVEL SECURITY;
```

### New Files

| File | Purpose |
|---|---|
| `apps/web/app/api/bots/route.ts` | CRUD for bot accounts (create, list owned bots) |
| `apps/web/app/api/bots/[botId]/tokens/route.ts` | Token generation + revocation |
| `apps/web/app/api/bots/[botId]/install/route.ts` | Install bot to a server |
| `apps/web/lib/bot-auth.ts` | Token validation middleware: hash incoming bearer token, look up `bot_tokens`, resolve bot_id + scopes |
| `packages/shared/src/index.ts` | Add `BOT_SCOPES` enum (no new permission bits needed — bots use existing permission bitmask via `bot_installations.permissions`) |

### Modified Files

| File | Change |
|---|---|
| `apps/web/proxy.ts` | Add bearer token path: if `Authorization: Bot <token>` header present, resolve bot identity instead of Supabase session. Route to same API handlers but with bot context. |
| `apps/web/lib/server-auth.ts` | Add `getBotPermissions()` that reads `bot_installations.permissions` for the current server |

### Auth Flow
1. Developer creates bot account via UI or `POST /api/bots`
2. Generates a token via `POST /api/bots/{id}/tokens` — plaintext shown once, SHA-256 stored
3. Server admin installs bot via `POST /api/bots/{id}/install` with permission bitmask
4. Bot makes API calls with `Authorization: Bot <token>` header
5. `proxy.ts` detects the header, resolves bot identity, and attaches it to the request context
6. Existing API routes check permissions using the bot's installed permission bitmask

### Scopes
- `messages.read` — Read messages in installed servers
- `messages.write` — Send messages
- `members.read` — Read member lists
- `channels.read` — Read channel lists
- `reactions.write` — Add reactions
- `webhooks.manage` — Manage webhooks

### What This Does NOT Change
- Existing permission bitmask system (bots reuse it via `bot_installations.permissions`)
- Existing WebRTC/LiveKit voice architecture (bots are text-only initially)
- Existing offline/outbox message consistency model
- Existing server templates schema

---

## Summary

| Gap | Status | Complexity | New Deps? |
|---|---|---|---|
| 1. Inline audio/video player | ✅ Done | S | No |
| 2. Screen share system audio | ✅ Done | S | No |
| 3. Quiet hours | ✅ Done | M | No |
| 4. Screen reader aria-live | ✅ Done | S | No |
| 5. Data export | ✅ Done | M | No |
| 6. Bot API + tokens | 📋 Planned | L | No (crypto built-in) |
