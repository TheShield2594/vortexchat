# VortexChat — Discord Replacement Gap Analysis

**Date**: 2026-02-19
**Branch**: `claude/discord-replacement-analysis-P2zNd`

---

## Executive Summary

VortexChat has a solid foundation: servers, text channels, DMs, a bitmask permission system, WebRTC voice, screen sharing, file uploads, and a professional Discord-like UI. However, significant gaps remain before it can function as a full Discord replacement. This document categorizes every missing feature, notes severity, and references the relevant code or schema.

Severity levels:
- **P0 — Blocker**: Users will hit this immediately; stops basic usage
- **P1 — Critical**: Missing core Discord experience
- **P2 — Important**: Quality/parity gap that makes daily use worse
- **P3 — Nice to Have**: Long-tail features, power-user or enterprise

---

## 1. Voice & Audio — Gaps

### 1.1 No TURN Server (P0)
**Current state**: Only two Google STUN servers are configured (`stun.l.google.com:19302`).
**Problem**: STUN alone resolves ~80% of NAT scenarios. The remaining ~20% — symmetric NAT, strict corporate firewalls, double-NAT — require a TURN relay server. Without TURN, these users get a silent connection failure with no error message.
**Location**: `apps/web/lib/webrtc/use-voice.ts` ICE servers array.
**Fix**: Deploy a coturn server, add `turn:` and `turns:` ICE entries with credentials. Self-hosted coturn is free; Twilio TURN is pay-as-you-go.

### 1.2 No Video in Voice Channels (P1)
**Current state**: `getUserMedia` is called with `{ audio: true, video: false }`. Screen sharing works (`getDisplayMedia`) but no camera video.
**Problem**: Video calls (webcam) are a core Discord feature. Voice channels in Discord allow video feeds alongside audio.
**Location**: `apps/web/lib/webrtc/use-voice.ts`, `apps/web/components/voice/voice-channel.tsx`.
**Fix**: Add a `toggleVideo()` function mirroring `toggleScreenShare()`. Add video track to peer connections. Render `<video>` elements in the participant grid.

### 1.3 No Push-to-Talk (PTT) (P2)
**Current state**: Microphone is always open; user must manually click mute.
**Problem**: PTT is heavily used, especially in noisy environments.
**Fix**: Listen for a configurable `keydown`/`keyup` event, temporarily unmute the local track. Store PTT keybind in user settings.

### 1.4 No Input / Output Device Selection (P2)
**Current state**: Browser default microphone is always used. No audio output routing.
**Problem**: Users with multiple audio devices (headset + speakers) cannot choose which device to use.
**Fix**: Enumerate devices via `navigator.mediaDevices.enumerateDevices()`. Let user select `audioinput` and `audiooutput` in voice settings. Apply `sinkId` to `<audio>` elements for output routing.

### 1.5 No Audio Quality / Bitrate Controls (P2)
**Current state**: Default WebRTC audio codec and bitrate negotiation.
**Problem**: Discord lets users choose between Normal / Good / Best audio quality (Opus bitrate). Echo suppression and noise reduction are fixed.
**Fix**: Use SDP munging or `RTCRtpSender.setParameters()` to set Opus bitrate. Expose audio processing options (noiseSuppression, echoCancellation) as toggleable settings.

### 1.6 Peer-to-Peer Doesn't Scale Beyond ~8 Users (P1)
**Current state**: Full-mesh P2P — every peer connects to every other peer. Each new participant adds N-1 new connections.
**Problem**: At 6–8 participants CPU and bandwidth degrade significantly. Discord uses Selective Forwarding Units (SFUs — e.g., mediasoup, Janus, Pion) for large voice rooms.
**Fix**: Integrate mediasoup or Livekit as an SFU. The signaling server (`apps/signal/`) would need to be replaced or extended to broker SFU transports instead of P2P offers.

### 1.7 No Voice Channel User Limit Setting (P3)
**Fix**: Add `user_limit` column to `channels` table. Enforce in signal server `join-room` handler.

---

## 2. Messaging — Gaps

