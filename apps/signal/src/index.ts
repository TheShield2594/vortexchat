import { createServer } from "http"
import { Server, type Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { createClient } from "@supabase/supabase-js"
import Redis from "ioredis"
import dotenv from "dotenv"
import pino from "pino"
import { InMemoryRoomManager, type IRoomManager } from "./rooms"
import { RedisRoomManager } from "./redis-rooms"
import { createVoiceStateSync } from "./voice-state-sync"

dotenv.config()

// ─── Per-socket rate limiter ─────────────────────────────────────────────────

class SocketRateLimiter {
  // Nested map: socketId → (action → timestamps)
  private windows = new Map<string, Map<string, { timestamps: number[] }>>()

  check(socketId: string, action: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const cutoff = now - windowMs
    let socketMap = this.windows.get(socketId)
    if (!socketMap) {
      socketMap = new Map()
      this.windows.set(socketId, socketMap)
    }
    let entry = socketMap.get(action)
    if (!entry) {
      entry = { timestamps: [] }
      socketMap.set(action, entry)
    }
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length >= limit) return false
    entry.timestamps.push(now)
    return true
  }

  remove(socketId: string): void {
    this.windows.delete(socketId)
  }

  cleanup(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs
    for (const [socketId, socketMap] of this.windows) {
      for (const [action, entry] of socketMap) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
        if (entry.timestamps.length === 0) socketMap.delete(action)
      }
      if (socketMap.size === 0) this.windows.delete(socketId)
    }
  }
}

const socketLimiter = new SocketRateLimiter()

// Periodic cleanup of stale entries
setInterval(() => socketLimiter.cleanup(120_000), 60_000)

// Rate limit presets (limit, windowMs)
const RATE_LIMITS = {
  joinRoom:      { limit: 10, windowMs: 60_000 },   // 10 joins/min
  signaling:     { limit: 100, windowMs: 60_000 },   // 100 offer/answer/ice per min
  voiceState:    { limit: 60, windowMs: 60_000 },    // 60 state changes/min
} as const

function checkSocketRate(socketId: string, action: keyof typeof RATE_LIMITS): boolean {
  const { limit, windowMs } = RATE_LIMITS[action]
  return socketLimiter.check(socketId, action, limit, windowMs)
}

// ─── Structured logger ───────────────────────────────────────────────────────

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
})

// ─── Env var validation ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10)
const REDIS_URL = process.env.REDIS_URL ?? ""
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const rawOrigins = process.env.ALLOWED_ORIGINS ?? ""

if (!rawOrigins || rawOrigins === "*") {
  if (process.env.NODE_ENV === "production") {
    logger.error(
      "ALLOWED_ORIGINS must be set to a specific origin list in production (not '*'). " +
      "Set ALLOWED_ORIGINS=https://your-app.vercel.app in your environment."
    )
    process.exit(1)
  } else {
    logger.warn("ALLOWED_ORIGINS not set — allowing all origins (dev only)")
  }
}

const ALLOWED_ORIGINS = rawOrigins ? rawOrigins.split(",") : "*"

// ─── Supabase admin client ────────────────────────────────────────────────────

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

if (!supabase) {
  logger.warn("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — auth verification and voice_states sync disabled")
}

// ─── HTTP server + Socket.IO ──────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", rooms: await rooms.getStats() }))
    return
  }
  res.writeHead(404)
  res.end()
})

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  perMessageDeflate: true,
})

// ─── Socket.IO Redis adapter (horizontal scaling) ────────────────────────────
// When REDIS_URL is set we attach the Redis adapter so that socket-room
// broadcasts (io.to(channelId).emit) are fanned out to ALL signal-server
// replicas.  Two separate ioredis clients are required: one for publish,
// one for the blocking subscribe channel.

if (REDIS_URL) {
  const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })
  const subClient = pubClient.duplicate()
  io.adapter(createAdapter(pubClient, subClient))
  logger.info("Socket.IO using Redis adapter (multi-instance mode)")
} else {
  logger.info("Socket.IO using in-memory adapter (single-instance mode)")
}

const rooms: IRoomManager = REDIS_URL
  ? new RedisRoomManager(REDIS_URL)
  : new InMemoryRoomManager()

if (REDIS_URL) {
  logger.info("room state backed by Redis")
} else {
  logger.info("room state backed by in-memory Map (set REDIS_URL to enable Redis)")
}
const voiceStateSync = supabase ? createVoiceStateSync(supabase) : null

