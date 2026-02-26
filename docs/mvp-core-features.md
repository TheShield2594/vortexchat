# VortexChat MVP & Core Features Definition

## Scope

This document defines what constitutes the minimum viable product for VortexChat — the feature set required for a user group to replace Discord for daily use.

Status last audited: 2026-02-26

---

## Tier 1: Core MVP (must-work)

These features must be stable and complete before inviting real users.

### 1. Authentication — ~100%

| Feature | Status | Notes |
|---|---|---|
| Register / login (email + password) | Done | 12-char min password, magic link fallback |
| Passkey (WebAuthn) | Done | Full registration/login with replay detection, credential management |
| TOTP 2FA | Done | Supabase MFA, QR enrollment, 6-digit verify |
| Session list + bulk revocation | Done | Per-session and bulk revoke, device fingerprinting (user-agent, IP) |
| Per-session revocation | Done | DELETE `/api/auth/sessions/[sessionId]` |
| Protected routes (middleware) | Done | Redirects unauthenticated users, preserves destination |
| Security policy controls | Done | Passkey-first, enforce-passkey, fallback toggles |
| Trusted devices | Done | 30-day cookie after passkey login |
| Recovery/backup codes | Done | 10 single-use XXXX-XXXX codes, scrypt-hashed, generated on TOTP enrollment, redeemable at login |
| MFA challenge during login | Done | Password login → TOTP challenge → session; passkey logins bypass (implicit MFA) |
| Brute-force protection | Done | 5 failed attempts in 15min → lockout; generic error messages prevent email enumeration |
| In-app password change | Done | PATCH `/api/auth/password`, 12-char minimum, optional session revocation |

No remaining gaps — authentication is fully implemented.

### 2. Servers & Channels — ~100%

| Feature | Status | Notes |
|---|---|---|
| Create server | Done | Name + optional icon upload, auto-generates invite code + default role + general channel |
| Join / leave server | Done | Via invite code or server discovery |
| Delete server | Done | Cascades to channels, messages, members |
| Invite links (expiry, max-use, revocation) | Done | Full API with lifecycle; full invite management UI with create/revoke |
| Channel creation (all 7 types) | Done | text, voice, category, forum, stage, announcement, media |
| Category nesting (parent_id) | Done | Channels nested under categories with collapse/expand |
| Channel reordering (drag-drop) | Done | dnd-kit, persists position + parent_id atomically |
| Channel deletion | Done | Cascade delete with auto-navigation |
| Temporary channels | Done | Expiry presets (1h to 1w) |
| Channel editing | Done | PATCH API with MANAGE_CHANNELS permission; edit name, topic, NSFW, slowmode via modal |
| Server settings (name + icon) | Done | PATCH API with owner/ADMINISTRATOR check; icon upload to Supabase Storage with old icon cleanup |
| Invite management UI | Done | Full invites table (code, creator, expiry, usage count, revoke); create dialog with custom expiry/max-uses |
| Forum channel guidelines | Done | Editable guidelines textarea in EditChannelModal for forum channels; 2000-char max |

No remaining gaps — servers and channels are fully implemented.

### 3. Real-Time Text Messaging — ~100%

| Feature | Status | Notes |
|---|---|---|
| Send messages | Done | Rate limiting (5/10s), clientNonce idempotency, AutoMod evaluation |
| Edit messages | Done | Server: PATCH API with author OR MANAGE_MESSAGES permission check; DM: dedicated API |
| Soft-delete messages | Done | `deleted_at` timestamp, filtered from display |
| Replies with preview | Done | Author + snippet, jump-to-parent |
| @user mentions | Done | Autocomplete, Tab/Enter accept, Esc dismiss, block-aware filtering |
| @everyone | Done | MENTION_EVERYONE permission gated (403 on violation) |
| Markdown rendering | Done | Bold, italic, underline, strikethrough, code, code blocks, quotes, spoilers, server emoji |
| Typing indicators | Done | Supabase Realtime broadcast, 3s timeout, multi-user display |
| File attachments | Done | Drag-drop, clipboard paste, file browser; 25MB limit, extension blocklist |
| Signed URL uploads | Done | 7-day expiry per attachment |
| Supabase Realtime delivery | Done | postgres_changes for INSERT/UPDATE, full message hydration |
| Offline outbox | Done | localStorage queue, retry, deterministic replay ordering, draft persistence |
| Message permalinks | Done | `?message={id}` routing, highlight + fade, "back to where you were" |
| Reactions | Done | POST/DELETE API, realtime sync, block-state enforcement |
| Threads | Done | Creation, messages, auto-archive, lock, owner controls, member tracking |
| Pinned messages | Done | Permission-enforced (MANAGE_MESSAGES), audit logged |
| Search | Done | FTS with `from:`, `has:`, `before:` filters, permission-aware |
| Polls | Done | `[POLL]` format with numbered emoji reactions |
| Link embeds | Done | OEmbed + Giphy support |
| Image lightbox / media viewer | Done | Zoom (click/scroll/keyboard), pan, arrow key navigation between images |

