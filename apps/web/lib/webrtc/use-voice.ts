"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface PeerState {
  stream: MediaStream
  speaking: boolean
  muted: boolean
  userId: string
}

interface UseVoiceReturn {
  peers: Map<string, PeerState>
  muted: boolean
  deafened: boolean
  speaking: boolean
  screenSharing: boolean
  videoEnabled: boolean
  localStream: React.RefObject<MediaStream | null>
  screenStream: React.RefObject<MediaStream | null>
  cameraStream: React.RefObject<MediaStream | null>
  toggleMute: () => void
  toggleDeafen: () => void
  toggleScreenShare: () => Promise<void>
  toggleVideo: () => Promise<void>
  leaveChannel: () => void
}

export function useVoice(channelId: string, userId: string): UseVoiceReturn {
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)

  const localStream = useRef<MediaStream | null>(null)
  const screenStream = useRef<MediaStream | null>(null)
  const cameraStream = useRef<MediaStream | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const harkRef = useRef<{ stop: () => void } | null>(null)
  // Stable unique ID for this client session — replaces socket.id
  const clientIdRef = useRef<string>(crypto.randomUUID())
  const supabaseRef = useRef(createClientSupabaseClient())

  useEffect(() => {
    let mounted = true
    const supabase = supabaseRef.current
    const myClientId = clientIdRef.current

    // ─── Create a peer connection ─────────────────────────────────────────────
    function createPeerConnection(
      peerId: string,
      peerUserId: string,
      initiator: boolean,
      rtChannel: RealtimeChannel,
      stream: MediaStream
    ): RTCPeerConnection {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      })

      peerConnections.current.set(peerId, pc)

      // Add local audio tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      // Trickle ICE via Broadcast
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          rtChannel.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { to: peerId, from: myClientId, candidate },
          })
        }
      }

      // Receive remote audio stream
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        setPeers((prev) => {
          const next = new Map(prev)
          const existing = next.get(peerId)
          next.set(peerId, {
            stream: remoteStream,
            speaking: existing?.speaking ?? false,
            muted: existing?.muted ?? false,
            userId: peerUserId,
          })
          return next
        })
      }

      // Initiator creates and sends offer
      if (initiator) {
        pc.onnegotiationneeded = async () => {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          rtChannel.send({
            type: "broadcast",
            event: "offer",
            payload: { to: peerId, from: myClientId, offer, userId },
          })
        }
      }

      // Add placeholder entry immediately so the tile appears
      setPeers((prev) => {
        const next = new Map(prev)
        if (!next.has(peerId)) {
          next.set(peerId, {
            stream: new MediaStream(),
            speaking: false,
            muted: false,
            userId: peerUserId,
          })
        }
        return next
      })

      return pc
    }

    // ─── Handle a peer (either existing at join time or newly arrived) ─────────
    // We use a deterministic initiator rule to avoid offer glare:
    // the client with the lexicographically greater clientId always initiates.
    function handlePeer(
      peerClientId: string,
      peerUserId: string,
      rtChannel: RealtimeChannel,
      stream: MediaStream
    ) {
      if (peerClientId === myClientId) return
      if (peerConnections.current.has(peerClientId)) return

      const initiator = myClientId > peerClientId
      createPeerConnection(peerClientId, peerUserId, initiator, rtChannel, stream)
    }

    async function init() {
      try {
        // Acquire microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
        localStream.current = stream

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Create Supabase Realtime channel for this voice room
        const rtChannel = supabase.channel(`voice-room:${channelId}`, {
          config: {
            // self: false → we don't receive our own broadcast messages
            broadcast: { self: false },
            presence: { key: myClientId },
          },
        })
        channelRef.current = rtChannel

        // ─── Broadcast: WebRTC offer ────────────────────────────────────────────
        rtChannel.on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (payload.to !== myClientId || !mounted) return
          const from = payload.from as string

          let pc = peerConnections.current.get(from)
          if (!pc) {
            // Peer initiated, we are the non-initiator
            pc = createPeerConnection(from, payload.userId as string, false, rtChannel, stream)
          }

          await pc.setRemoteDescription(payload.offer as RTCSessionDescriptionInit)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          rtChannel.send({
            type: "broadcast",
            event: "answer",
            payload: { to: from, from: myClientId, answer },
          })
        })

        // ─── Broadcast: WebRTC answer ───────────────────────────────────────────
        rtChannel.on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.to !== myClientId) return
          const pc = peerConnections.current.get(payload.from as string)
          if (pc) await pc.setRemoteDescription(payload.answer as RTCSessionDescriptionInit)
        })

        // ─── Broadcast: ICE candidates ──────────────────────────────────────────
        rtChannel.on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.to !== myClientId) return
          const pc = peerConnections.current.get(payload.from as string)
          if (pc) await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit)
        })

        // ─── Broadcast: peer voice state ────────────────────────────────────────
        rtChannel.on("broadcast", { event: "peer-speaking" }, ({ payload }) => {
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(payload.from as string)
            if (peer) next.set(payload.from as string, { ...peer, speaking: payload.speaking as boolean })
            return next
          })
        })

        rtChannel.on("broadcast", { event: "peer-muted" }, ({ payload }) => {
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(payload.from as string)
            if (peer) next.set(payload.from as string, { ...peer, muted: payload.muted as boolean })
            return next
          })
        })

        // ─── Presence: new peer joined after us ────────────────────────────────
        rtChannel.on("presence", { event: "join" }, ({ newPresences }) => {
          if (!mounted) return
          for (const p of (newPresences as unknown) as Array<{ client_id: string; user_id: string }>) {
            handlePeer(p.client_id, p.user_id, rtChannel, stream)
          }
        })

        // ─── Presence: peer left ───────────────────────────────────────────────
        rtChannel.on("presence", { event: "leave" }, ({ leftPresences }) => {
          for (const p of (leftPresences as unknown) as Array<{ client_id: string }>) {
            const pc = peerConnections.current.get(p.client_id)
            pc?.close()
            peerConnections.current.delete(p.client_id)
            setPeers((prev) => {
              const next = new Map(prev)
              next.delete(p.client_id)
              return next
            })
          }
        })

        // Subscribe and announce our presence
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Realtime subscription timeout")), 10000)
          rtChannel.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timeout)
              // Announce ourselves to the room
              await rtChannel.track({ client_id: myClientId, user_id: userId })

              // Connect to any peers already in the room
              const state = rtChannel.presenceState<{ client_id: string; user_id: string }>()
              for (const presences of Object.values(state)) {
                for (const p of presences) {
                  handlePeer(p.client_id, p.user_id, rtChannel, stream)
                }
              }
              resolve()
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timeout)
              reject(new Error(`Realtime channel ${status}`))
            }
          })
        })

        // ─── Voice Activity Detection ──────────────────────────────────────────
        try {
          const { default: hark } = await import("hark")
          const speechEvents = hark(stream, { interval: 50, threshold: -65 })
          harkRef.current = speechEvents

          speechEvents.on("speaking", () => {
            if (!mounted) return
            setSpeaking(true)
            channelRef.current?.send({
              type: "broadcast",
              event: "peer-speaking",
              payload: { from: myClientId, speaking: true },
            })
          })

          speechEvents.on("stopped_speaking", () => {
            if (!mounted) return
            setSpeaking(false)
            channelRef.current?.send({
              type: "broadcast",
              event: "peer-speaking",
              payload: { from: myClientId, speaking: false },
            })
          })
        } catch (e) {
          console.warn("hark VAD failed to load:", e)
        }
      } catch (error) {
        console.error("Voice init failed:", error)
      }
    }

    init()

    return () => {
      mounted = false
      harkRef.current?.stop()
      localStream.current?.getTracks().forEach((t) => t.stop())
      screenStream.current?.getTracks().forEach((t) => t.stop())
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
    }
  }, [channelId, userId])

  const toggleMute = useCallback(() => {
    const tracks = localStream.current?.getAudioTracks() ?? []
    const newMuted = !muted
    tracks.forEach((t) => { t.enabled = !newMuted })
    setMuted(newMuted)
    channelRef.current?.send({
      type: "broadcast",
      event: "peer-muted",
      payload: { from: clientIdRef.current, muted: newMuted },
    })
  }, [muted])

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => !prev)
  }, [])

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      screenStream.current?.getTracks().forEach((t) => t.stop())
      screenStream.current = null
      setScreenSharing(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" } as MediaTrackConstraints,
          audio: false,
        })
        screenStream.current = stream
        setScreenSharing(true)

        // Replace/add video track in all peer connections
        peerConnections.current.forEach((pc) => {
          const [videoTrack] = stream.getVideoTracks()
          const sender = pc.getSenders().find((s) => s.track?.kind === "video")
          if (sender) sender.replaceTrack(videoTrack)
          else pc.addTrack(videoTrack, stream)
        })

        stream.getVideoTracks()[0].onended = () => {
          screenStream.current = null
          setScreenSharing(false)
        }
      } catch (err) {
        // AbortError = user dismissed picker, NotAllowedError = permission denied
        if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError")) {
          return
        }
        console.error("Screen share failed:", err)
      }
    }
  }, [screenSharing])

  const toggleVideo = useCallback(async () => {
    if (videoEnabled) {
      cameraStream.current?.getTracks().forEach((t) => t.stop())
      cameraStream.current = null
      setVideoEnabled(false)
      peerConnections.current.forEach((pc) => {
        pc.getSenders().filter((s) => s.track?.kind === "video" && !screenSharing)
          .forEach((s) => { try { pc.removeTrack(s) } catch {} })
      })
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        cameraStream.current = stream
        setVideoEnabled(true)
        peerConnections.current.forEach((pc) => {
          const [videoTrack] = stream.getVideoTracks()
          const sender = pc.getSenders().find((s) => s.track?.kind === "video")
          if (sender) sender.replaceTrack(videoTrack)
          else pc.addTrack(videoTrack, stream)
        })
        stream.getVideoTracks()[0].onended = () => {
          cameraStream.current = null
          setVideoEnabled(false)
        }
      } catch (e) {
        console.log("Camera access failed:", e)
      }
    }
  }, [videoEnabled, screenSharing])

  const leaveChannel = useCallback(() => {
    harkRef.current?.stop()
    localStream.current?.getTracks().forEach((t) => t.stop())
    screenStream.current?.getTracks().forEach((t) => t.stop())
    cameraStream.current?.getTracks().forEach((t) => t.stop())
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
    peerConnections.current.forEach((pc) => pc.close())
    peerConnections.current.clear()
    setPeers(new Map())
  }, [])

  return {
    peers,
    muted,
    deafened,
    speaking,
    screenSharing,
    videoEnabled,
    localStream,
    screenStream,
    cameraStream,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleVideo,
    leaveChannel,
  }
}