// ─── Session re-validation cache for signaling events ────────────────────────
// Re-validate the auth token periodically (every 30s) instead of on every event
const SESSION_REVALIDATION_TTL_MS = 30_000
const sessionValidationCache = new Map<string, { validatedAt: number; userId: string }>()

async function validateSession(socket: Socket): Promise<boolean> {
  if (!supabase) return true // skip if no DB configured

  const cached = sessionValidationCache.get(socket.id)
  if (cached && Date.now() - cached.validatedAt < SESSION_REVALIDATION_TTL_MS) {
    return true
  }

  const authToken = socket.handshake.auth?.token
  if (!authToken) return false

  try {
    const { data: { user }, error } = await supabase.auth.getUser(authToken)
    if (error || !user) {
      sessionValidationCache.delete(socket.id)
      return false
    }
    sessionValidationCache.set(socket.id, { validatedAt: Date.now(), userId: user.id })
    return true
  } catch (err) {
    logger.error({ socketId: socket.id, err }, "session revalidation failed — allowing")
    return true // fail open on transient errors
  }
}

io.on("connection", (socket: Socket) => {
  logger.info({ socketId: socket.id }, "client connected")

  // ─── Join a voice room ──────────────────────────────────────────────────────
  socket.on("join-room", async (data: {
    channelId: string
    userId: string
    displayName?: unknown
    avatarUrl?: unknown
  }) => {
    try {
      const { channelId, userId } = data
      let { displayName, avatarUrl } = data

      if (!channelId || !userId) {
        socket.emit("error", { message: "channelId and userId are required" })
        return
      }

      if (!checkSocketRate(socket.id, "joinRoom")) {
        socket.emit("error", { message: "Rate limited — too many join requests" })
        return
      }

      // Type guard and length validation for displayName / avatarUrl
      if (displayName !== undefined && typeof displayName !== "string") {
        socket.emit("error", { message: "displayName must be a string" })
        return
      }
      if (avatarUrl !== undefined && typeof avatarUrl !== "string") {
        socket.emit("error", { message: "avatarUrl must be a string" })
        return
      }
      if (displayName && displayName.length > 100) {
        socket.emit("error", { message: "displayName must not exceed 100 characters" })
        return
      }
      if (avatarUrl && avatarUrl.length > 2048) {
        socket.emit("error", { message: "avatarUrl must not exceed 2048 characters" })
        return
      }

      // Verify auth token if supabase configured
      if (supabase) {
        const authToken = socket.handshake.auth?.token
        if (!authToken) {
          socket.emit("error", { message: "Authentication required" })
          return
        }
        const { data: { user }, error } = await supabase.auth.getUser(authToken)
        if (error || !user || user.id !== userId) {
          socket.emit("error", { message: "Unauthorized" })
          return
        }
        // Seed the session validation cache on join
        sessionValidationCache.set(socket.id, { validatedAt: Date.now(), userId: user.id })
      }

      // Join socket.io room
      socket.join(channelId)

      // Register peer in room manager
      const existingPeers = await rooms.join(channelId, {
        socketId: socket.id,
        userId,
        displayName,
        avatarUrl,
        muted: false,
        deafened: false,
        speaking: false,
        screenSharing: false,
        joinedAt: new Date(),
      })

      // Send existing peers to new joiner
      socket.emit("room-peers", existingPeers.map((p) => ({
        peerId: p.socketId,
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        muted: p.muted,
        deafened: p.deafened,
        screenSharing: p.screenSharing,
      })))

      // Notify existing peers about new joiner
      socket.to(channelId).emit("peer-joined", {
        peerId: socket.id,
        userId,
        displayName,
        avatarUrl,
      })

      // Queue Supabase voice_states upsert
      if (supabase && voiceStateSync) {
        const { data: channel } = await supabase
          .from("channels")
          .select("server_id")
          .eq("id", channelId)
          .single()

        if (channel) {
          voiceStateSync.enqueueUpsert({
            user_id: userId,
            channel_id: channelId,
            server_id: channel.server_id,
            muted: false,
            deafened: false,
            speaking: false,
            self_stream: false,
          })
        }
      }

      logger.info({ userId, channelId, peers: await rooms.getRoomSize(channelId) }, "user joined room")
    } catch (err) {
      logger.error({ socketId: socket.id, err }, "join-room handler error")
      socket.emit("error", { message: "Internal server error" })
    }
  })

  // ─── WebRTC Signaling ───────────────────────────────────────────────────────

  /** Verify sender and recipient are in the same channel before relaying */
  async function validateSignalingPeer(to: string): Promise<boolean> {
    try {
      // Re-validate session token periodically
      if (!(await validateSession(socket))) {
        logger.warn({ socketId: socket.id }, "signaling rejected — session invalid")
        return false
      }
      const senderRoom = await findPeerRoom(socket.id)
      if (!senderRoom) return false
      const recipientPeer = await rooms.getPeer(senderRoom.channelId, to)
      return !!recipientPeer
    } catch (err) {
      logger.error({ socketId: socket.id, to, err }, "validateSignalingPeer failed")
      return false
    }
  }

  socket.on("offer", async ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
    try {
      if (!checkSocketRate(socket.id, "signaling")) return
      if (!to || !offer) return
      if (!(await validateSignalingPeer(to))) return
      io.to(to).emit("offer", { from: socket.id, offer })
    } catch (err) {
      logger.error({ socketId: socket.id, event: "offer", err }, "signaling handler error")
    }
  })

  socket.on("answer", async ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    try {
      if (!checkSocketRate(socket.id, "signaling")) return
      if (!to || !answer) return
      if (!(await validateSignalingPeer(to))) return
      io.to(to).emit("answer", { from: socket.id, answer })
    } catch (err) {
      logger.error({ socketId: socket.id, event: "answer", err }, "signaling handler error")
    }
  })

  socket.on("ice-candidate", async ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
    try {
      if (!checkSocketRate(socket.id, "signaling")) return
      if (!to || !candidate) return
      if (!(await validateSignalingPeer(to))) return
      io.to(to).emit("ice-candidate", { from: socket.id, candidate })
    } catch (err) {
      logger.error({ socketId: socket.id, event: "ice-candidate", err }, "signaling handler error")
    }
  })

  // ─── Voice state events ─────────────────────────────────────────────────────

  /**
   * Re-verify channel membership against the database for sensitive state changes.
   * Returns false (and evicts the peer) if the user is no longer a server member.
   * Skipped if Supabase is not configured.
   *
   * DB queries are in their own try/catch (fail open on transient errors).
   * handleLeave errors are caught separately so eviction always returns false.
   */
  async function verifyChannelMembership(peer: { channelId: string; userId: string }): Promise<boolean> {
    if (!supabase) return true // skip if no DB configured

    let shouldEvict = false
    let evictReason = ""

    try {
      const { data: channel } = await supabase
        .from("channels")
        .select("server_id")
        .eq("id", peer.channelId)
        .single()

      if (!channel) {
        shouldEvict = true
        evictReason = "channel not found"
      } else {
        const { data: member } = await supabase
          .from("server_members")
          .select("user_id")
          .eq("server_id", channel.server_id)
          .eq("user_id", peer.userId)
          .single()

        if (!member) {
          shouldEvict = true
          evictReason = "no longer a server member"
        }
      }
    } catch (err) {
      // Fail open on DB/network errors — don't evict users due to transient failures
      logger.error({ userId: peer.userId, channelId: peer.channelId, err }, "verifyChannelMembership DB error — failing open")
      return true
    }

    if (!shouldEvict) return true

    // Eviction path — errors here must not trigger fail-open
    logger.warn({ userId: peer.userId, channelId: peer.channelId, reason: evictReason }, "evicting user")
    socket.emit("error", { message: "You are no longer a member of this server" })
    try {
      await handleLeave(socket, peer.channelId)
    } catch (err) {
      logger.error({ userId: peer.userId, channelId: peer.channelId, err }, "handleLeave failed during eviction")
    }
    return false
  }

  socket.on("speaking", async ({ speaking }: { speaking: boolean }) => {
    try {
      if (!checkSocketRate(socket.id, "voiceState")) return
      const peer = await findPeerRoom(socket.id)
      if (!peer) return

      await rooms.updatePeer(peer.channelId, socket.id, { speaking })
      socket.to(peer.channelId).emit("peer-speaking", { peerId: socket.id, speaking })

      if (voiceStateSync) {
        voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { speaking } })
      }
    } catch (err) {
      logger.error({ socketId: socket.id, event: "speaking", err }, "voice state handler error")
    }
  })

  socket.on("toggle-mute", async ({ muted }: { muted: boolean }) => {
    try {
      if (!checkSocketRate(socket.id, "voiceState")) return
      const peer = await findPeerRoom(socket.id)
      if (!peer) return
      if (!(await verifyChannelMembership(peer))) return

      await rooms.updatePeer(peer.channelId, socket.id, { muted })
      socket.to(peer.channelId).emit("peer-muted", { peerId: socket.id, muted })

      if (voiceStateSync) {
        voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { muted } })
      }
    } catch (err) {
      logger.error({ socketId: socket.id, event: "toggle-mute", err }, "voice state handler error")
    }
  })

  socket.on("toggle-deafen", async ({ deafened }: { deafened: boolean }) => {
    try {
      if (!checkSocketRate(socket.id, "voiceState")) return
      const peer = await findPeerRoom(socket.id)
      if (!peer) return
      if (!(await verifyChannelMembership(peer))) return

      await rooms.updatePeer(peer.channelId, socket.id, { deafened })
      socket.to(peer.channelId).emit("peer-deafened", { peerId: socket.id, deafened })

      if (voiceStateSync) {
        voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { deafened } })
      }
    } catch (err) {
      logger.error({ socketId: socket.id, event: "toggle-deafen", err }, "voice state handler error")
    }
  })

  socket.on("screen-share", async ({ sharing }: { sharing: boolean }) => {
    try {
      if (!checkSocketRate(socket.id, "voiceState")) return
      const peer = await findPeerRoom(socket.id)
      if (!peer) return
      if (!(await verifyChannelMembership(peer))) return

      await rooms.updatePeer(peer.channelId, socket.id, { screenSharing: sharing })
      socket.to(peer.channelId).emit("peer-screen-share", { peerId: socket.id, sharing })

      if (voiceStateSync) {
        voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { self_stream: sharing } })
      }
    } catch (err) {
      logger.error({ socketId: socket.id, event: "screen-share", err }, "voice state handler error")
    }
  })

  // ─── Leave room explicitly ──────────────────────────────────────────────────
  socket.on("leave-room", async ({ channelId }: { channelId: string }) => {
    try {
      await handleLeave(socket, channelId)
    } catch (err) {
      logger.error({ socketId: socket.id, channelId, err }, "leave-room handler error")
    }
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", async (reason) => {
    logger.info({ socketId: socket.id, reason }, "client disconnected")
    socketLimiter.remove(socket.id)
    sessionValidationCache.delete(socket.id)
    try {
      const left = await rooms.leaveAll(socket.id)

      for (const { channelId, userId } of left) {
        socket.to(channelId).emit("peer-left", { peerId: socket.id, userId })

        if (voiceStateSync) {
          voiceStateSync.enqueueDelete({ userId, channelId })
        }
      }
    } catch (err) {
      logger.error({ socketId: socket.id, reason, err }, "disconnect cleanup error")
    }
  })

  // ─── Helper ─────────────────────────────────────────────────────────────────
  async function findPeerRoom(socketId: string): Promise<{ channelId: string; userId: string } | null> {
    try {
      const socketRooms = Array.from(socket.rooms).filter((r) => r !== socket.id)
      for (const channelId of socketRooms) {
        const peer = await rooms.getPeer(channelId, socketId)
        if (peer) return { channelId, userId: peer.userId }
      }
      return null
    } catch (err) {
      logger.error({ socketId, err }, "findPeerRoom error")
      return null
    }
  }

  async function handleLeave(socket: Socket, channelId: string): Promise<void> {
    try {
      const peer = await rooms.getPeer(channelId, socket.id)
      if (!peer) return

      await rooms.leave(channelId, socket.id)
      socket.leave(channelId)
      socket.to(channelId).emit("peer-left", { peerId: socket.id, userId: peer.userId })

      if (voiceStateSync) {
        voiceStateSync.enqueueDelete({ userId: peer.userId, channelId })
      }

      logger.info({ userId: peer.userId, channelId }, "user left room")
    } catch (err) {
      logger.error({ socketId: socket.id, channelId, err }, "handleLeave error")
    }
  }
})

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, "Vortex WebRTC signaling server listening")
})

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down...")
  io.close()
  httpServer.close()
  process.exit(0)
})
