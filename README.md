# Vortex — Discord Clone

A full-featured Discord clone built with Next.js 14, Supabase, and WebRTC.

## Features

- **Auth** — Email/password + magic link via Supabase Auth
- **Servers** — Create/join servers with invite codes, icon uploads
- **Channels** — Text channels, voice channels, category grouping
- **Real-time Messaging** — Supabase Realtime (Postgres CDC), no polling
- **Reactions** — Emoji reactions, live-synced
- **Replies & Threads** — Reply to messages, edit, soft-delete
- **File Uploads** — Images and files via Supabase Storage
- **Voice Chat** — WebRTC P2P via native RTCPeerConnection
- **Voice Activity Detection** — Speaking indicators via hark.js
- **Screen Share** — getDisplayMedia, streamed over WebRTC
- **Roles** — Full bitmask permission system (Discord-style), free colors
- **Profiles** — Display name, bio, status, custom tag, banner color
- **Direct Messages** — 1:1 DMs with real-time updates
- **Member List** — Online/offline presence via Supabase Realtime Presence

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| Database | Supabase Cloud (PostgreSQL + Realtime + Storage) |
| Auth | Supabase Auth |
| Voice signaling | Node.js + socket.io |
| Voice transport | WebRTC (RTCPeerConnection) |
| State management | Zustand |
| Deployment | Vercel (web) · Railway (signal) · Supabase Cloud (DB) |

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

## Project Structure

```
vortex/
├── apps/
│   ├── web/                  # Next.js 14 frontend
│   │   ├── app/
│   │   │   ├── (auth)/       # login, register
│   │   │   └── channels/     # main app
│   │   ├── components/
│   │   │   ├── chat/         # MessageItem, ChatArea, MessageInput
│   │   │   ├── voice/        # VoiceChannel, ParticipantTile
│   │   │   ├── roles/        # RoleManager
│   │   │   ├── layout/       # ServerSidebar, ChannelSidebar, MemberList
│   │   │   └── modals/       # Create server/channel, profile, settings
│   │   ├── lib/
│   │   │   ├── supabase/     # client, server, middleware helpers
│   │   │   ├── webrtc/       # useVoice hook
│   │   │   └── stores/       # Zustand app store
│   │   └── vercel.json       # Vercel build config
│   └── signal/               # Node.js WebRTC signaling server
│       └── src/
│           ├── index.ts      # socket.io server
│           └── rooms.ts      # room state management
├── packages/
│   └── shared/               # Shared types + permission bitmasks
├── supabase/
│   └── migrations/           # SQL migrations + RLS policies
├── docker-compose.yml        # Local dev only
└── deploy/                   # Deployment guide (Vercel + Railway + Supabase Cloud)
```

## Deployment

See [deploy/README.md](./deploy/README.md) for full deployment instructions.

**Summary:**
- **Web app** → [Vercel](https://vercel.com) — connect repo, set root directory to `apps/web`
- **Signal server** → [Railway](https://railway.app) — deploys from `apps/signal/Dockerfile`
- **Database / Auth / Storage** → [Supabase Cloud](https://supabase.com)

## Permissions Bitmask

```
VIEW_CHANNELS     = 1 << 0   // 1
SEND_MESSAGES     = 1 << 1   // 2
MANAGE_MESSAGES   = 1 << 2   // 4
KICK_MEMBERS      = 1 << 3   // 8
BAN_MEMBERS       = 1 << 4   // 16
MANAGE_ROLES      = 1 << 5   // 32
MANAGE_CHANNELS   = 1 << 6   // 64
ADMINISTRATOR     = 1 << 7   // 128
CONNECT_VOICE     = 1 << 8   // 256
SPEAK             = 1 << 9   // 512
MUTE_MEMBERS      = 1 << 10  // 1024
STREAM            = 1 << 11  // 2048
```

Administrator overrides all other permissions. No paywall — all features free.


## Server Templates

Vortex supports reusable **server templates** for import/export:

- Template schema includes `metadata`, `roles`, `categories`, `channels`, and channel-level permission overrides.
- Metadata supports `source`, `version`, and `created_by`.
- Built-in starter templates are available in the UI: **Gaming**, **Study**, **Startup**, and **Creator**.
- Import flow validates JSON, shows a diff preview, and applies transactionally (via `create_server_from_template`/`apply_server_template`).
- Unsupported permission names/fields are normalized or ignored with warnings so imports degrade gracefully.
- Export flow serializes the current server into a reusable template JSON document.

API entrypoint: `POST /api/server-templates` with modes:
`validate`, `preview`, `apply`, `create-server`, and `export`.

## Messaging consistency

Offline/outbox semantics, reconnect replay rules, and conflict handling are documented in [`docs/message-consistency-model.md`](./docs/message-consistency-model.md).

## License

MIT