No remaining gaps — real-time messaging is fully implemented.

### 4. Roles & Permissions — ~100%

| Feature | Status | Notes |
|---|---|---|
| Bitmask permission model (20-bit) | Done | Well-tested with power-of-two invariants, ADMINISTRATOR bypass |
| Role CRUD | Done | Create, update (PATCH), delete (DELETE) via permission-checked API endpoints |
| Role hierarchy (position-based) | Done | Enforced on assign, edit, delete, and reorder — non-admins cannot act on roles at/above their own |
| Role reorder | Done | PATCH `/api/servers/[serverId]/roles/reorder` with hierarchy enforcement, audit logged |
| Channel permission overrides | Done | Deny-first precedence: `(base & ~deny) | allow`; UI with mutual-exclusive toggles |
| Role assignment to members | Done | POST/DELETE with hierarchy check + audit logging |
| Role color display | Done | Highest non-default colored role shown in member list and chat |
| Permission enforcement in routes | Done | Multi-layered (API checks + RLS policies) across message, role, moderation routes |
| Permission bit mismatch bug | Fixed | Timeout route now imports from `@vortex/shared` (was hardcoded wrong bit) |

No remaining gaps — roles and permissions are fully implemented.

### 5. Voice Chat — ~100%

| Feature | Status | Notes |
|---|---|---|
| Signal server (Socket.IO) | Done | Room management, auth verification, Supabase voice_states sync |
| WebRTC peer connections | Done | SDP negotiation, STUN/TURN configurable via env vars |
| Mute / deafen | Done | State + broadcast events to all peers |
| Speaking detection (hark.js VAD) | Done | -65dB threshold, 100ms interval |
| Screen share + spotlight UI | Done | getDisplayMedia, full-screen spotlight with grid fallback |
| Camera video | Done | 1280x720, facingMode user, avatar fallback; works in voice channels and DM calls |
| Device selection (input/output) | Done | Enumerate, hot-swap detection; input change requires rejoin |
| Audio processing pipeline | Done | 6-band EQ, compressor, noise gate, 4 presets, CPU auto-bypass |
| Push-to-talk | Done | Configurable key (default Space), ignores text inputs, UI toggle |
| Heartbeat + stale peer GC | Done | 5s heartbeat, 45s timeout with connection-state awareness |
| Per-user volume/pan controls | Done | Individual volume and spatial audio panning |
| Auto-reconnect | Done | Exponential backoff (1s→30s, 5 attempts), preserves mute/deafen, navigator.onLine listener |
| ICE restart | Done | restartIce() up to 2x per peer, falls back to full re-negotiation on failure |
| RTC stats monitoring | Done | getStats() polled every 5s, extracts RTT, packet loss, jitter, bitrate |
| Network quality indicator | Done | 3-tier bars (green/yellow/red) with tooltip showing RTT, loss, jitter, bitrate |
| Bitrate adaptation | Done | 64kbps (good) / 32kbps (degraded) / 16kbps (poor); adapts on tier transition via setParameters() |

No remaining gaps — voice chat is fully implemented.

### 6. Direct Messages — ~100%

| Feature | Status | Notes |
|---|---|---|
| 1:1 DM creation | Done | Deduplication for existing channels |
| Group DM creation | Done | Auto-detect 3+ members, owner model |
| DM channel list + unread status | Done | Latest message preview, realtime updates |
| DM send | Done | Plain text + E2EE envelope support, push notifications |
| DM edit | Done | PATCH endpoint, sender-only, sets `edited_at` |
| DM delete | Done | Soft-delete, sender-only, clears content |
| DM voice + video calls | Done | WebRTC via Supabase Realtime broadcast, invite/accept/decline |
| Group DM member management | Done | Owner add/remove, self-leave |
| E2EE support | Done | ECDH key exchange, AES-GCM encryption, key rotation on membership change |
| DM typing indicators | Done | Uses same `useTyping` hook as server channels; was already implemented |
| DM image lightbox | Done | Portal-based lightbox with zoom/pan for DM inline images |
| DM threaded replies | Done | `reply_to_id` column on `direct_messages`, reply button, preview bar, inline snippet |

No remaining gaps — direct messages are fully implemented.

### 7. Presence — ~100%

