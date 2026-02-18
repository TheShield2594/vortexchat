"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { io, type Socket } from "socket.io-client"

interface PeerState {
  stream: MediaStream
  speaking: boolean
  muted: boolean
  userId: string
}

interface UseVoiceReturn {
  peers: Map<string, PeerState> | null
  muted: boolean
  deafened: boolean
  speaking: boolean
  screenSharing: boolean
  localStream: React.RefObject<MediaStream | null>
  screenStream: React.RefObject<MediaStream | null>
  toggleMute: () => void
  toggleDeafen: () => void
  toggleScreenShare: () => Promise<void>
  leaveChannel: () => void
}

export function useVoice(channelId: string, userId: string): UseVoiceReturn {
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)

  const localStream = useRef<MediaStream | null>(null)
  const screenStream = useRef<MediaStream | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const harkRef = useRef<any>(null)

  const signalUrl = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:3001"

  useEffect(() => {
    let cleanup = false

    async function init() {
      try {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
        localStream.current = stream

        // Set up voice activity detection
        try {
          const { default: hark } = await import("hark")
          const speechEvents = hark(stream, { interval: 50, threshold: -65 })
          harkRef.current = speechEvents
          speechEvents.on("speaking", () => {
            if (cleanup) return
            setSpeaking(true)
            socketRef.current?.emit("speaking", { speaking: true })
          })
          speechEvents.on("stopped_speaking", () => {
            if (cleanup) return
            setSpeaking(false)
            socketRef.current?.emit("speaking", { speaking: false })
          })
        } catch (e) {
          console.warn("hark VAD failed to load:", e)
        }

        if (cleanup) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Connect to signaling server
        const socket = io(signalUrl, {
          transports: ["websocket"],
          reconnectionAttempts: 5,
        })
        socketRef.current = socket

        socket.on("connect", () => {
          socket.emit("join-room", {
            channelId,
            userId,
          })
        })

        // Got list of existing peers — initiate connections
        socket.on("room-peers", (peerInfos: Array<{ peerId: string; userId: string }>) => {
          for (const { peerId, userId: peerUserId } of peerInfos) {
            createPeerConnection(peerId, peerUserId, true, socket, stream)
          }
        })

        // New peer joined — they will initiate
        socket.on("peer-joined", ({ peerId, userId: peerUserId }: { peerId: string; userId: string }) => {
          createPeerConnection(peerId, peerUserId, false, socket, stream)
        })

        socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
          const pc = peerConnections.current.get(from)
          if (!pc) return
          await pc.setRemoteDescription(offer)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit("answer", { to: from, answer })
        })

        socket.on("answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
          const pc = peerConnections.current.get(from)
          if (pc) await pc.setRemoteDescription(answer)
        })

        socket.on("ice-candidate", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
          const pc = peerConnections.current.get(from)
          if (pc) await pc.addIceCandidate(candidate)
        })

        socket.on("peer-left", ({ peerId }: { peerId: string }) => {
          const pc = peerConnections.current.get(peerId)
          pc?.close()
          peerConnections.current.delete(peerId)
          setPeers((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
        })

        socket.on("peer-speaking", ({ peerId, speaking }: { peerId: string; speaking: boolean }) => {
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(peerId)
            if (peer) next.set(peerId, { ...peer, speaking })
            return next
          })
        })

        socket.on("peer-muted", ({ peerId, muted }: { peerId: string; muted: boolean }) => {
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(peerId)
            if (peer) next.set(peerId, { ...peer, muted })
            return next
          })
        })
      } catch (error) {
        console.error("Voice init failed:", error)
      }
    }

    init()

    return () => {
      cleanup = true
      harkRef.current?.stop()
      localStream.current?.getTracks().forEach((t) => t.stop())
      screenStream.current?.getTracks().forEach((t) => t.stop())
      socketRef.current?.disconnect()
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
    }
  }, [channelId, userId])

  function createPeerConnection(
    peerId: string,
    peerUserId: string,
    initiator: boolean,
    socket: Socket,
    stream: MediaStream
  ) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    })

    peerConnections.current.set(peerId, pc)

    // Add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("ice-candidate", { to: peerId, candidate })
      }
    }

    // Remote stream
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

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit("offer", { to: peerId, offer })
      }
    }

    // Add peer entry immediately
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

  const toggleMute = useCallback(() => {
    const tracks = localStream.current?.getAudioTracks() ?? []
    const newMuted = !muted
    tracks.forEach((t) => { t.enabled = !newMuted })
    setMuted(newMuted)
    socketRef.current?.emit("toggle-mute", { muted: newMuted })
  }, [muted])

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => !prev)
    socketRef.current?.emit("toggle-deafen", { deafened: !deafened })
  }, [deafened])

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      // Stop screen share
      screenStream.current?.getTracks().forEach((t) => t.stop())
      screenStream.current = null
      setScreenSharing(false)
      socketRef.current?.emit("screen-share", { sharing: false })
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" } as any,
          audio: false,
        })
        screenStream.current = stream
        setScreenSharing(true)
        socketRef.current?.emit("screen-share", { sharing: true })

        // Replace video track in all peer connections
        peerConnections.current.forEach((pc) => {
          const [videoTrack] = stream.getVideoTracks()
          const sender = pc.getSenders().find((s) => s.track?.kind === "video")
          if (sender) sender.replaceTrack(videoTrack)
          else pc.addTrack(videoTrack, stream)
        })

        stream.getVideoTracks()[0].onended = () => {
          screenStream.current = null
          setScreenSharing(false)
          socketRef.current?.emit("screen-share", { sharing: false })
        }
      } catch (e) {
        console.log("Screen share cancelled or failed:", e)
      }
    }
  }, [screenSharing])

  const leaveChannel = useCallback(() => {
    harkRef.current?.stop()
    localStream.current?.getTracks().forEach((t) => t.stop())
    screenStream.current?.getTracks().forEach((t) => t.stop())
    socketRef.current?.disconnect()
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
    localStream,
    screenStream,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    leaveChannel,
  }
}
