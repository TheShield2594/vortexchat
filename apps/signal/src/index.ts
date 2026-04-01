import { createHash, randomUUID } from "crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "http"
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

const REVOKE_TOKEN_SECRET = process.env.SIGNAL_REVOKE_SECRET ?? ""

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", rooms: await rooms.getStats() }))
    return
  }

  // ─── Token revocation endpoint ───────────────────────────────────────────
  // Called by the web app when a session is revoked (password change, logout,
  // admin action). Accepts { token } in the JSON body. Protected by a shared
  // secret so only the web backend can call it.
  if (req.url === "/revoke-token" && req.method === "POST") {
    try {
      if (!REVOKE_TOKEN_SECRET) {
        logger.warn("POST /revoke-token called but SIGNAL_REVOKE_SECRET is not configured")
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Revocation endpoint not configured" }))
        return
      }

      const authHeader = req.headers.authorization ?? ""
      if (authHeader !== `Bearer ${REVOKE_TOKEN_SECRET}`) {
        res.writeHead(401, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Unauthorized" }))
        return
      }

      const body = await new Promise<string>((resolve, reject) => {
        let data = ""
        req.on("data", (chunk: Buffer) => {
          data += chunk.toString()
          if (data.length > 4096) {
            reject(new Error("Body too large"))
          }
        })
        req.on("end", () => resolve(data))
        req.on("error", reject)
      })

      const parsed: unknown = JSON.parse(body)
      if (typeof parsed !== "object" || parsed === null) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON body" }))
        return
      }
      const { token } = parsed as { token?: unknown }
      if (typeof token !== "string" || !token) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Missing or invalid 'token' field" }))
        return
      }

      const persisted = await revokeToken(token)
      if (!persisted) {
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Failed to persist revocation" }))
        return
      }

      // Force-disconnect any sockets currently using this token.
      // io.fetchSockets() is cluster-safe — it enumerates sockets across all
      // replicas when the Redis adapter is attached.
      let disconnected = 0
      const sockets = await io.fetchSockets()
      for (const s of sockets) {
        if (s.handshake.auth?.token === token) {
          sessionValidationCache.delete(s.id)
          s.emit("error", { message: "Session revoked" })
          s.disconnect(true)
          disconnected++
        }
      }

      logger.info({ disconnected }, "token revoked — active sockets disconnected")
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, disconnected }))
    } catch (err) {
      logger.error({ err }, "POST /revoke-token error")
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Internal server error" }))
    }
    return
  }

  // ─── Force-disconnect endpoint ──────────────────────────────────────────
  // Called by the web app when a user is kicked/banned from a server.
  // Accepts { userId, serverId } in the JSON body. Protected by the same
  // shared secret as /revoke-token.
  if (req.url === "/force-disconnect" && req.method === "POST") {
    try {
      if (!REVOKE_TOKEN_SECRET) {
        logger.warn("POST /force-disconnect called but SIGNAL_REVOKE_SECRET is not configured")
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Force-disconnect endpoint not configured" }))
        return
      }

      const authHeader = req.headers.authorization ?? ""
      if (authHeader !== `Bearer ${REVOKE_TOKEN_SECRET}`) {
        res.writeHead(401, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Unauthorized" }))
        return
      }

      const body = await new Promise<string>((resolve, reject) => {
        let data = ""
        req.on("data", (chunk: Buffer) => {
          data += chunk.toString()
          if (data.length > 4096) {
            reject(new Error("Body too large"))
          }
        })
        req.on("end", () => resolve(data))
        req.on("error", reject)
      })

      const parsed: unknown = JSON.parse(body)
      if (typeof parsed !== "object" || parsed === null) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON body" }))
        return
      }
      const { userId, serverId } = parsed as Record<string, unknown>
      if (typeof userId !== "string" || !userId || typeof serverId !== "string" || !serverId) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Missing or invalid 'userId' and/or 'serverId' fields" }))
        return
      }

      // Publish to Redis pub/sub so all replicas evict the user
      let publishFailed = false
      if (forceDisconnectPub) {
        try {
          await forceDisconnectPub.publish(
            FORCE_DISCONNECT_CHANNEL,
            JSON.stringify({ userId, serverId, originNodeId: NODE_ID } satisfies ForceDisconnectPayload),
          )
        } catch (pubErr) {
          publishFailed = true
          logger.error({ pubErr }, "failed to publish force-disconnect — falling back to local-only eviction")
        }
      }

      // Evict locally (handles single-instance and the originating replica)
      const evicted = await evictUserFromServer(userId, serverId)

      if (publishFailed) {
        // Local eviction succeeded but cross-replica fanout failed
        logger.warn({ userId, serverId, evicted }, "force-disconnect partial — Redis publish failed")
        res.writeHead(207, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: false, partial: true, evicted, error: "Redis fanout failed — only local replica processed" }))
      } else {
        logger.info({ userId, serverId, evicted }, "force-disconnect processed")
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true, evicted }))
      }
    } catch (err) {
      logger.error({ err }, "POST /force-disconnect error")
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Internal server error" }))
    }
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
// Re-validate the auth token periodically instead of on every event.
const SESSION_REVALIDATION_TTL_MS = 10_000
// Maximum age of a cached entry that can be used as fallback on transient auth
// service errors. Kept short to limit the window in which a revoked token
// remains usable when the auth service is unreachable.
const SESSION_FALLBACK_MAX_AGE_MS = 15_000
const sessionValidationCache = new Map<string, { validatedAt: number; userId: string }>()