| Feature | Status | Notes |
|---|---|---|
| Online/offline via Realtime Presence | Done | `presence:global` Supabase channel |
| Member list with presence indicators | Done | Colored dots (green/yellow/red/gray), speaking indicator |
| Status toggle UI | Done | UserPanel dropdown: Online, Idle, DND, Invisible |
| Idle detection | Done | 5-minute inactivity timer, auto-transitions online -> idle |
| Custom status (message + emoji) | Done | PATCH `/api/users/profile`, status_expires_at support |
| Window visibility tracking | Done | Hidden -> offline, visible -> resumes previous status |

No remaining gaps — presence is fully implemented.

### 8. Basic Moderation — ~100%

| Feature | Status | Notes |
|---|---|---|
| Kick | Done | KICK_MEMBERS permission, role hierarchy check, voice cleanup, audit log |
| Ban + unban | Done | BAN_MEMBERS permission, removes member + voice states, upsert-safe |
| Timeout (up to 28 days) | Done | MODERATE_MEMBERS permission, audit log |
| Audit log | Done | Comprehensive actions, actor/target details, filtering, cursor pagination, owner-only |
| AutoMod engine | Done | 5 rule types, safe regex (length/timeout/quantifier limits), dry-run, priority, analytics |
| Membership screening | Done | Verification levels 0-4, explicit content filter 0-2, acceptance tracking |
| Moderation appeals | Done | Anti-abuse scoring, decision templates, internal notes, status workflow |
| User/message reporting | Done | POST/GET/PATCH `/api/reports`; context menu on messages + members; moderator queue in server settings; audit logged |

No remaining gaps — basic moderation is fully implemented.

---

## Tier 1 Summary

| Area | Completeness | Ship-Ready? |
|---|---|---|
| Authentication | ~100% | Yes |
| Servers & Channels | ~100% | Yes |
| Real-Time Messaging | ~100% | Yes |
| Roles & Permissions | ~100% | Yes |
| Voice Chat | ~100% | Yes |
| Direct Messages | ~100% | Yes |
| Presence | ~100% | Yes |
| Basic Moderation | ~100% | Yes |

**No primary blockers remaining.** All Tier 1 areas are ship-ready.

---

## Tier 2: Near-MVP (expected by users switching from Discord)

These features aren't strictly launch-blocking but their absence will be immediately noticed. Target completion during or shortly after the Tier 1 hardening sprint.

### 1. Reactions — Done (moved from gap)
- Reaction CRUD API endpoints now exist with realtime sync and block-state enforcement
- Previously flagged as critical missing item in parity evaluation; since resolved

### 2. Block Enforcement — Mostly Done
- `isBlockedBetweenUsers()` enforced in DM message send, reactions API, and friend request handler
- `filterMentionsByBlockState()` filters mentions in server message send
- **Gap:** Block not checked in search results or server channel message send (sender can still post in shared channels, matching Discord behavior)

### 3. Notifications — Done
- Push notifications via service worker with click-through routing
- Per-channel and per-server notification settings (all / mentions-only / muted)
- Unread counts in sidebar and notification bell
- Tab title unread badge (`(N) VortexChat`) via `useTabUnreadTitle` hook (polls every 30s + on focus)

### 4. Search — Done (moved from gap)
- FTS with filter syntax (`from:`, `has:`, `before:`), permission-aware, server/channel scoping
- Previously listed as partial; now complete with filter support

### 5. Attachment Security — Mostly Done
- Client-side validation exists (25MB limit, extension blocklist, MIME prefix checks)
- Server-side MIME type validation via magic bytes detection (rejects executables masquerading as other files, detects extension/content mismatches)
- Upload progress indicator with cancel support and cleanup of partially uploaded files
- **Gap:** No AV scanning on attachments (requires external service integration — TODO in code)

### 6. Presence UI — Done (moved from gap)
- Status toggle, idle detection, custom status with emoji + expiry all implemented
- Previously flagged as missing; since resolved

### 7. Voice Reconnection — Done
- Auto-reconnect state machine with exponential backoff (1s→30s, 5 attempts)
- ICE restart mechanism (restartIce() before full re-negotiation)
- Network quality indicator (3-tier green/yellow/red bars with detailed tooltip)
- Mute/deafen state preserved across reconnections
- Manual rejoin button after max retries exhausted

### 8. Friend System Completeness
- Friend request lifecycle (send, accept, decline, block, unblock) working
- Friends list with tabs (Online, All, Pending, Blocked) working
- **Gap:** Block state not enforced across all interaction paths (see Block Enforcement above)

---

## Tier 3: Post-MVP Differentiators

Features that go beyond Discord parity. Not required for launch but planned.

