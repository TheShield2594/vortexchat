"use client"

import { useRef, useMemo } from "react"
import {
  useVoice,
  type NetworkQualityTier,
  type NetworkQualityStats,
  type ReconnectInfo,
} from "@/lib/webrtc/use-voice"
import { useLivekitVoice } from "@/lib/webrtc/use-livekit-voice"
import { createDefaultAudioSettings, type VoiceAudioSettings } from "@/lib/voice/audio-settings"

/** Build-time flag — truthy when NEXT_PUBLIC_LIVEKIT_URL is set. */
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

const EMPTY_DEVICES: MediaDeviceInfo[] = []

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

// ── LiveKit SFU adapter ──────────────────────────────────────────────────────

/**
 * Wraps useLivekitVoice and adapts its return value to the same interface as
 * useVoice so that VoiceChannel can consume either path identically.
 *
 * Fields that the LiveKit SFU path does not yet expose (screen share, per-device
 * selection, EQ/gain, spatial audio, CPU bypass) are stubbed with sensible
 * defaults or no-ops.  They can be promoted to real implementations once the
 * LiveKit hook is extended.
 */
function useVoiceViaLivekit(
  channelId: string,
  userId: string,
  serverId?: string | null,
): ReturnType<typeof useVoice> {
  // Stable null refs — VoiceChannel passes these to VoiceIntelligence and the
  // local participant tile.  Null is safe; both consumers handle a null stream.
  const nullLocalStreamRef = useRef<MediaStream | null>(null)
  const nullScreenStreamRef = useRef<MediaStream | null>(null)
  const nullCameraStreamRef = useRef<MediaStream | null>(null)

  // Persist MediaStream instances across renders to avoid re-mounting audio
  // elements every time a participant state field (speaking, muted) changes.
  const streamCacheRef = useRef(new Map<string, MediaStream>())

  const lk = useLivekitVoice({
    channelId,
    serverId: serverId ?? "",
    userId,
    enabled: !!channelId,
  })

  // Build a Map<peerId, PeerState>-compatible map from LiveKit participants.
  // The map key is the LiveKit identity (userId) rather than an ephemeral
  // signaling peer ID — all downstream consumers use the userId field for
  // display and per-participant audio controls, so this is equivalent.
  const peers = useMemo(() => {
    const map = new Map<string, {
      stream: MediaStream
      speaking: boolean
      muted: boolean
      userId: string
    }>()
    const seen = new Set<string>()

    for (const [uid, p] of lk.participants) {
      seen.add(uid)

      // Reuse the cached stream so downstream audio/video elements aren't
      // re-created on every speaking/muted state change.
      let stream = streamCacheRef.current.get(uid)
      if (!stream) {
        stream = new MediaStream()
        streamCacheRef.current.set(uid, stream)
      }

      // Sync tracks by MediaStreamTrack.id to avoid duplicates or stale refs.
      const currentById = new Map(stream.getTracks().map((t) => [t.id, t]))
      const desired = [p.audioTrack, p.cameraTrack].filter(
        (t): t is MediaStreamTrack => t !== null,
      )
      const desiredIds = new Set(desired.map((t) => t.id))

      for (const [id, t] of currentById) {
        if (!desiredIds.has(id)) stream.removeTrack(t)
      }
      for (const t of desired) {
        if (!currentById.has(t.id)) stream.addTrack(t)
      }

      map.set(uid, { stream, speaking: p.speaking, muted: p.muted, userId: uid })
    }

    // Evict streams for participants who have left the room.
    for (const uid of [...streamCacheRef.current.keys()]) {
      if (!seen.has(uid)) streamCacheRef.current.delete(uid)
    }

    return map
  }, [lk.participants])

  // Derive a ReconnectInfo from LiveKit's connected/connecting booleans.
  const reconnectInfo = useMemo<ReconnectInfo>(() => {
    if (lk.connecting) return { state: "reconnecting", attempt: 1, maxAttempts: 3 }
    if (!lk.connected) return { state: "disconnected", attempt: 0, maxAttempts: 3 }
    return { state: "connected", attempt: 0, maxAttempts: 3 }
  }, [lk.connected, lk.connecting])

  // LiveKit Room manages its own audio processing pipeline internally, so the
  // P2P-specific EQ/gain/spatial settings are returned as read-only defaults.
  const defaultAudioSettings = useMemo(() => createDefaultAudioSettings(), [])

  return {
    peers,
    muted: lk.muted,
    deafened: lk.deafened,
    speaking: lk.speaking,
    // Screen share is not yet surfaced by useLivekitVoice; always false until
    // the LiveKit hook is extended with getDisplayMedia support.
    screenSharing: false,
    videoEnabled: lk.videoEnabled,
    // LiveKit toggleMute is async; fire-and-forget to match () => void signature.
    toggleMute: () => { lk.toggleMute().catch(() => {}) },
    toggleDeafen: lk.toggleDeafen,
    // Screen share no-op — see screenSharing comment above.
    toggleScreenShare: noop,
    toggleVideo: lk.toggleVideo,
    leaveChannel: lk.leave,
    localStream: nullLocalStreamRef,
    screenStream: nullScreenStreamRef,
    cameraStream: nullCameraStreamRef,
    // LiveKit Room enumerates and manages devices internally; expose empty
    // lists so the device selector panel renders cleanly in SFU mode.
    audioInputDevices: EMPTY_DEVICES,
    audioOutputDevices: EMPTY_DEVICES,
    selectedInputId: null,
    selectedOutputId: null,
    setSelectedInputId: noop,
    setSelectedOutputId: noop,
    audioSettings: defaultAudioSettings,
    setAudioSettings: noop as (s: VoiceAudioSettings) => void,
    cpuBypassActive: false,
    audioInitError: lk.error,
    networkQuality: null,
    reconnectInfo,
    manualReconnect: noop,
  }
}

// ── Raw WebRTC P2P pass-through ───────────────────────────────────────────────

function useVoiceViaP2P(
  channelId: string,
  userId: string,
  serverId?: string | null,
): ReturnType<typeof useVoice> {
  return useVoice(channelId, userId, serverId)
}

// ── Unified export ────────────────────────────────────────────────────────────

/**
 * useUnifiedVoice — single entrypoint for all voice functionality.
 *
 * Delegates to the LiveKit SFU path when NEXT_PUBLIC_LIVEKIT_URL is set at
 * build time, otherwise falls back to the raw RTCPeerConnection / Supabase
 * Realtime P2P path.
 *
 * The selection is a module-level constant assignment so the same concrete
 * function is always called during a session — hook call order is stable
 * across renders and complies with React's Rules of Hooks.
 */
export const useUnifiedVoice: typeof useVoiceViaP2P = LIVEKIT_URL
  ? (useVoiceViaLivekit as typeof useVoiceViaP2P)
  : useVoiceViaP2P

// Re-export shared types so callers don't need to import from use-voice directly.
export type { NetworkQualityTier, NetworkQualityStats, ReconnectInfo }
