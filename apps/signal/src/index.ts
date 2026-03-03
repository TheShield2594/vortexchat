import { createServer } from "http"
import { Server, type Socket } from "socket.io"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import pino from "pino"
import { RoomManager } from "./rooms"
import { createVoiceStateSync } from "./voice-state-sync"

dotenv.config()

// ─── Structured logger ───────────────────────────────────────────────────────

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
})

// ─── Env var validation ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10)
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

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", rooms: rooms.getStats() }))
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
})

const rooms = new RoomManager()
const voiceStateSync = supabase ? createVoiceStateSync(supabase) : null

io.on("connection", (socket: Socket) => {
  logger.info({ socketId: socket.id }, "client connected")

  // ─── Join a voice room ──────────────────────────────────────────────────────
  socket.on("join-room", async (data: {
    channelId: string
    userId: string
    displayName?: string
    avatarUrl?: string
  }) => {
    const { channelId, userId, displayName, avatarUrl } = data

    if (!channelId || !userId) {
      socket.emit("error", { message: "channelId and userId are required" })
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
    }

    // Join socket.io room
    socket.join(channelId)

    // Register peer in room manager
    const existingPeers = rooms.join(channelId, {
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

    logger.info({ userId, channelId, peers: rooms.getRoomSize(channelId) }, "user joined room")
  })

  // ─── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on("offer", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
    io.to(to).emit("offer", { from: socket.id, offer })
  })

  socket.on("answer", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    io.to(to).emit("answer", { from: socket.id, answer })
  })

  socket.on("ice-candidate", ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate })
  })

  // ─── Voice state events ─────────────────────────────────────────────────────
  socket.on("speaking", ({ speaking }: { speaking: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { speaking })
    socket.to(peer.channelId).emit("peer-speaking", { peerId: socket.id, speaking })

    if (voiceStateSync) {
      voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { speaking } })
    }
  })

  socket.on("toggle-mute", ({ muted }: { muted: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { muted })
    socket.to(peer.channelId).emit("peer-muted", { peerId: socket.id, muted })

    if (voiceStateSync) {
      voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { muted } })
    }
  })

  socket.on("toggle-deafen", ({ deafened }: { deafened: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { deafened })
    socket.to(peer.channelId).emit("peer-deafened", { peerId: socket.id, deafened })

    if (voiceStateSync) {
      voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { deafened } })
    }
  })

  socket.on("screen-share", ({ sharing }: { sharing: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { screenSharing: sharing })
    socket.to(peer.channelId).emit("peer-screen-share", { peerId: socket.id, sharing })

    if (voiceStateSync) {
      voiceStateSync.enqueueUpdate({ userId: peer.userId, channelId: peer.channelId, patch: { self_stream: sharing } })
    }
  })

  // ─── Leave room explicitly ──────────────────────────────────────────────────
  socket.on("leave-room", ({ channelId }: { channelId: string }) => {
    handleLeave(socket, channelId)
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    logger.info({ socketId: socket.id, reason }, "client disconnected")
    const left = rooms.leaveAll(socket.id)

    for (const { channelId, userId } of left) {
      socket.to(channelId).emit("peer-left", { peerId: socket.id, userId })

      if (voiceStateSync) {
        voiceStateSync.enqueueDelete({ userId, channelId })
      }
    }
  })

  // ─── Helper ─────────────────────────────────────────────────────────────────
  function findPeerRoom(socketId: string): { channelId: string; userId: string } | null {
    const socketRooms = Array.from(socket.rooms).filter((r) => r !== socket.id)
    for (const channelId of socketRooms) {
      const peer = rooms.getPeer(channelId, socketId)
      if (peer) return { channelId, userId: peer.userId }
    }
    return null
  }

  function handleLeave(socket: Socket, channelId: string) {
    const peer = rooms.getPeer(channelId, socket.id)
    if (!peer) return

    rooms.leave(channelId, socket.id)
    socket.leave(channelId)
    socket.to(channelId).emit("peer-left", { peerId: socket.id, userId: peer.userId })

    if (voiceStateSync) {
      voiceStateSync.enqueueDelete({ userId: peer.userId, channelId })
    }

    logger.info({ userId: peer.userId, channelId }, "user left room")
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