- End-to-end encrypted DMs (ECDH + AES-GCM, documented in `dm-e2ee-threat-model.md`)
- Voice intelligence: live transcription, translation, post-call summaries (documented in `voice-intelligence-workflow-plan.md`)
- Cross-platform desktop (Electron) and mobile (React Native/Expo) apps (documented in `cross-platform-desktop-mobile-plan.md`)
- App platform and marketplace with slash commands, event subscriptions, webhooks (documented in `app-security-model.md`)
- Next-gen UI redesign with layered depth system and spatial interactions (documented in `vortexchat-next-gen-ui-redesign-2026.md`)
- Message list virtualization (@tanstack/react-virtual)
- Per-thread notification overrides and notification hierarchy engine
- Sticker system
- Forum and stage channel UX depth
- OAuth / social login providers
- Cross-device draft sync
- Server health dashboard and community analytics

---

## Hardening Sprint (updated priorities)

Based on the codebase audit (2026-02-25), the hardening sprint should focus on:

1. ~~**Server & Channel editing**~~ — Done. PATCH endpoints + UI for channel name/topic/settings, server icon update, and full invite management UI.
2. ~~**Voice auto-reconnect**~~ — Done. State machine with exponential backoff, ICE restart, network quality indicator.
3. ~~**Auth recovery codes**~~ — Done. Backup codes, MFA challenge during login, brute-force protection, password change.
4. ~~**Server-side attachment validation**~~ — Done. Magic bytes MIME detection, upload progress with cancel.
5. ~~**DM threaded replies**~~ — Done. Schema migration + full reply UI in DMs.
6. ~~**Role CRUD APIs**~~ — Done. PATCH/DELETE endpoints with hierarchy enforcement + reorder API.
7. ~~**Forum channel guidelines**~~ — Done. Editable guidelines field for forum channels.
8. ~~**Voice bitrate adaptation**~~ — Done. Dynamic bitrate based on network quality tiers.

Items resolved since original parity evaluation:
- ~~Permission bit mismatch~~ — Fixed (imports from shared package)
- ~~Reaction CRUD API~~ — Built
- ~~Presence UI / idle detection~~ — Complete
- ~~Search filter syntax~~ — Implemented
- ~~DM edit/delete~~ — Working
- ~~Block enforcement~~ — Enforced in DM send, reactions, mentions, friend requests
- ~~Tab title unread badge~~ — `useTabUnreadTitle` hook wired into app provider
- ~~Notifications~~ — Push + per-channel settings + unread counts all working
- ~~Server & Channel editing~~ — PATCH APIs + EditChannelModal + ServerSettingsModal icon upload + invite management UI
- ~~Voice auto-reconnect~~ — Exponential backoff, ICE restart, network quality indicator
- ~~Auth recovery codes~~ — 10 single-use codes with scrypt hashing + redemption flow
- ~~MFA login challenge~~ — TOTP challenge after password auth, passkey bypass
- ~~Brute-force protection~~ — 5-attempt lockout, generic errors, attempt tracking
- ~~In-app password change~~ — PATCH `/api/auth/password` with session revocation
- ~~Server-side attachment validation~~ — Magic bytes MIME sniffing, executable rejection
- ~~Upload progress indicator~~ — Byte-level progress tracking with cancel + cleanup
- ~~User/message reporting~~ — Report API, context menu integration, moderator queue
- ~~Server channel message edit API~~ — PATCH with MANAGE_MESSAGES permission check
- ~~Image lightbox~~ — Zoom, pan, keyboard navigation in server and DM messages
- ~~DM typing indicators~~ — Was already implemented (doc corrected)
- ~~Role update/delete APIs~~ — PATCH/DELETE with hierarchy enforcement + audit logging
- ~~Role reorder API~~ — Position-based reorder with hierarchy enforcement
- ~~Forum channel guidelines~~ — Editable guidelines textarea for forum channels
- ~~DM threaded replies~~ — `reply_to_id` column + reply UI matching server channel pattern
- ~~Voice bitrate adaptation~~ — Dynamic 64/32/16 kbps based on network quality tiers

---

## Reference Documents

| Document | Covers |
|---|---|
| `discord-parity-evaluation-2026-02-24.md` | Full parity audit, bug/risk list, acceptance tests |
| `message-consistency-model.md` | Offline outbox, idempotent replay, draft persistence |
| `dm-e2ee-threat-model.md` | E2EE architecture and limitations |
| `voice-intelligence-workflow-plan.md` | Transcription, translation, summaries |
| `cross-platform-desktop-mobile-plan.md` | Desktop and mobile expansion |
| `app-security-model.md` | App platform security posture |
| `vortexchat-next-gen-ui-redesign-2026.md` | UI redesign direction |
| `apps/web/lib/voice/PERFORMANCE_NOTES.md` | Voice audio pipeline details |