### 2.1 No Typing Indicators (P1)
**Current state**: No "user is typing..." indicator exists anywhere.
**Problem**: This is a baseline expectation in any chat application.
**Fix**: Emit a `typing` event via Supabase Realtime Broadcast (not PostgreSQL CDC — ephemeral is fine). Subscribe in `chat-area.tsx`. Show indicator for 3 seconds, reset on each keystroke.

### 2.2 No Unread State / Read Tracking (P1)
**Current state**: No `read_states` table. No red badges, no bold channel names, no unread divider line.
**Problem**: Users cannot tell which messages are new since they last looked.
**Schema fix**:
```sql
CREATE TABLE read_states (
  user_id UUID REFERENCES users(id),
  channel_id UUID REFERENCES channels(id),
  last_read_message_id UUID REFERENCES messages(id),
  mention_count INT DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);
```
**UI fix**: Bold channel names with unread messages. Show red badge with mention count. Show red "NEW MESSAGES" divider line in chat. Mark read on scroll-to-bottom or channel focus.

### 2.3 No Mention System (@user, @role, @everyone, @here) (P1)
**Current state**: Messages are plain text. No mention parsing, no mention notifications, no highlight.
**Schema fix**: Add `mentions` JSONB column to `messages` (array of user/role IDs). Add `mention_everyone`, `mention_here` BOOLEAN columns.
**Frontend fix**: Markdown-like parser that converts `@username` to a styled mention pill. Highlight messages that mention the current user.
**Read-state fix**: Increment `mention_count` in `read_states` on insert.

### 2.4 No Message Pinning (P2)
**Current state**: No pinned messages feature.
**Schema fix**:
```sql
ALTER TABLE messages ADD COLUMN pinned BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN pinned_by UUID REFERENCES users(id);
```
**UI fix**: Right-click context menu → "Pin Message". Pinned messages panel accessible from channel header.

### 2.5 No Message Formatting / Markdown Rendering (P1)
**Current state**: Messages appear to be displayed as raw text. No bold, italic, code blocks, strikethrough.
**Fix**: Integrate a markdown renderer (e.g., `marked`, `react-markdown`, or a Discord-flavored subset). Support:
- `**bold**`, `*italic*`, `__underline__`
- `~~strikethrough~~`
- `` `inline code` ``
- ` ```language\ncode block\n``` ` with syntax highlighting (Prism.js / highlight.js)
- `> blockquote`
- `||spoiler||` (reveal on click)
- `[masked links](url)` (optional)

### 2.6 No Rich Link Embeds / URL Previews (P2)
**Current state**: URLs in messages are plain text.
**Fix**: Server-side Open Graph scraper (Next.js API route). Store `embeds` JSONB in messages. Render title, description, image, favicon in message area.

### 2.7 No Threads (P2)
**Current state**: Reply (`reply_to_id`) exists but only shows a reference — not a collapsible thread sidebar.
**Fix**: Add `thread_id` grouping or a dedicated `threads` table. Create a thread panel component that opens on the right side of the chat area.

### 2.8 No Bulk Message Delete (P2)
**Current state**: Only soft-delete of individual messages exists.
**Fix**: Add multi-select UI in message area. API route for bulk soft-delete requiring `MANAGE_MESSAGES` permission.

### 2.9 No Message Search (P2)
**Current state**: No search functionality anywhere.
**Fix**: Postgres full-text search on `messages.content` with `tsvector`. Add a search modal with filters (channel, author, before/after date, has attachment). Consider `pg_trgm` for fuzzy search.

### 2.10 No Reactions UI Updates in Real-time (verify) (P1)
**Current state**: `reactions` table exists and has Realtime enabled, but the `useRealtimeMessages` hook only subscribes to `messages` table INSERT/UPDATE — not `reactions`.
**Fix**: Add a Supabase Realtime subscription for `reactions` INSERT/DELETE filtered by `channel_id` (join via message).

### 2.11 No Emoji Picker for Reactions (P2)
**Current state**: `reactions` exist in the DB but it's unclear whether the UI has an emoji picker for reactions specifically vs. message composition.
**Fix**: Add emoji picker triggered from message hover (the "add reaction" button).

---

## 3. Direct Messages — Gaps