// ─── Token revocation list (Redis-backed when available) ─────────────────────
// When sessions are revoked (password change, admin action, logout) the web app
// POSTs to /revoke-token so the signal server can immediately reject the token
// without waiting for the next Supabase revalidation cycle.
//
// Tokens are stored as SHA-256 digests — never store raw bearer tokens in Redis
// or process memory to limit blast radius of a key scan or memory dump.
const REVOCATION_PREFIX = "vortex:revoked-token"
const REVOCATION_TTL_SECONDS = 3600 // keep entries for 1 hour then auto-expire

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

let revocationRedis: Redis | null = null
if (REDIS_URL) {
  revocationRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })
  logger.info("token revocation list backed by Redis")
}
// In-memory fallback for single-instance deployments without Redis
const inMemoryRevocations = new Map<string, number>()

async function isTokenRevoked(token: string): Promise<boolean> {
  const digest = hashToken(token)
  try {
    if (revocationRedis) {
      const exists = await revocationRedis.exists(`${REVOCATION_PREFIX}:${digest}`)
      return exists === 1
    }
    const expiresAt = inMemoryRevocations.get(digest)
    if (expiresAt === undefined) return false
    if (Date.now() > expiresAt) {
      inMemoryRevocations.delete(digest)
      return false
    }
    return true
  } catch (err) {
    logger.error({ err }, "revocation check failed — failing closed (denying)")
    return true // fail closed: if we can't check, assume revoked
  }
}

async function revokeToken(token: string): Promise<boolean> {
  const digest = hashToken(token)
  try {
    if (revocationRedis) {
      await revocationRedis.set(
        `${REVOCATION_PREFIX}:${digest}`,
        "1",
        "EX",
        REVOCATION_TTL_SECONDS,
      )
    } else {
      inMemoryRevocations.set(digest, Date.now() + REVOCATION_TTL_SECONDS * 1000)
    }
    return true
  } catch (err) {
    logger.error({ err }, "failed to persist token revocation")
    return false
  }
}

// Periodic cleanup of expired in-memory revocations
setInterval(() => {
  const now = Date.now()
  for (const [digest, expiresAt] of inMemoryRevocations) {
    if (now > expiresAt) inMemoryRevocations.delete(digest)
  }
}, 60_000)

// ─── Force-disconnect pub/sub (cross-replica eviction) ──────────────────────
// When a user is kicked/banned from a server, the web app POSTs to
// /force-disconnect which publishes a message to the Redis pub/sub channel.
// All replicas subscribe and evict matching sockets immediately.
const FORCE_DISCONNECT_CHANNEL = "vortex:force-disconnect"

