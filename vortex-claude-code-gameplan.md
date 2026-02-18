# Vortex — Claude Code Build Plan
## Self-hosted Discord Clone with Voice, Supabase + Coolify

---

## 1. THE CLAUDE CODE PROMPT

Paste this into Claude Code at the root of your project:

```
Build a full-stack self-hosted Discord clone called "Vortex" using the following stack:

FRONTEND: Next.js 14 (App Router), Tailwind CSS, shadcn/ui
BACKEND: Next.js API routes + a dedicated Node.js WebSocket/WebRTC signaling server
DATABASE: Supabase (self-hosted via Coolify) — PostgreSQL + Realtime + Storage
VOICE: WebRTC via simple-peer or mediasoup, signaled over WebSockets
AUTH: Supabase Auth (email/password + magic link)
DEPLOYMENT: Coolify on a local server or VPS

--- CORE FEATURES TO BUILD ---

1. AUTH
   - Register / login with Supabase Auth
   - Session persistence with cookies
   - Protected routes via middleware

2. SERVERS (Guilds)
   - Create, join, invite to servers
   - Server settings: name, icon (upload to Supabase Storage)
   - Role system: create roles with custom colors (hex), permissions bitmask, display order
   - Assign roles to members — NO paywall, all features free by default

3. CHANNELS
   - Text channels and Voice channels per server
   - Channel categories
   - Per-channel permissions inherited from roles

4. REAL-TIME MESSAGING (Text)
   - Messages stored in Postgres
   - Supabase Realtime (Postgres CDC) for live updates — no polling
   - Message reactions stored in DB, live-synced
   - Mentions, reply threads, message editing, soft-delete
   - File/image attachments via Supabase Storage (signed URLs)

5. VOICE CHANNELS (WebRTC)
   - Separate Node.js signaling server (ws or socket.io)
   - Each voice channel = a "room"
   - Peer-to-peer for small groups (simple-peer), mediasoup SFU for scale
   - Mute/deafen controls per user
   - Voice activity detection (VAD) using hark.js or @ricky0123/vad-web
   - Show who is speaking (highlight in member list)
   - Screen share support (getDisplayMedia)
   - Store voice state (who is in which channel) in Supabase Realtime presence

6. PROFILES (all free, no sub tiers)
   - Display name override per server (nickname)
   - Custom name tag / subtitle
   - Profile bio
   - Profile banner (color gradient picker or image upload)
   - Status: Online / Idle / DND / Invisible
   - Custom status message
   - Avatar upload (Supabase Storage)

7. DIRECT MESSAGES
   - 1:1 DMs using Supabase Realtime
   - DM list in left sidebar

8. MEMBER LIST + PRESENCE
   - Supabase Realtime Presence for online status
   - Show current activity (game/app) if set
   - Role color displayed next to name

--- DATABASE SCHEMA (Postgres / Supabase) ---

Create migrations for these tables:

users (extends auth.users)
  - id, username, display_name, avatar_url, banner_color,
    bio, custom_tag, status, status_message, created_at

servers
  - id, name, icon_url, owner_id, invite_code, created_at

server_members
  - server_id, user_id, nickname, joined_at

roles
  - id, server_id, name, color (hex), position, permissions (bigint bitmask), is_hoisted, mentionable

member_roles
  - member_id, role_id, server_id

channels
  - id, server_id, name, type (text | voice | category), position,
    topic, parent_id (for categories)

messages
  - id, channel_id, author_id, content, edited_at, deleted_at,
    reply_to_id, created_at

attachments
  - id, message_id, url, filename, size, content_type

reactions
  - message_id, user_id, emoji, created_at

direct_messages
  - id, sender_id, receiver_id, content, created_at, read_at

voice_states
  - user_id, channel_id, server_id, muted, deafened, speaking, joined_at

--- FILE STRUCTURE ---

vortex/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/         # login, register
│   │   │   ├── channels/       # main app layout
│   │   │   │   └── [serverId]/
│   │   │   │       └── [channelId]/
│   │   │   └── @modal/         # parallel routes for modals
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   ├── voice/
│   │   │   ├── roles/
│   │   │   └── profile/
│   │   └── lib/
│   │       ├── supabase/
│   │       └── webrtc/
│   └── signal/                 # Node.js WebRTC signaling server
│       ├── index.ts
│       ├── rooms.ts
│       └── peer.ts
├── packages/
│   ├── db/                     # Supabase types + migrations
│   └── shared/                 # shared types
├── supabase/
│   └── migrations/
├── docker-compose.yml          # for local dev
└── coolify/                    # deployment configs

--- VOICE IMPLEMENTATION DETAILS ---

Use this architecture:

SMALL ROOMS (< 8 people): simple-peer (P2P mesh)
  - Each user connects to all others directly
  - Signaling server just brokers offer/answer/ICE

LARGER ROOMS: mediasoup SFU
  - One central server receives/forwards streams
  - More scalable, less CPU on clients

Signaling server (signal/index.ts):
  - socket.io with rooms named by channel ID
  - Events: join-room, offer, answer, ice-candidate, leave-room, toggle-mute, speaking-change
  - On join: send existing peers list to new joiner
  - Track voice_states in Supabase

Frontend voice hook (lib/webrtc/useVoice.ts):
  - getUserMedia for mic
  - getDisplayMedia for screen share
  - simple-peer instance per remote peer
  - hark.js for voice activity detection → emit speaking-change
  - Cleanup on unmount/leave

--- SUPABASE REALTIME USAGE ---

Text channels: Subscribe to messages table filtered by channel_id
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'channel_id=eq.CHANNEL_ID' }, handler)

Presence (online status + voice state):
  channel.track({ user_id, status, voice_channel_id, speaking })

Member list: Subscribe to server_members + member_roles

--- ROLE SYSTEM (no paywall) ---

Permissions as a bitmask (Discord-style):
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

Role colors: free hex input, no restrictions. Display colored name in chat and member list.

--- ENVIRONMENT VARIABLES ---

# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://your-coolify-domain:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SIGNAL_URL=ws://your-coolify-domain:3001

# signal/.env
PORT=3001
SUPABASE_URL=http://your-coolify-domain:8000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

--- WHAT TO BUILD FIRST (order matters) ---

1. Supabase schema + migrations
2. Auth (login/register pages)
3. Server + channel CRUD
4. Text messaging with Realtime
5. Role system + permissions
6. Profile customization
7. Voice channel UI (join/leave, member list)
8. WebRTC signaling server
9. Voice audio (simple-peer first)
10. Voice activity detection + speaking UI
11. Screen share
12. DMs
13. File uploads
14. Polish + mobile responsive

Build iteratively — get text chat solid before touching voice.
Use Supabase Row Level Security (RLS) on every table from day one.
Generate TypeScript types from Supabase schema with: npx supabase gen types typescript
```

