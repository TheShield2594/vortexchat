"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createInputAudioPipeline } from "@/lib/voice/audio-pipeline"
import { type VoiceAudioSettings } from "@/lib/voice/audio-settings"
import { useVoiceAudioStore } from "@/lib/stores/voice-audio-store"

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
  audioInputDevices: MediaDeviceInfo[]
  audioOutputDevices: MediaDeviceInfo[]
  selectedInputId: string | null
  selectedOutputId: string | null
  setSelectedInputId: (id: string | null) => void
  setSelectedOutputId: (id: string | null) => void
  audioSettings: VoiceAudioSettings
  setAudioSettings: (settings: VoiceAudioSettings) => void
  cpuBypassActive: boolean
  audioInitError: string | null
}

const HEARTBEAT_INTERVAL_MS = 5000
const DEFAULT_STALE_PEER_TIMEOUT_MS = 45000
const envStalePeerTimeout = Number.parseInt(process.env.NEXT_PUBLIC_VOICE_STALE_PEER_TIMEOUT_MS ?? "", 10)
const STALE_PEER_TIMEOUT_MS = Number.isFinite(envStalePeerTimeout) && envStalePeerTimeout >= HEARTBEAT_INTERVAL_MS * 3
  ? envStalePeerTimeout
  : DEFAULT_STALE_PEER_TIMEOUT_MS