// Unique ID for this process — used to deduplicate pub/sub messages so the
// origin replica doesn't process its own published force-disconnect twice.
const NODE_ID = randomUUID()

interface ForceDisconnectPayload {
  userId: string
  serverId: string
  originNodeId: string
}

let forceDisconnectSub: Redis | null = null
let forceDisconnectPub: Redis | null = null

if (REDIS_URL) {
  forceDisconnectPub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })
  forceDisconnectSub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })

  forceDisconnectSub.subscribe(FORCE_DISCONNECT_CHANNEL, (err) => {
    if (err) {
      logger.error({ err }, "failed to subscribe to force-disconnect channel")
    } else {
      logger.info("subscribed to force-disconnect pub/sub channel")
    }
  })

  forceDisconnectSub.on("message", async (channel: string, message: string) => {
    if (channel !== FORCE_DISCONNECT_CHANNEL) return
    try {
      const payload: unknown = JSON.parse(message)
      if (typeof payload !== "object" || payload === null) return
      const { userId, serverId, originNodeId } = payload as Record<string, unknown>
      if (typeof userId !== "string" || typeof serverId !== "string") return
      // Skip if this replica originated the message (it already evicted locally)
      if (typeof originNodeId === "string" && originNodeId === NODE_ID) return
      await evictUserFromServer(userId, serverId)
    } catch (err) {
      logger.error({ err }, "force-disconnect message handler error")
    }
  })
}

/**
 * Evict a user from all voice channels belonging to a given server.
 * Called both from the local /force-disconnect endpoint and from Redis pub/sub.
 */
async function evictUserFromServer(userId: string, serverId: string): Promise<number> {
  let evicted = 0
  try {
    const stats = await rooms.getStats()
    for (const channelId of Object.keys(stats)) {
      const peers = await rooms.getRoomPeers(channelId)
      for (const peer of peers) {
        if (peer.userId !== userId) continue

        // Verify this channel belongs to the target server
        if (supabase) {
          try {
            const { data: ch } = await supabase
              .from("channels")
              .select("server_id")
              .eq("id", channelId)
              .maybeSingle()
            if (!ch || ch.server_id !== serverId) continue
          } catch {
            // If we can't verify, skip this channel to avoid false eviction
            continue
          }
        }

        // Find and disconnect the socket
        const sockets = await io.fetchSockets()
        for (const s of sockets) {
          if (s.id === peer.socketId) {
            // Clean up room state before disconnecting
            await rooms.leave(channelId, s.id)
            s.leave(channelId)
            io.to(channelId).emit("peer-left", { peerId: s.id, userId })
            if (voiceStateSync) {
              voiceStateSync.enqueueDelete({ userId, channelId })
            }
            // Notify and force-disconnect the socket
            s.emit("force-leave", { message: "You have been removed from this server" })
            sessionValidationCache.delete(s.id)
            s.disconnect(true)
            evicted++
            logger.info({ userId, channelId, serverId, socketId: s.id }, "force-disconnected user from voice channel")
          }
        }
      }
    }
  } catch (err) {
    logger.error({ userId, serverId, err }, "evictUserFromServer error")
  }
  return evicted
}