---

## 2. TECH STACK BREAKDOWN

### Frontend — Next.js 14
- App Router for layouts (server sidebar, channel sidebar, main area all in one shell)
- Server Components for initial data fetch, Client Components for real-time
- Tailwind + shadcn/ui for fast, clean UI (you can port the HTML prototype's dark theme as CSS vars)
- `zustand` for client state (active server, active channel, voice state)

### Real-time Messaging — Supabase Realtime
Supabase Realtime uses Postgres CDC (Change Data Capture) under the hood — messages get written to Postgres and subscribed clients get pushed the change instantly. You don't need Redis or a separate message broker for this.

| Need | Solution |
|------|----------|
| Messages | Supabase Realtime (postgres_changes) |
| Presence (who's online) | Supabase Realtime Presence |
| Voice state (who's in channel) | Supabase Realtime Presence |
| File uploads | Supabase Storage (S3-compatible) |

### Voice — WebRTC Architecture

```
User A ─── WebSocket ──▶ Signaling Server ◀── WebSocket ─── User B
              (exchange offer/answer/ICE)
User A ◀════════════ P2P Audio Stream ════════════▶ User B
                     (direct, no server)
```

**Phase 1 (P2P, easier to build):** `simple-peer` library
- Works fine up to ~6-8 people in a channel
- No server-side audio processing needed
- Signaling server is simple: just relay WebSocket messages between peers

**Phase 2 (scalable SFU, if you need it):** `mediasoup`
- Server receives all audio, selectively forwards to subscribers
- Needs more CPU/RAM on the server but scales to 50+ in a channel
- Mediasoup has excellent docs and a self-hosted Docker image

For your homelab use case, start with simple-peer — it'll handle your friend group easily.

### Voice Activity Detection
```bash
npm install hark
# or the newer WASM-based one:
npm install @ricky0123/vad-web
```
This detects when someone is speaking from the audio stream and fires events — you use those to highlight the user in the member list (the green glow around avatars you see in Discord).

---

## 3. SELF-HOSTED STACK: SUPABASE + COOLIFY

### Why this combo works great

| Layer | Tool | Why |
|-------|------|-----|
| Deployment platform | Coolify | One-click self-hosted apps, Docker Compose support, reverse proxy (Caddy) built in, free |
| Database | Supabase (self-hosted) | Postgres + Auth + Realtime + Storage in one stack |
| Signaling server | Docker container via Coolify | Deploy your Node.js WS server alongside the app |
| Frontend | Next.js via Coolify | Auto-build from Git, environment variable management |

### Coolify Setup for Vortex

Coolify runs on your existing server and manages everything via Docker. Here's what you'd deploy:

```
Coolify manages:
├── Supabase stack (official docker-compose)
│   ├── supabase-db        (Postgres 15)
│   ├── supabase-realtime  (Elixir WebSocket server)
│   ├── supabase-rest      (PostgREST API)
│   ├── supabase-auth      (GoTrue)
│   ├── supabase-storage   (file storage)
│   └── supabase-studio    (dashboard UI)
├── vortex-web             (Next.js, port 3000)
├── vortex-signal          (Node.js WS, port 3001)
└── Caddy (reverse proxy, automatic SSL if public)
```

### Supabase Self-Host (via Coolify)

Coolify has a one-click Supabase template. After deploying:

1. Access Supabase Studio at `http://your-server:8000` (or your domain)
2. Create your database tables via the Studio UI or run migrations with the Supabase CLI
3. Copy the `anon` and `service_role` keys from Studio → Settings → API
4. Set `NEXT_PUBLIC_SUPABASE_URL` to your Coolify-deployed Supabase URL

### Minimum Server Specs

| Use Case | RAM | CPU | Storage |
|----------|-----|-----|---------|
| Dev / small group | 4GB | 2 core | 40GB |
| 50 users | 8GB | 4 core | 100GB |
| 200+ users | 16GB | 8 core | 250GB+ |

Your homelab should be fine for the friend group use case on modest specs. Supabase self-hosted is actually quite lean compared to running a full Discord-equivalent SaaS.

### docker-compose.yml (for local dev before Coolify)

```yaml
version: '3.8'
services:
  web:
    build: ./apps/web
    ports: ['3000:3000']
    env_file: ./apps/web/.env.local
    depends_on: [supabase-db]

  signal:
    build: ./apps/signal
    ports: ['3001:3001']
    env_file: ./apps/signal/.env

  # Supabase is run via its own compose file
  # in dev, point SUPABASE_URL to localhost:54321
  # using: npx supabase start
```

For local dev, the Supabase CLI is the smoothest path:
```bash
npx supabase init
npx supabase start   # starts full local Supabase stack
npx supabase db push # applies your migrations
npx supabase gen types typescript --local > packages/db/types.ts
```

---

## 4. VOICE CHAT — STEP BY STEP IMPLEMENTATION PLAN

### Step 1: Signaling Server (apps/signal/index.ts)

```typescript
// Simple socket.io signaling server
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createClient } from '@supabase/supabase-js'

const io = new Server(createServer(), { cors: { origin: '*' } })
const rooms = new Map<string, Set<string>>() // channelId → Set of socket IDs

io.on('connection', (socket) => {
  socket.on('join-room', ({ channelId, userId }) => {
    socket.join(channelId)
    socket.data = { channelId, userId }
    
    const peers = rooms.get(channelId) ?? new Set()
    // Tell new joiner about existing peers
    socket.emit('room-peers', [...peers].filter(id => id !== socket.id))
    peers.add(socket.id)
    rooms.set(channelId, peers)
    
    // Tell existing peers about new joiner
    socket.to(channelId).emit('peer-joined', { peerId: socket.id, userId })
  })

  socket.on('offer', ({ to, offer }) => io.to(to).emit('offer', { from: socket.id, offer }))
  socket.on('answer', ({ to, answer }) => io.to(to).emit('answer', { from: socket.id, answer }))
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }))
  socket.on('speaking', ({ speaking }) => socket.to(socket.data.channelId).emit('peer-speaking', { peerId: socket.id, speaking }))
  socket.on('toggle-mute', ({ muted }) => socket.to(socket.data.channelId).emit('peer-muted', { peerId: socket.id, muted }))

  socket.on('disconnect', () => {
    const { channelId } = socket.data ?? {}
    if (channelId) {
      const peers = rooms.get(channelId)
      peers?.delete(socket.id)
      socket.to(channelId).emit('peer-left', { peerId: socket.id })
    }
  })
})
```

### Step 2: useVoice Hook (apps/web/lib/webrtc/useVoice.ts)

```typescript
// Manages local mic + all peer connections
import SimplePeer from 'simple-peer'
import { io } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'

export function useVoice(channelId: string, userId: string) {
  const [peers, setPeers] = useState<Map<string, { stream: MediaStream; speaking: boolean; muted: boolean }>>()
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const localStream = useRef<MediaStream>()
  const peerMap = useRef<Map<string, SimplePeer.Instance>>(new Map())
  const socket = useRef(io(process.env.NEXT_PUBLIC_SIGNAL_URL!))

  useEffect(() => {
    async function init() {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      
      // Voice activity detection
      const { Hark } = await import('hark')
      const hark = new Hark(localStream.current, {})
      hark.on('speaking', () => { setSpeaking(true); socket.current.emit('speaking', { speaking: true }) })
      hark.on('stopped_speaking', () => { setSpeaking(false); socket.current.emit('speaking', { speaking: false }) })

      socket.current.emit('join-room', { channelId, userId })

      socket.current.on('room-peers', (peerIds: string[]) => {
        peerIds.forEach(peerId => createPeer(peerId, true))
      })

      socket.current.on('peer-joined', ({ peerId }) => createPeer(peerId, false))
      socket.current.on('offer', ({ from, offer }) => handleOffer(from, offer))
      socket.current.on('answer', ({ from, answer }) => peerMap.current.get(from)?.signal(answer))
      socket.current.on('ice-candidate', ({ from, candidate }) => peerMap.current.get(from)?.signal(candidate))
      socket.current.on('peer-left', ({ peerId }) => removePeer(peerId))
    }
    init()
    return () => { socket.current.disconnect(); localStream.current?.getTracks().forEach(t => t.stop()) }
  }, [channelId])

  function createPeer(peerId: string, initiator: boolean) {
    const peer = new SimplePeer({ initiator, stream: localStream.current, trickle: true })
    peer.on('signal', data => socket.current.emit(initiator ? 'offer' : 'answer', { to: peerId, [initiator ? 'offer' : 'answer']: data }))
    peer.on('stream', stream => setPeers(prev => new Map(prev).set(peerId, { stream, speaking: false, muted: false })))
    peerMap.current.set(peerId, peer)
  }

  function handleOffer(from: string, offer: any) {
    const peer = new SimplePeer({ initiator: false, stream: localStream.current, trickle: true })
    peer.on('signal', answer => socket.current.emit('answer', { to: from, answer }))
    peer.on('stream', stream => setPeers(prev => new Map(prev).set(from, { stream, speaking: false, muted: false })))
    peer.signal(offer)
    peerMap.current.set(from, peer)
  }

  function removePeer(peerId: string) {
    peerMap.current.get(peerId)?.destroy()
    peerMap.current.delete(peerId)
    setPeers(prev => { const next = new Map(prev); next.delete(peerId); return next })
  }

  function toggleMute() {
    const track = localStream.current?.getAudioTracks()[0]
    if (track) { track.enabled = muted; setMuted(!muted) }
    socket.current.emit('toggle-mute', { muted: !muted })
  }

  return { peers, muted, deafened, speaking, toggleMute, setDeafened }
}
```

### Step 3: VoiceChannel Component

```tsx
// components/voice/VoiceChannel.tsx
export function VoiceChannel({ channelId }: { channelId: string }) {
  const { user } = useUser()
  const { peers, muted, speaking, toggleMute } = useVoice(channelId, user.id)
  
  return (
    <div className="voice-channel">
      <div className="participants-grid">
        {/* Local user tile */}
        <ParticipantTile user={user} speaking={speaking} muted={muted} local />
        
        {/* Remote peers */}
        {[...peers.entries()].map(([peerId, { stream, speaking, muted }]) => (
          <ParticipantTile key={peerId} peerId={peerId} stream={stream} speaking={speaking} muted={muted} />
        ))}
      </div>
      
      <VoiceControls muted={muted} onToggleMute={toggleMute} onLeave={/* disconnect */} />
    </div>
  )
}
```

### Step 4: Audio Playback
```tsx
// Auto-play remote audio streams
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])
  return <audio ref={ref} autoPlay playsInline />
}
```

---

## 5. QUICK REFERENCE: COMMANDS TO GET STARTED

```bash
# Install Claude Code (if not already)
npm install -g @anthropic-ai/claude-code

# In your project root:
claude

# Scaffold the monorepo
> Create a turborepo monorepo with apps/web (Next.js 14) and apps/signal (Node.js TypeScript), 
  plus packages/db for shared Supabase types. Include Tailwind, shadcn/ui, and socket.io.

# Init Supabase locally
npx supabase init
npx supabase start

# Deploy to Coolify
# 1. Push repo to GitHub/Gitea
# 2. In Coolify: New Resource → Application → Docker Compose
# 3. Point to your repo, set env vars
# 4. Deploy Supabase via Coolify's one-click template first
```

---

## 6. ESTIMATED BUILD TIME (with Claude Code doing the heavy lifting)

| Phase | Time |
|-------|------|
| Project scaffold + auth | 1-2 hrs |
| DB schema + migrations | 1 hr |
| Text channels + realtime | 2-3 hrs |
| Role system + profiles | 2 hrs |
| Voice (signaling + simple-peer) | 3-4 hrs |
| VAD + speaking indicators | 1 hr |
| Screen share | 1 hr |
| DMs + polish | 2-3 hrs |
| Coolify deployment | 1-2 hrs |
| **Total** | **~15-20 hrs** |

Claude Code will handle the boilerplate, type generation, and component wiring. Your main job is reviewing, testing the voice stuff in a browser (WebRTC can be finicky), and configuring the self-hosted infra.

---

## 7. THINGS TO WATCH OUT FOR

**WebRTC gotchas:**
- Voice only works over HTTPS in production (or localhost). Set up SSL via Coolify's Caddy integration early.
- TURN server: If users are behind strict NATs, P2P WebRTC fails. Run `coturn` as another Docker container in Coolify for relay fallback.
- Browser autoplay policies block audio until user interaction — make sure join-channel requires a click.

**Supabase self-host gotchas:**
- The `anon` key is public (in your frontend). Row Level Security (RLS) is your auth layer — enable it on every table from day one.
- Supabase Storage buckets: set one to public (avatars, server icons) and one to private with signed URLs (message attachments).
- Run `supabase db push` from the CLI to apply migrations to your Coolify-hosted instance (point `SUPABASE_DB_URL` to it).

**Coolify gotchas:**
- Coolify's reverse proxy handles ports — you don't expose 3000/3001 directly, just configure domain/subdomain per service.
- WebSockets need `proxy_set_header Upgrade $http_upgrade` — Coolify handles this automatically with Caddy but double-check.
- For voice signaling WebSockets specifically, set your Coolify proxy timeout high (300s+) so persistent WS connections don't drop.
