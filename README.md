# VortexChat

A full-featured real-time chat platform built with Next.js 15, Supabase, and WebRTC/LiveKit.

[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/TheShield2594/vortexchat?utm_source=oss&utm_medium=github&utm_campaign=TheShield2594%2Fvortexchat&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

---

## Features

### Messaging
- **Auth** — Email/password + magic link via Supabase Auth
- **Real-time Messaging** — Supabase Realtime (Postgres CDC), no polling
- **Reactions** — Emoji reactions, live-synced
- **Replies & Threads** — Reply to messages, edit, soft-delete; full threaded conversations
- **File Uploads** — Images and files via Supabase Storage
- **Search** — Full-text message search

### Servers & Channels
- **Servers** — Create/join servers with invite codes, icon uploads
- **Server Discovery** — Public server directory
- **Server Templates** — Import/export reusable server configurations
- **Channels** — Text channels, voice channels, category grouping
- **Roles** — Full bitmask permission system (Discord-style), free colors
- **Webhooks** — Incoming webhook support per channel

### Voice & Video
- **Voice Chat** — Dual-mode: P2P WebRTC (self-hosted signal server) or LiveKit SFU (set `NEXT_PUBLIC_LIVEKIT_URL`)
- **Voice Activity Detection** — Speaking indicators via hark.js
- **Screen Share** — getDisplayMedia, streamed over WebRTC/LiveKit
- **DM Calls** — Voice calls in direct messages
- **Voice Intelligence** — AI-powered transcripts and summaries

### Social
- **Direct Messages** — 1:1 DMs with real-time updates
- **Friends** — Friend requests, suggestions, status
- **Profiles** — Display name, bio, status, custom tag, banner color
- **Member List** — Online/offline presence via Supabase Realtime Presence

### Platform
- **Push Notifications** — Web Push via VAPID
- **PWA** — Installable progressive web app
- **Moderation** — Reports, appeals, moderation timeline, member timeouts
- **Admin Panel** — Activity timeline, permission simulator
- **Roles & Permissions** — 20-bit Discord-style bitmask, no paywall
- **Rate Limiting** — Upstash Redis-backed rate limiting on API routes
- **Error Monitoring** — Sentry integration
- **Offline / Outbox** — Message consistency with reconnect replay (see [docs/message-consistency-model.md](./docs/message-consistency-model.md))

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| Database | Supabase Cloud (PostgreSQL + Realtime + Storage) |
| Auth | Supabase Auth |
| Voice signaling | Node.js + Socket.IO (+ Redis adapter for clustering) |
| Voice transport | WebRTC (RTCPeerConnection) or LiveKit SFU |
| State management | Zustand |
| Rate limiting | Upstash Redis |
| Monitoring | Sentry |
| Deployment | Vercel (web) · Railway (signal) · Supabase Cloud (DB) |

---

## Quick Start (Local Dev)

### 1. Start Supabase locally
```bash
npx supabase start
# Apply migrations
npx supabase db push
```

### 2. Configure environment
```bash
cp apps/web/.env.local.example apps/web/.env.local
cp apps/signal/.env.example apps/signal/.env
# Edit both files with your Supabase keys (from `npx supabase status`)
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run dev servers
```bash
# Terminal 1 — Next.js web app
cd apps/web && npm run dev

# Terminal 2 — WebRTC signaling server
cd apps/signal && npm run dev
```

Open http://localhost:3000

> **LiveKit (optional):** Set `NEXT_PUBLIC_LIVEKIT_URL` in `apps/web/.env.local` to switch voice from P2P WebRTC to a LiveKit SFU. If unset, the self-hosted signal server is used.

---

## Project Structure

```
vortexchat/
├── apps/
│   ├── web/                  # Next.js 15 frontend + API routes
│   │   ├── app/
│   │   │   ├── (auth)/       # login, register
│   │   │   ├── channels/     # main app
│   │   │   ├── discover/     # server discovery
│   │   │   ├── appeals/      # moderation appeals
│   │   │   └── settings/     # user settings
│   │   ├── components/
│   │   │   ├── chat/         # MessageItem, ChatArea, MessageInput
│   │   │   ├── voice/        # VoiceChannel, voice intelligence
│   │   │   ├── dm/           # DM area, DM calls
│   │   │   ├── roles/        # RoleManager
│   │   │   ├── moderation/   # Moderation timeline
│   │   │   ├── admin/        # Admin panel, permission simulator
│   │   │   ├── notifications/# Notification bell
│   │   │   ├── layout/       # ServerSidebar, ChannelSidebar, MemberList
│   │   │   └── modals/       # Create server/channel, profile, settings
│   │   ├── lib/
│   │   │   ├── supabase/     # client, server, proxy helpers
│   │   │   ├── webrtc/       # useVoice, useLivekitVoice, useUnifiedVoice hooks
│   │   │   ├── voice/        # Audio settings, voice intelligence
│   │   │   └── stores/       # Zustand app store
│   │   └── vercel.json       # Vercel build config
│   └── signal/               # Node.js WebRTC signaling server
│       └── src/
│           ├── index.ts      # Socket.IO server
│           ├── rooms.ts      # Room state management
│           ├── redis-rooms.ts# Redis-backed room state (clustering)
│           └── voice-state-sync.ts
├── packages/
│   └── shared/               # Shared types + permission bitmasks
├── supabase/
│   └── migrations/           # SQL migrations + RLS policies
├── docker-compose.yml        # Local dev only
└── deploy/                   # Deployment guide (Vercel + Railway + Supabase Cloud)
```

---

## Deployment

See [deploy/README.md](./deploy/README.md) for full deployment instructions.

**Summary:**
- **Web app** → [Vercel](https://vercel.com) — connect repo, set root directory to `apps/web`
- **Signal server** → [Railway](https://railway.app) — deploys from `apps/signal/Dockerfile`
- **Database / Auth / Storage** → [Supabase Cloud](https://supabase.com)

---

## Permissions Bitmask

Permissions are defined in `packages/shared/src/index.ts` and imported via `@vortex/shared`. Never hardcode permission bits.

```
VIEW_CHANNELS              = 1 << 0   // 1
SEND_MESSAGES              = 1 << 1   // 2
MANAGE_MESSAGES            = 1 << 2   // 4
KICK_MEMBERS               = 1 << 3   // 8
BAN_MEMBERS                = 1 << 4   // 16
MANAGE_ROLES               = 1 << 5   // 32
MANAGE_CHANNELS            = 1 << 6   // 64
ADMINISTRATOR              = 1 << 7   // 128
CONNECT_VOICE              = 1 << 8   // 256
SPEAK                      = 1 << 9   // 512
MUTE_MEMBERS               = 1 << 10  // 1024
STREAM                     = 1 << 11  // 2048
MANAGE_WEBHOOKS            = 1 << 12  // 4096
MANAGE_EVENTS              = 1 << 13  // 8192
MODERATE_MEMBERS           = 1 << 14  // 16384  (timeout users)
CREATE_PUBLIC_THREADS      = 1 << 15  // 32768
CREATE_PRIVATE_THREADS     = 1 << 16  // 65536
SEND_MESSAGES_IN_THREADS   = 1 << 17  // 131072
USE_APPLICATION_COMMANDS   = 1 << 18  // 262144
MENTION_EVERYONE           = 1 << 19  // 524288
```

`ADMINISTRATOR` overrides all other permissions. All features are free — no paywall.

---

## Server Templates

VortexChat supports reusable **server templates** for import/export:

- Template schema includes `metadata`, `roles`, `categories`, `channels`, and channel-level permission overrides.
- Metadata supports `source`, `version`, and `created_by`.
- Built-in starter templates available in the UI: **Gaming**, **Study**, **Startup**, and **Creator**.
- Import flow validates JSON, shows a diff preview, and applies transactionally (via `create_server_from_template` / `apply_server_template`).
- Unsupported permission names/fields are normalized or ignored with warnings so imports degrade gracefully.
- Export flow serializes the current server into a reusable template JSON document.

API entrypoint: `POST /api/server-templates` — modes: `validate`, `preview`, `apply`, `create-server`, `export`.

---

## Messaging Consistency

Offline/outbox semantics, reconnect replay rules, and conflict handling are documented in [`docs/message-consistency-model.md`](./docs/message-consistency-model.md).

---

## License

MIT