async function validateSession(socket: Socket): Promise<boolean> {
  if (!supabase) return true // skip if no DB configured

  const authToken = socket.handshake.auth?.token
  if (!authToken) return false

  // Always check revocation list first — an explicitly revoked token must
  // never be accepted, regardless of cache state.
  if (await isTokenRevoked(authToken)) {
    logger.warn({ socketId: socket.id }, "session rejected — token is on revocation list")
    sessionValidationCache.delete(socket.id)
    socket.disconnect(true)
    return false
  }

  const cached = sessionValidationCache.get(socket.id)
  if (cached && Date.now() - cached.validatedAt < SESSION_REVALIDATION_TTL_MS) {
    return true
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(authToken)
    if (error || !user) {
      sessionValidationCache.delete(socket.id)
      return false
    }
    sessionValidationCache.set(socket.id, { validatedAt: Date.now(), userId: user.id })
    return true
  } catch (err) {
    // On transient errors, allow only if we have a recent cached validation
    if (cached && Date.now() - cached.validatedAt < SESSION_FALLBACK_MAX_AGE_MS) {
      logger.warn(
        { socketId: socket.id, userId: cached.userId, cachedAgeMs: Date.now() - cached.validatedAt, err },
        "session revalidation failed — using cached validation (session_fallback_used)"
      )
      return true
    }
    // Fallback expired — force disconnect to prevent stale token reuse
    logger.error({ socketId: socket.id, err }, "session revalidation failed — fallback expired, disconnecting")
    sessionValidationCache.delete(socket.id)
    socket.disconnect(true)
    return false
  }
}

/**
 * Verify a user is a member of the server that owns the given channel.
 * Returns false if the user is not a member. Fails open on DB errors.
 */
async function checkChannelMembership(userId: string, channelId: string): Promise<boolean> {
  if (!supabase) return true

  try {
    const { data: channel, error: chErr } = await supabase
      .from("channels")
      .select("server_id")
      .eq("id", channelId)
      .maybeSingle()

    if (chErr) {
      logger.error({ userId, channelId, err: chErr }, "checkChannelMembership channel query error — failing open")
      return true
    }
    if (!channel) return false

    const { data: member, error: memErr } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", channel.server_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (memErr) {
      logger.error({ userId, channelId, err: memErr }, "checkChannelMembership member query error — failing open")
      return true
    }
    return !!member
  } catch (err) {
    logger.error({ userId, channelId, err }, "checkChannelMembership error — failing open")
    return true
  }
}