/** Manages WebRTC peer connections, media streams, audio processing, and signaling for a voice channel. */
export function useVoice(channelId: string, userId: string, serverId?: string | null): UseVoiceReturn {
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [cpuBypassActive, setCpuBypassActive] = useState(false)
  const [audioInitError, setAudioInitError] = useState<string | null>(null)
  const [rawLocalStream, setRawLocalStream] = useState<MediaStream | null>(null)

  const localStream = useRef<MediaStream | null>(null)
  const rawLocalStreamRef = useRef<MediaStream | null>(null)
  const screenStream = useRef<MediaStream | null>(null)
  const cameraStream = useRef<MediaStream | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const harkRef = useRef<{ stop: () => void } | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const pipelineCleanupRef = useRef<(() => void) | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const staleGcTimerRef = useRef<number | null>(null)
  const lastSeenByPeerRef = useRef<Map<string, number>>(new Map())
  const mutedRef = useRef(false)
  const speakingRef = useRef(false)

  const clientIdRef = useRef<string>(crypto.randomUUID())
  const supabaseRef = useRef(createClientSupabaseClient())

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null)
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null)

  const profileSettings = useVoiceAudioStore((state) => state.profilesByUser[userId])
  const serverOverrideSettings = useVoiceAudioStore((state) =>
    serverId ? state.serverOverridesByUser[userId]?.[serverId] : undefined
  )
  const setProfileSettings = useVoiceAudioStore((state) => state.setProfileSettings)
  const setServerOverride = useVoiceAudioStore((state) => state.setServerOverride)

  const audioSettings = useMemo(() => {
    if (serverOverrideSettings) return serverOverrideSettings
    if (profileSettings) return profileSettings
    return useVoiceAudioStore.getState().getEffectiveSettings(userId, serverId)
  }, [profileSettings, serverOverrideSettings, userId, serverId])

  const setAudioSettings = useCallback((settings: VoiceAudioSettings) => {
    if (serverId) setServerOverride(userId, serverId, settings)
    else setProfileSettings(userId, settings)
  }, [serverId, userId, setProfileSettings, setServerOverride])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  const cleanupVoiceSession = useCallback((supabaseClient = supabaseRef.current) => {
    harkRef.current?.stop()
    pipelineCleanupRef.current?.()
    pipelineCleanupRef.current = null

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }

    rawLocalStreamRef.current?.getTracks().forEach((t) => t.stop())
    rawLocalStreamRef.current = null
    setRawLocalStream(null)

    screenStream.current?.getTracks().forEach((t) => t.stop())
    cameraStream.current?.getTracks().forEach((t) => t.stop())

    if (channelRef.current) {
      supabaseClient.removeChannel(channelRef.current)
      channelRef.current = null
    }

    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }

    if (staleGcTimerRef.current) {
      window.clearInterval(staleGcTimerRef.current)
      staleGcTimerRef.current = null
    }

    lastSeenByPeerRef.current.clear()

    peerConnections.current.forEach((pc) => pc.close())
    peerConnections.current.clear()
  }, [])

  useEffect(() => {
    if (!navigator.mediaDevices) return
    async function enumerateDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setAudioInputDevices(devices.filter((d) => d.kind === "audioinput"))
        setAudioOutputDevices(devices.filter((d) => d.kind === "audiooutput"))
      } catch {
        // ignore
      }
    }
    enumerateDevices()
    navigator.mediaDevices.addEventListener("devicechange", enumerateDevices)
    return () => navigator.mediaDevices.removeEventListener("devicechange", enumerateDevices)
  }, [])

  useEffect(() => {
    if (!rawLocalStream) return

    pipelineCleanupRef.current?.()
    pipelineCleanupRef.current = null

    const pipeline = createInputAudioPipeline(rawLocalStream, audioSettings, audioContextRef)
    pipelineCleanupRef.current = pipeline.cleanup
    localStream.current = pipeline.processedStream
    setCpuBypassActive(pipeline.constrainedCpu)

    const nextTrack = pipeline.processedStream.getAudioTracks()[0]
    if (nextTrack) {
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio")
        if (sender) sender.replaceTrack(nextTrack).catch(() => undefined)
      })
    }

    return () => {
      pipelineCleanupRef.current?.()
      pipelineCleanupRef.current = null
    }
  }, [audioSettings, rawLocalStream])

  useEffect(() => {
    let mounted = true
    const supabase = supabaseRef.current
    const myClientId = clientIdRef.current

    function createPeerConnection(
      peerId: string,
      peerUserId: string,
      initiator: boolean,
      rtChannel: RealtimeChannel,
      stream: MediaStream
    ): RTCPeerConnection {
      const iceServers: RTCIceServer[] = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ]
      const turnUrl = process.env.NEXT_PUBLIC_TURN_URL
      const turnsUrl = process.env.NEXT_PUBLIC_TURNS_URL
      const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME
      const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
      if (turnUrl && turnUsername && turnCredential) {
        const urls: string[] = [turnUrl]
        if (turnsUrl) urls.push(turnsUrl)
        iceServers.push({ urls, username: turnUsername, credential: turnCredential })
      }

      const pc = new RTCPeerConnection({ iceServers })
      peerConnections.current.set(peerId, pc)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          rtChannel.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { to: peerId, from: myClientId, candidate },
          })
        }
      }

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
          rtChannel.send({
            type: "broadcast",
            event: "offer",
            payload: { to: peerId, from: myClientId, offer, userId },
          })
        }
      }

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

    function handlePeer(peerClientId: string, peerUserId: string, rtChannel: RealtimeChannel, stream: MediaStream) {
      if (peerClientId === myClientId) return
      if (peerConnections.current.has(peerClientId)) return
      lastSeenByPeerRef.current.set(peerClientId, Date.now())
      const initiator = myClientId > peerClientId
      createPeerConnection(peerClientId, peerUserId, initiator, rtChannel, stream)
    }

    async function init() {
      try {
        setAudioInitError(null)
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
        if (selectedInputId) audioConstraints.deviceId = { ideal: selectedInputId }
        const rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
        // Keep both in sync intentionally:
        // - rawLocalStreamRef is for synchronous access in callbacks/event handlers
        // - rawLocalStream state triggers the pipeline effect reactively
        rawLocalStreamRef.current = rawStream
        setRawLocalStream(rawStream)

        if (!mounted) {
          rawStream.getTracks().forEach((t) => t.stop())
          return
        }

        const rtChannel = supabase.channel(`voice-room:${channelId}`, {
          config: { broadcast: { self: false }, presence: { key: myClientId } },
        })
        channelRef.current = rtChannel

        rtChannel.on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (payload.to !== myClientId || !mounted) return
          const from = payload.from as string

          let pc = peerConnections.current.get(from)
          if (!pc) {
            pc = createPeerConnection(from, payload.userId as string, false, rtChannel, localStream.current ?? rawStream)
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

        rtChannel.on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.to !== myClientId) return
          const pc = peerConnections.current.get(payload.from as string)
          if (pc) await pc.setRemoteDescription(payload.answer as RTCSessionDescriptionInit)
        })

        rtChannel.on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.to !== myClientId) return
          const pc = peerConnections.current.get(payload.from as string)
          if (pc) await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit)
        })

        rtChannel.on("broadcast", { event: "peer-speaking" }, ({ payload }) => {
          lastSeenByPeerRef.current.set(payload.from as string, Date.now())
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(payload.from as string)
            if (peer) next.set(payload.from as string, { ...peer, speaking: payload.speaking as boolean })
            return next
          })
        })

        rtChannel.on("broadcast", { event: "peer-muted" }, ({ payload }) => {
          lastSeenByPeerRef.current.set(payload.from as string, Date.now())
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(payload.from as string)
            if (peer) next.set(payload.from as string, { ...peer, muted: payload.muted as boolean })
            return next
          })
        })

        rtChannel.on("broadcast", { event: "peer-heartbeat" }, ({ payload }) => {
          const from = payload.from as string
          if (from === myClientId) return
          lastSeenByPeerRef.current.set(from, Date.now())
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(from)
            if (peer) {
              next.set(from, {
                ...peer,
                muted: Boolean(payload.muted),
                speaking: Boolean(payload.speaking),
              })
            }
            return next
          })
        })

        rtChannel.on("broadcast", { event: "peer-rejoin-request" }, ({ payload }) => {
          const requester = payload.from as string
          if (requester === myClientId) return
          channelRef.current?.send({
            type: "broadcast",
            event: "peer-rejoin-state",
            payload: {
              to: requester,
              from: myClientId,
              userId,
              muted: mutedRef.current,
              speaking: speakingRef.current,
            },
          })
        })

        rtChannel.on("broadcast", { event: "peer-rejoin-state" }, ({ payload }) => {
          if ((payload.to as string) !== myClientId) return
          const from = payload.from as string
          lastSeenByPeerRef.current.set(from, Date.now())
          handlePeer(from, payload.userId as string, rtChannel, localStream.current ?? rawStream)
          setPeers((prev) => {
            const next = new Map(prev)
            const peer = next.get(from)
            if (peer) {
              next.set(from, {
                ...peer,
                muted: Boolean(payload.muted),
                speaking: Boolean(payload.speaking),
              })
            }
            return next
          })
        })

        rtChannel.on("presence", { event: "join" }, ({ newPresences }) => {
          if (!mounted) return
          for (const p of (newPresences as unknown) as Array<{ client_id: string; user_id: string }>) {
            handlePeer(p.client_id, p.user_id, rtChannel, localStream.current ?? rawStream)
          }
        })

        rtChannel.on("presence", { event: "leave" }, ({ leftPresences }) => {
          for (const p of (leftPresences as unknown) as Array<{ client_id: string }>) {
            const pc = peerConnections.current.get(p.client_id)
            pc?.close()
            peerConnections.current.delete(p.client_id)
            lastSeenByPeerRef.current.delete(p.client_id)
            setPeers((prev) => {
              const next = new Map(prev)
              next.delete(p.client_id)
              return next
            })
          }
        })

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Realtime subscription timeout")), 10000)
          rtChannel.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timeout)
              await rtChannel.track({ client_id: myClientId, user_id: userId })

              channelRef.current?.send({
                type: "broadcast",
                event: "peer-rejoin-request",
                payload: { from: myClientId },
              })

              const sendHeartbeat = () => {
                channelRef.current?.send({
                  type: "broadcast",
                  event: "peer-heartbeat",
                  payload: {
                    from: myClientId,
                    userId,
                    muted: mutedRef.current,
                    speaking: speakingRef.current,
                  },
                })
              }

              sendHeartbeat()
              heartbeatTimerRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

              staleGcTimerRef.current = window.setInterval(() => {
                const now = Date.now()
                for (const [peerId, lastSeen] of lastSeenByPeerRef.current.entries()) {
                  if (now - lastSeen <= STALE_PEER_TIMEOUT_MS) continue
                  const pc = peerConnections.current.get(peerId)
                  const isConnected = pc?.connectionState === "connected"
                  const isIceConnected = pc?.iceConnectionState === "connected" || pc?.iceConnectionState === "completed"
                  const shouldKeepPeer = isConnected || isIceConnected
                  if (shouldKeepPeer) {
                    lastSeenByPeerRef.current.set(peerId, now)
                    continue
                  }

                  const isEvictableState = !pc
                    || pc.connectionState === "disconnected"
                    || pc.connectionState === "failed"
                    || pc.connectionState === "closed"
                    || pc.iceConnectionState === "disconnected"
                    || pc.iceConnectionState === "failed"
                    || pc.iceConnectionState === "closed"
                  if (!isEvictableState) continue

                  pc?.close()
                  peerConnections.current.delete(peerId)
                  lastSeenByPeerRef.current.delete(peerId)
                  setPeers((prev) => {
                    const next = new Map(prev)
                    next.delete(peerId)
                    return next
                  })
                }
              }, HEARTBEAT_INTERVAL_MS)

              const state = rtChannel.presenceState<{ client_id: string; user_id: string }>()
              for (const presences of Object.values(state)) {
                for (const p of presences) {
                  handlePeer(p.client_id, p.user_id, rtChannel, localStream.current ?? rawStream)
                }
              }
              resolve()
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timeout)
              reject(new Error(`Realtime channel ${status}`))
            }
          })
        })

        try {
          const { default: hark } = await import("hark")
          const speechEvents = hark(rawStream, { interval: 100, threshold: -65 })
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
      } catch (error: any) {
        const errMsg = error?.message ?? String(error)
        let userMessage: string
        if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
          userMessage = "Microphone permission denied. Check browser permissions."
        } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
          userMessage = "No microphone found. Connect a mic and try again."
        } else if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
          userMessage = "Microphone is in use by another app."
        } else if (error?.name === "OverconstrainedError") {
          userMessage = "Microphone doesn't support the requested settings. Try a different device."
        } else if (errMsg.includes("timeout") || errMsg.includes("TIMED_OUT")) {
          userMessage = "Realtime connection timed out. Check network."
        } else if (errMsg.includes("CHANNEL_ERROR")) {
          userMessage = "Realtime channel error. Check Supabase config."
        } else {
          userMessage = "Voice initialization failed. Please try again."
        }
        setAudioInitError(userMessage)
        console.error("[useVoice] init failed:", { name: error?.name, message: errMsg, error })
      }
    }

    init()

    return () => {
      mounted = false
      cleanupVoiceSession(supabase)
    }
  }, [channelId, userId, selectedInputId, cleanupVoiceSession])

  const toggleMute = useCallback(() => {
    const tracks = rawLocalStreamRef.current?.getAudioTracks() ?? []
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
        if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError")) return
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
          .forEach((s) => { try { pc.removeTrack(s) } catch { /* noop */ } })
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
    cleanupVoiceSession()
    setPeers(new Map())
  }, [cleanupVoiceSession])

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
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    audioSettings,
    setAudioSettings,
    cpuBypassActive,
    audioInitError,
  }
}
