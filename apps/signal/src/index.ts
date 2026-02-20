import { createServer } from "http"
import { Server, type Socket } from "socket.io"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import { RoomManager } from "./rooms"

dotenv.config()

const PORT = parseInt(process.env.PORT ?? "3001", 10)
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*").split(",")

// WebRTC signaling types (browser-native types not available in Node)
interface SessionDescription {
  type: string
  sdp?: string
}

interface IceCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

// Supabase admin client (for verifying auth tokens + updating voice_states)
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

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

/** Fire-and-forget Supabase update with error logging */
function syncVoiceState(
  action: "upsert" | "update" | "delete",
  filter: { userId: string; channelId: string },
  data?: Record<string, unknown>
): void {
  if (!supabase) return

  let query
  if (action === "upsert") {
    query = supabase.from("voice_states").upsert(data as never)
  } else if (action === "update") {
    query = supabase.from("voice_states")
      .update(data as never)
      .eq("user_id", filter.userId)
      .eq("channel_id", filter.channelId)
  } else {
    query = supabase.from("voice_states")
      .delete()
      .eq("user_id", filter.userId)
      .eq("channel_id", filter.channelId)
  }

  query.then(({ error }) => {
    if (error) console.error(`[voice_states] ${action} failed:`, error.message)
  })
}

io.on("connection", (socket: Socket) => {
  console.log(`[connect] ${socket.id}`)

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
      const authToken = socket.handshake.auth?.token as string | undefined
      if (authToken) {
        const { data: { user }, error } = await supabase.auth.getUser(authToken)
        if (error || !user || user.id !== userId) {
          socket.emit("error", { message: "Unauthorized" })
          return
        }
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

    // Update Supabase voice_states
    if (supabase) {
      const { data: channel } = await supabase
        .from("channels")
        .select("server_id")
        .eq("id", channelId)
        .single()

      if (channel) {
        syncVoiceState("upsert", { userId, channelId }, {
          user_id: userId,
          channel_id: channelId,
          server_id: (channel as { server_id: string }).server_id,
          muted: false,
          deafened: false,
          speaking: false,
          self_stream: false,
        })
      }
    }

    console.log(`[join] ${userId} → room ${channelId} (${rooms.getRoomSize(channelId)} peers)`)
  })

  // ─── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on("offer", ({ to, offer }: { to: string; offer: SessionDescription }) => {
    io.to(to).emit("offer", { from: socket.id, offer })
  })

  socket.on("answer", ({ to, answer }: { to: string; answer: SessionDescription }) => {
    io.to(to).emit("answer", { from: socket.id, answer })
  })

  socket.on("ice-candidate", ({ to, candidate }: { to: string; candidate: IceCandidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate })
  })

  // ─── Voice state events ─────────────────────────────────────────────────────
  socket.on("speaking", ({ speaking }: { speaking: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { speaking })
    socket.to(peer.channelId).emit("peer-speaking", { peerId: socket.id, speaking })
    syncVoiceState("update", peer, { speaking })
  })

  socket.on("toggle-mute", ({ muted }: { muted: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { muted })
    socket.to(peer.channelId).emit("peer-muted", { peerId: socket.id, muted })
    syncVoiceState("update", peer, { muted })
  })

  socket.on("toggle-deafen", ({ deafened }: { deafened: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { deafened })
    socket.to(peer.channelId).emit("peer-deafened", { peerId: socket.id, deafened })
    syncVoiceState("update", peer, { deafened })
  })

  socket.on("screen-share", ({ sharing }: { sharing: boolean }) => {
    const peer = findPeerRoom(socket.id)
    if (!peer) return

    rooms.updatePeer(peer.channelId, socket.id, { screenSharing: sharing })
    socket.to(peer.channelId).emit("peer-screen-share", { peerId: socket.id, sharing })
    syncVoiceState("update", peer, { self_stream: sharing })
  })

  // ─── Leave room explicitly ──────────────────────────────────────────────────
  socket.on("leave-room", ({ channelId }: { channelId: string }) => {
    handleLeave(socket, channelId)
  })

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason: string) => {
    console.log(`[disconnect] ${socket.id} — ${reason}`)
    const left = rooms.leaveAll(socket.id)

    for (const { channelId, userId } of left) {
      socket.to(channelId).emit("peer-left", { peerId: socket.id, userId })
      syncVoiceState("delete", { userId, channelId })
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
    syncVoiceState("delete", { userId: peer.userId, channelId })

    console.log(`[leave] ${peer.userId} ← room ${channelId}`)
  }
})

httpServer.listen(PORT, () => {
  console.log(`[signal] Vortex WebRTC signaling server listening on :${PORT}`)
  if (!supabase) {
    console.warn("[signal] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — voice_states sync disabled")
  }
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[signal] SIGTERM received, shutting down...")
  io.close()
  httpServer.close()
  process.exit(0)
})