io.on("connection", (socket: Socket) => {
  logger.info({ socketId: socket.id }, "client connected")

  // ─── Join a voice room ──────────────────────────────────────────────────────
  socket.on("join-room", async (data: unknown) => {
    try {
      if (typeof data !== "object" || data === null) {
        socket.emit("error", { message: "Invalid join-room payload" })
        return
      }

      const payload = data as Record<string, unknown>
      const channelId = payload.channelId
      const clientUserId = payload.userId
      let displayName = payload.displayName
      let avatarUrl = payload.avatarUrl

      if (typeof channelId !== "string" || !channelId || typeof clientUserId !== "string" || !clientUserId) {
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

      // Derive userId from auth token — never trust client-supplied userId
      let userId = clientUserId
      if (supabase) {
        const authToken = socket.handshake.auth?.token
        if (!authToken) {
          socket.emit("error", { message: "Authentication required" })
          return
        }

        // Check revocation list before hitting Supabase
        if (await isTokenRevoked(authToken)) {
          socket.emit("error", { message: "Session revoked" })
          socket.disconnect(true)
          return
        }

        const { data: { user }, error } = await supabase.auth.getUser(authToken)
        if (error || !user) {
          socket.emit("error", { message: "Unauthorized" })
          return
        }
        // Use server-derived userId, reject if client lied
        if (user.id !== clientUserId) {
          socket.emit("error", { message: "Unauthorized" })
          return
        }
        userId = user.id

        // Verify channel membership before joining the room
        const isMember = await checkChannelMembership(userId, channelId)
        if (!isMember) {
          socket.emit("error", { message: "You are not a member of this server" })
          return
        }

        // Seed the session validation cache on join
        sessionValidationCache.set(socket.id, { validatedAt: Date.now(), userId })
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
        const { data: channel, error: channelError } = await supabase
          .from("channels")
          .select("server_id")
          .eq("id", channelId)
          .maybeSingle()

        if (channelError) {
          logger.error({ channelId, err: channelError.message }, "failed to resolve channel for voice state upsert")
        } else if (channel) {
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

  socket.on("offer", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { to, offer } = payload as { to?: unknown; offer?: unknown }
      if (typeof to !== "string" || !to || !offer) return
      if (!checkSocketRate(socket.id, "signaling")) return
      if (!(await validateSignalingPeer(to))) return
      io.to(to).emit("offer", { from: socket.id, offer })
    } catch (err) {
      logger.error({ socketId: socket.id, event: "offer", err }, "signaling handler error")
    }
  })

  socket.on("answer", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { to, answer } = payload as { to?: unknown; answer?: unknown }
      if (typeof to !== "string" || !to || !answer) return
      if (!checkSocketRate(socket.id, "signaling")) return
      if (!(await validateSignalingPeer(to))) return
      io.to(to).emit("answer", { from: socket.id, answer })
    } catch (err) {
      logger.error({ socketId: socket.id, event: "answer", err }, "signaling handler error")
    }
  })

  socket.on("ice-candidate", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { to, candidate } = payload as { to?: unknown; candidate?: unknown }
      if (typeof to !== "string" || !to || !candidate) return
      if (!checkSocketRate(socket.id, "signaling")) return
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
   * DB queries use .maybeSingle() to distinguish missing rows from DB errors.
   * On DB/network errors, fails open (returns true). handleLeave errors are
   * caught separately so eviction always returns false.
   */
  async function verifyChannelMembership(peer: { channelId: string; userId: string }): Promise<boolean> {
    if (!supabase) return true // skip if no DB configured

    let shouldEvict = false
    let evictReason = ""

    try {
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("server_id")
        .eq("id", peer.channelId)
        .maybeSingle()

      if (channelError) {
        logger.error({ userId: peer.userId, channelId: peer.channelId, err: channelError }, "verifyChannelMembership channel query error — failing open")
        return true
      }

      if (!channel) {
        shouldEvict = true
        evictReason = "channel not found"
      } else {
        const { data: member, error: memberError } = await supabase
          .from("server_members")
          .select("user_id")
          .eq("server_id", channel.server_id)
          .eq("user_id", peer.userId)
          .maybeSingle()

        if (memberError) {
          logger.error({ userId: peer.userId, channelId: peer.channelId, err: memberError }, "verifyChannelMembership member query error — failing open")
          return true
        }

        if (!member) {
          shouldEvict = true
          evictReason = "no longer a server member"
        }
      }
    } catch (err) {
      // Fail open on unexpected errors — don't evict users due to transient failures
      logger.error({ userId: peer.userId, channelId: peer.channelId, err }, "verifyChannelMembership error — failing open")
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

  socket.on("speaking", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { speaking } = payload as { speaking?: unknown }
      if (typeof speaking !== "boolean") return
      if (!checkSocketRate(socket.id, "voiceState")) return
      if (!(await validateSession(socket))) return
      const peer = await findPeerRoom(socket.id)
      if (!peer) return
      if (!(await verifyChannelMembership(peer))) return

      await rooms.updatePeer(peer.channelId, socket.id, { speaking })
      socket.to(peer.channelId).emit("peer-speaking", { peerId: socket.id, speaking })

      if (voiceStateSync) {
        voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { speaking } })
      }
    } catch (err) {
      logger.error({ socketId: socket.id, event: "speaking", err }, "voice state handler error")
    }
  })

  socket.on("toggle-mute", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { muted } = payload as { muted?: unknown }
      if (typeof muted !== "boolean") return
      if (!checkSocketRate(socket.id, "voiceState")) return
      if (!(await validateSession(socket))) return
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

  socket.on("toggle-deafen", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { deafened } = payload as { deafened?: unknown }
      if (typeof deafened !== "boolean") return
      if (!checkSocketRate(socket.id, "voiceState")) return
      if (!(await validateSession(socket))) return
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

  socket.on("screen-share", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { sharing } = payload as { sharing?: unknown }
      if (typeof sharing !== "boolean") return
      if (!checkSocketRate(socket.id, "voiceState")) return
      if (!(await validateSession(socket))) return
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
  socket.on("leave-room", async (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) return
      const { channelId } = payload as { channelId?: unknown }
      if (typeof channelId !== "string" || !channelId) return
      await handleLeave(socket, channelId)
    } catch (err) {
      logger.error({ socketId: socket.id, err }, "leave-room handler error")
    }
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", async (reason: string) => {
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

// ─── Periodic membership re-validation (60-second sweep) ───────────────────
// Catches cases where a user was kicked/banned but no voice state event was
// emitted (e.g. the user went silent). Every 60 seconds, all active voice
// peers are checked against the database. Peers that are no longer server
// members are evicted and their sockets notified.
const MEMBERSHIP_REVALIDATION_INTERVAL_MS = 60_000

if (supabase) {
  setInterval(async () => {
    try {
      const stats = await rooms.getStats()
      const channelIds = Object.keys(stats)
      if (channelIds.length === 0) return

      // Batch-resolve server_ids for all active channels
      const { data: channels, error: chErr } = await supabase
        .from("channels")
        .select("id, server_id")
        .in("id", channelIds)

      if (chErr) {
        logger.error({ err: chErr }, "periodic revalidation — channel query error")
        return
      }
      if (!channels || channels.length === 0) return

      const channelServerMap = new Map<string, string>()
      for (const ch of channels) channelServerMap.set(ch.id, ch.server_id)

      // Collect unique userId+serverId pairs to check
      const toCheck = new Map<string, { userId: string; serverId: string; channelId: string; socketId: string }[]>()

      for (const channelId of channelIds) {
        const serverId = channelServerMap.get(channelId)
        if (!serverId) continue

        const peers = await rooms.getRoomPeers(channelId)
        for (const peer of peers) {
          const key = `${peer.userId}::${serverId}`
          if (!toCheck.has(key)) toCheck.set(key, [])
          toCheck.get(key)!.push({ userId: peer.userId, serverId, channelId, socketId: peer.socketId })
        }
      }

      // Check membership for each unique userId+serverId pair
      for (const [, entries] of toCheck) {
        const { userId, serverId } = entries[0]
        try {
          const { data: member, error: memErr } = await supabase
            .from("server_members")
            .select("user_id")
            .eq("server_id", serverId)
            .eq("user_id", userId)
            .maybeSingle()

          if (memErr) {
            logger.error({ userId, serverId, err: memErr }, "periodic revalidation — member query error, skipping")
            continue
          }

          if (member) continue // still a member, nothing to do

          // User is no longer a member — evict from all channels in this server
          logger.warn({ userId, serverId }, "periodic revalidation — user no longer a member, evicting")

          const sockets = await io.fetchSockets()
          const socketMap = new Map(sockets.map((s) => [s.id, s]))

          for (const entry of entries) {
            const sock = socketMap.get(entry.socketId)
            if (!sock) continue

            // Clean up room state before disconnecting
            await rooms.leave(entry.channelId, entry.socketId)
            sock.leave(entry.channelId)
            io.to(entry.channelId).emit("peer-left", { peerId: entry.socketId, userId })

            if (voiceStateSync) {
              voiceStateSync.enqueueDelete({ userId, channelId: entry.channelId })
            }

            // Notify and force-disconnect the socket
            sock.emit("force-leave", { message: "You are no longer a member of this server" })
            sessionValidationCache.delete(entry.socketId)
            sock.disconnect(true)

            logger.info({ userId, channelId: entry.channelId, socketId: entry.socketId }, "periodic revalidation — evicted peer")
          }
        } catch (err) {
          logger.error({ userId, serverId, err }, "periodic revalidation — check error")
        }
      }
    } catch (err) {
      logger.error({ err }, "periodic membership revalidation sweep error")
    }
  }, MEMBERSHIP_REVALIDATION_INTERVAL_MS)

  logger.info({ intervalMs: MEMBERSHIP_REVALIDATION_INTERVAL_MS }, "periodic membership re-validation enabled")
}

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, "Vortex WebRTC signaling server listening")
})

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down...")
  if (forceDisconnectSub) forceDisconnectSub.disconnect()
  if (forceDisconnectPub) forceDisconnectPub.disconnect()
  io.close()
  httpServer.close()
  process.exit(0)
})