### 3.1 No Group DMs (P1)
**Current state**: `direct_messages` table has `sender_id` and `receiver_id` — strictly 1:1.
**Fix**: Create a `dm_channels` table (like Discord's group DM concept):
```sql
CREATE TABLE dm_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  icon_url TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dm_channel_members (
  dm_channel_id UUID REFERENCES dm_channels(id),
  user_id UUID REFERENCES users(id),
  PRIMARY KEY (dm_channel_id, user_id)
);
```
Refactor `direct_messages` to reference `dm_channel_id` instead of sender/receiver pair. Group DMs support up to 10 members on Discord.

### 3.2 No DM Inbox / Unread DM Badges (P1)
**Current state**: DM list exists but no unread count, no notification badge on the DM icon.
**Fix**: Extend `read_states` to cover DM conversations.

### 3.3 No Voice/Video Calls in DMs (P1)
**Current state**: Voice only exists in server voice channels. Discord supports 1:1 video/voice calls in DMs.
**Fix**: Extend the signaling server to handle DM call rooms (roomId = sorted concatenation of two user IDs). Add call initiation UI, incoming call notification (Supabase Broadcast), accept/reject flow.

---

## 4. Friend System — Gaps

### 4.1 No Friend Requests / Friend List (P1)
**Current state**: Users can DM anyone but there is no friend system.
**Schema fix**:
```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(id),
  addressee_id UUID REFERENCES users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
```
**UI fix**: Friend list in the `@me` area. Pending requests section. Accept/decline buttons.

### 4.2 No User Blocking (P1)
**Current state**: No ability to block users. Users can receive DMs from anyone.
**Fix**: `status = 'blocked'` in `friendships` table. Enforce in DM RLS policies. Hide blocked user messages.

---

## 5. Notifications — Gaps

### 5.1 No Push Notifications (P1)
**Current state**: No Web Push, no notification badges, no browser notifications.
**Fix**: Integrate Web Push API with a service worker. Store push subscriptions in DB. Trigger pushes via Supabase Edge Functions or a background job on new message insert where `mention_count > 0` or channel is unwatched.

### 5.2 No Notification Settings (Per-Server, Per-Channel) (P2)
**Current state**: No notification preferences.
**Schema fix**:
```sql
CREATE TABLE notification_settings (
  user_id UUID REFERENCES users(id),
  scope_type TEXT CHECK (scope_type IN ('server', 'channel')),
  scope_id UUID,
  level TEXT CHECK (level IN ('all', 'mentions', 'nothing')),
  muted BOOLEAN DEFAULT false,
  muted_until TIMESTAMPTZ,
  PRIMARY KEY (user_id, scope_type, scope_id)
);
```

### 5.3 No In-App Notification Bell / Inbox (P2)
**Fix**: Notification inbox modal. Mark-as-read flow. Store notifications in a `notifications` table.

---

## 6. Server Management — Gaps

### 6.1 No Kick/Ban UI (P1)
**Current state**: `KICK_MEMBERS` (8) and `BAN_MEMBERS` (16) permissions exist in the bitmask. `/api/servers/[serverId]/members` has a DELETE endpoint for removal. But there is no UI surface (right-click menu, member list context menu) that exposes kick or ban.
**Schema fix**: Add `bans` table:
```sql
CREATE TABLE server_bans (
  server_id UUID REFERENCES servers(id),
  user_id UUID REFERENCES users(id),
  banned_by UUID REFERENCES users(id),
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);
```
**UI fix**: Right-click member in member list → kick/ban options. Ban list in server settings.

### 6.2 No Audit Log (P2)
**Current state**: No tracking of administrative actions.
**Schema fix**:
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  actor_id UUID REFERENCES users(id),
  action TEXT, -- 'member_kick', 'member_ban', 'channel_create', 'role_update', etc.
  target_id UUID,
  target_type TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.3 No Multiple Invite Links (P2)
**Current state**: Single `invite_code` column on the `servers` table. No expiry, no max uses.
**Schema fix**:
```sql
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  server_id UUID REFERENCES servers(id),
  channel_id UUID REFERENCES channels(id),
  created_by UUID REFERENCES users(id),
  max_uses INT,
  uses INT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  temporary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Remove `invite_code` from `servers` table.

### 6.4 No Verification Level / Member Screening (P2)
**Current state**: Anyone with an invite link can join instantly.
**Fix**: `verification_level` on servers (none, low, medium, high). Rules/screening: require new members to accept rules before seeing channels.

### 6.5 No Server Discovery / Explore (P3)
**Current state**: No public server browser.
**Fix**: `is_discoverable` flag on servers. Public server search/browse page.

### 6.6 No Scheduled Events (P3)
**Schema fix**:
```sql
CREATE TABLE server_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  creator_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  channel_id UUID REFERENCES channels(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.7 No Webhooks (P2)
**Fix**: Webhooks table with URL + token. Incoming webhook POST endpoint in Next.js API routes. Fire webhooks on configurable events (new message, member join, etc.).

### 6.8 No Server Templates (P3)
**Fix**: Export/import server structure (channels, roles, permissions) as a JSON template.

### 6.9 No Slowmode Enforcement (P1)
**Current state**: `slowmode_delay` column exists on `channels` but is never enforced server-side.
**Fix**: In the messages API route, check the sender's last message timestamp in this channel vs. `slowmode_delay`. Return 429 if within the cooldown.

---

## 7. User Experience — Gaps

### 7.1 No Presence Sync (Auto Online/Offline) (P1)
**Current state**: User status is manually set and never automatically synced. If a user closes the browser, their status stays "online."
**Fix**: Use Supabase Realtime Presence (already used for voice). On app mount, mark user as online. On disconnect/beforeunload, set to offline. Alternatively use a heartbeat with a backend job to expire stale presences.

### 7.2 No User Profile Popout / Hover Card (P2)
**Current state**: Unclear if clicking a username shows a profile card.
**Fix**: Profile popout on username click in member list and in chat messages. Show avatar, display name, roles, mutual servers, join date. "Send Message" button.

### 7.3 No Context Menus (Right-Click) (P2)
**Current state**: No right-click context menus on messages, channels, or members (visible in UI).
**Fix**: Custom context menu component for messages (reply, react, edit, pin, delete), channels (copy link, edit, delete), and members (view profile, kick, ban, assign role).

### 7.4 No Infinite Scroll / Load More in Chat (P1)
**Current state**: Messages are fetched with a limit of 50-100. The `before` cursor param exists in the API but it's unclear if infinite scroll is implemented.
**Fix**: Intersection Observer on the top message. Load earlier messages when scrolled to top. Maintain scroll position after loading.

### 7.5 No Jump to Present / Jump to Message (P2)
**Fix**: "Jump to Present" button when scrolled up. "Jump to Message" from search results or mention notifications.

### 7.6 No Message Copy / Copy Link (P2)
**Fix**: Copy plain text and copy message link to clipboard.

### 7.7 No Keyboard Shortcuts (P2)
**Fix**: Quickswitcher (Ctrl+K), mark all read (Escape), navigate channels (Alt+Up/Down), focus chat (/).

### 7.8 No Custom Server Emoji (P2)
**Current state**: Only Unicode emoji reactions. No custom server emoji upload.
**Schema fix**:
```sql
CREATE TABLE server_emojis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  animated BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.9 No GIF Picker (P3)
**Fix**: Integrate Tenor or Giphy API. Add GIF button to message input toolbar.

### 7.10 No Sticker Support (P3)
**Fix**: Static/animated sticker library. Per-server sticker packs.

---

## 8. Security & Account — Gaps

### 8.1 No Two-Factor Authentication (2FA) (P1)
**Current state**: Supabase Auth supports TOTP. VortexChat does not expose 2FA setup in the profile settings modal.
**Fix**: Add a Security tab to `profile-settings-modal.tsx`. Call `supabase.auth.mfa.enroll()` for TOTP setup. Show QR code. Require MFA challenge on sensitive actions.

### 8.2 No Active Sessions Management (P2)
**Current state**: No UI to see or revoke active login sessions.
**Fix**: List active sessions from Supabase Auth admin API. Allow remote sign-out.

### 8.3 No Account Deletion (P2)
**Fix**: "Delete Account" in settings. Cascade-delete or anonymize user data per privacy policy.

### 8.4 No Email Change Flow (P2)
**Current state**: Email is used for auth but no email change UI exists.
**Fix**: `supabase.auth.updateUser({ email: newEmail })` triggers a verification email.

### 8.5 No Rate Limiting (P1)
**Current state**: No rate limiting on message posting, file uploads, or API routes.
**Fix**: Implement rate limiting middleware in Next.js API routes (e.g., `upstash/ratelimit` with Redis, or in-memory for simple cases). Apply to messages, invites, file uploads.

---

## 9. Performance & Infrastructure — Gaps

### 9.1 No CDN for Attachments (P2)
**Current state**: Supabase Storage serves files from a single origin. No CDN.
**Fix**: Configure Supabase Storage with Cloudflare CDN or use a separate CDN for attachment delivery.

### 9.2 No Image Optimization (P2)
**Current state**: Images in messages are served at full resolution.
**Fix**: Use Next.js `<Image>` component with automatic resizing, or server-side thumbnail generation via Supabase Edge Functions + sharp.

### 9.3 No Message Queue / Delivery Guarantees (P2)
**Current state**: Supabase Realtime uses PostgreSQL logical replication. If the WebSocket drops, messages in flight are lost until reconnect.
**Fix**: Implement missed-message catch-up: on reconnect, fetch messages since last known ID. Show reconnecting state in UI.

### 9.4 Signal Server Has No Horizontal Scaling (P2)
**Current state**: Socket.io signal server is single-instance. In-memory `RoomManager`.
**Fix**: Add Redis adapter for Socket.io (`@socket.io/redis-adapter`). This allows multiple signal server instances.

### 9.5 No Health / Status Page (P3)
**Fix**: Public status page showing system health. Integrate with Coolify health checks.

---

## 10. Mobile / Desktop Apps — Gaps

### 10.1 No Mobile App (P1)
**Current state**: Web-only. No responsive mobile layout (unclear from code exploration).
**Fix**: React Native app using Expo. Or ensure the Next.js app is fully responsive with a mobile-optimized layout (collapsible sidebars, touch-friendly controls).

### 10.2 No Desktop App (P2)
**Current state**: No Electron or Tauri wrapper.
**Fix**: Tauri (Rust-based, lightweight) or Electron wrapper of the existing web app. Provides: native notifications, system tray, hardware acceleration, PTT global shortcuts.

### 10.3 No Progressive Web App (PWA) (P2)
**Current state**: No service worker, no web manifest, no offline support.
**Fix**: Add `next-pwa` or manual service worker. Web app manifest for "Add to Home Screen." Cache static assets.

---

## 11. Accessibility — Gaps

### 11.1 No Screen Reader Support (P2)
**Fix**: Audit all interactive components for ARIA roles and labels. Keyboard navigation through message list and channel list.

### 11.2 No Reduced Motion Support (P3)
**Fix**: Respect `prefers-reduced-motion`. Disable animations in Tailwind when set.

---

## 12. Internationalization — Gaps

### 12.1 No i18n (P3)
**Fix**: `next-intl` or `react-i18next`. Externalize all UI strings. Start with English + at least one other language.

---

## Summary Table

| Feature | Priority | Effort | Status |
|---|---|---|---|
| TURN server for WebRTC | P0 | Low | Missing |
| Slowmode enforcement | P1 | Low | Missing |
| Typing indicators | P1 | Low | Missing |
| Reactions real-time sub | P1 | Low | Likely broken |
| Presence auto-sync (online/offline) | P1 | Low | Missing |
| Message markdown rendering | P1 | Medium | Missing |
| Unread state / read tracking | P1 | Medium | Missing |
| Mention system (@user/@role) | P1 | Medium | Missing |
| Kick/Ban UI | P1 | Medium | Missing |
| Two-factor authentication | P1 | Medium | Missing |
| Rate limiting | P1 | Medium | Missing |
| Video calls (camera) in voice | P1 | Medium | Missing |
| Infinite scroll / load more | P1 | Medium | Unclear |
| Push notifications | P1 | High | Missing |
| User blocking | P1 | Low | Missing |
| Friend system | P1 | High | Missing |
| Group DMs | P1 | High | Missing |
| DM voice/video calls | P1 | High | Missing |
| SFU for large voice rooms | P1 | High | Missing |
| Multiple invite links | P2 | Low | Missing |
| Message pinning | P2 | Low | Missing |
| Rich link embeds | P2 | Medium | Missing |
| Context menus (right-click) | P2 | Medium | Missing |
| Profile hover cards | P2 | Medium | Missing |
| Notification settings | P2 | Medium | Missing |
| Audit logs | P2 | Medium | Missing |
| Input/output device selection | P2 | Medium | Missing |
| Push-to-talk (PTT) | P2 | Medium | Missing |
| Message search | P2 | Medium | Missing |
| Custom server emoji | P2 | Medium | Missing |
| In-app notification inbox | P2 | Medium | Missing |
| Threads | P2 | High | Missing |
| Webhooks | P2 | High | Missing |
| Image optimization / thumbnails | P2 | Medium | Missing |
| Active sessions management | P2 | Low | Missing |
| Bulk message delete | P2 | Low | Missing |
| Jump to message | P2 | Medium | Missing |
| Keyboard shortcuts | P2 | Medium | Missing |
| PWA support | P2 | Medium | Missing |
| Signal server Redis scaling | P2 | Medium | Missing |
| Audio quality / bitrate controls | P2 | Medium | Missing |
| Verification levels | P2 | Medium | Missing |
| Scheduled events | P3 | High | Missing |
| Server discovery | P3 | High | Missing |
| GIF picker | P3 | Low | Missing |
| Stickers | P3 | Medium | Missing |
| Server templates | P3 | Medium | Missing |
| i18n / localization | P3 | High | Missing |
| Desktop app (Tauri/Electron) | P2 | High | Missing |
| Mobile app (React Native/Expo) | P1 | High | Missing |
| Reduced motion accessibility | P3 | Low | Missing |
| Screen reader / ARIA | P2 | Medium | Missing |

---

## Voice Quality Deep Dive

Discord uses a custom Opus implementation over WebRTC with:
- Echo cancellation (hardware + software)
- Noise suppression via Krisp (licensed)
- Automatic gain control
- Forward error correction (FEC)
- Packet loss concealment (PLC)
- 64kbps stereo Opus for Nitro users, 32kbps for standard

VortexChat currently:
- Uses browser-native echo cancellation (OK)
- Uses browser-native noise suppression (inferior to Krisp)
- No explicit Opus bitrate setting (defaults to ~32kbps mono)
- No FEC configuration
- No VAD-based comfort noise generation

**Recommendation**: Use `RTCRtpSender.setParameters()` to explicitly set Opus codec parameters. Explore RNNoise (open source, WASM-based noise suppression) as a Krisp alternative.

---

## Recommended Implementation Order

### Phase 1 — Make It Usable
1. TURN server (coturn) — unblocks users behind strict NAT
2. Typing indicators — ephemeral Supabase Broadcast
3. Unread state / read tracking — schema + UI
4. Mention system — parsing + notification counts
5. Message markdown rendering — react-markdown + code highlighting
6. Rate limiting — protect all write APIs
7. Presence auto-sync — Supabase Realtime Presence heartbeat
8. Kick/Ban UI — right-click → kick/ban modal
9. Slowmode enforcement — server-side check in messages API

### Phase 2 — Core Parity
10. Video calls in voice channels
11. Friend system + user blocking
12. Group DMs
13. DM voice/video calls
14. Push notifications (Web Push + service worker)
15. Message search (Postgres FTS)
16. Multiple invite links
17. Audit logs
18. Message pinning

### Phase 3 — Quality & Scale
19. SFU (mediasoup/Livekit) for large voice rooms
20. Threads
21. Webhooks
22. Custom server emoji
23. Notification settings (per-channel / per-server)
24. PWA support
25. Signal server Redis adapter (horizontal scaling)
26. Image optimization / CDN
27. 2FA setup UI

### Phase 4 — Platform Completeness
28. Mobile-responsive layout or React Native app
29. Desktop app (Tauri)
30. Scheduled events
31. Server discovery
32. i18n
33. Accessibility audit

---

## Conclusion

VortexChat is approximately **40–50% of the way** to a viable Discord replacement for small-to-medium communities. The core text/voice/permission architecture is sound and production-ready. The biggest gaps that will be immediately noticeable to users are: no TURN server (voice failures behind NAT), no unread tracking, no typing indicators, no mention system, no friend/block system, and the voice architecture not scaling past ~8 participants. Addressing Phase 1 would produce a credible daily-driver for communities under 50 concurrent users.
