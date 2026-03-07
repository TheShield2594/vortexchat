"use client"

/**
 * use-livekit-voice.ts
 *
 * Livekit SFU-based voice hook — a scalable alternative to the P2P WebRTC
 * mesh in use-voice.ts. Activated when NEXT_PUBLIC_LIVEKIT_URL is set.
 *
 * Architecture:
 *  - Server issues a short-lived JWT via POST /api/.../voice-token
 *  - Client connects to Livekit SFU using the token
 *  - The SFU handles all audio routing, so this works for any group size
 *
 * Usage:
 *   const voice = useLivekitVoice({ channelId, serverId, userId, enabled })
 *   // voice.participants — Map<userId, ParticipantState>
 *   // voice.toggleMute(), voice.toggleDeafen(), voice.leave()
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  RemoteTrackPublication,
  LocalParticipant,
  ConnectionState,
  ParticipantEvent,
  type RoomConnectOptions,
  LocalTrackPublication,
} from "livekit-client"

export interface LivekitParticipantState {
  userId: string
  displayName: string
  speaking: boolean
  muted: boolean
  videoEnabled: boolean
  cameraTrack: MediaStreamTrack | null
  audioTrack: MediaStreamTrack | null
}

export interface LivekitVoiceReturn {
  connected: boolean
  connecting: boolean
  error: string | null
  participants: Map<string, LivekitParticipantState>
  localParticipant: LivekitParticipantState | null
  muted: boolean
  deafened: boolean
  speaking: boolean
  videoEnabled: boolean
  screenShareEnabled: boolean
  screenTrack: MediaStreamTrack | null
  audioInputDevices: MediaDeviceInfo[]
  audioOutputDevices: MediaDeviceInfo[]
  selectedInputId: string | null
  selectedOutputId: string | null
  toggleMute: () => Promise<void>
  toggleDeafen: () => void
  toggleVideo: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  setInputDevice: (deviceId: string) => Promise<void>
  setOutputDevice: (deviceId: string) => Promise<void>
  leave: () => void
  room: Room | null
}

interface UseLivekitVoiceArgs {
  channelId: string
  serverId: string
  userId: string
  enabled: boolean
}

function participantToState(p: Participant): LivekitParticipantState {
  const audioTrack = p.getTrackPublications().find(
    (pub) => pub.track?.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack
  )?.track?.mediaStreamTrack ?? null

  const videoTrack = p.getTrackPublications().find(
    (pub) => pub.track?.kind === Track.Kind.Video && pub.track?.mediaStreamTrack
  )?.track?.mediaStreamTrack ?? null

  return {
    userId: p.identity,
    displayName: p.name ?? p.identity,
    speaking: p.isSpeaking,
    muted: p.isMicrophoneEnabled === false,
    videoEnabled: p.isCameraEnabled,
    cameraTrack: videoTrack,
    audioTrack,
  }
}

export function useLivekitVoice({
  channelId,
  serverId,
  userId,
  enabled,
}: UseLivekitVoiceArgs): LivekitVoiceReturn {
  const roomRef = useRef<Room | null>(null)
  const isDeafRef = useRef(false)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [participants, setParticipants] = useState<Map<string, LivekitParticipantState>>(new Map())
  const [localParticipant, setLocalParticipant] = useState<LivekitParticipantState | null>(null)
  const [screenShareEnabled, setScreenShareEnabled] = useState(false)
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null)
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null)
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null)

  const refreshParticipants = useCallback((room: Room) => {
    const map = new Map<string, LivekitParticipantState>()
    for (const [, p] of room.remoteParticipants) {
      map.set(p.identity, participantToState(p))
    }
    setParticipants(map)

    if (room.localParticipant) {
      setLocalParticipant(participantToState(room.localParticipant))
      setSpeaking(room.localParticipant.isSpeaking)
      setMuted(!room.localParticipant.isMicrophoneEnabled)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    roomRef.current = room

    async function connect() {
      setConnecting(true)
      setError(null)

      try {
        // Fetch a token from our API
        const res = await fetch(
          `/api/servers/${serverId}/channels/${channelId}/voice-token`,
          { method: "POST" }
        )

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? "Failed to get voice token")
        }

        const { token, url } = await res.json() as { token: string; url: string }

        if (cancelled) return

        const connectOptions: RoomConnectOptions = {
          autoSubscribe: true,
        }

        await room.connect(url, token, connectOptions)

        if (cancelled) {
          room.disconnect()
          return
        }

        // Publish microphone
        await room.localParticipant.setMicrophoneEnabled(true)

        setConnected(true)
        setConnecting(false)
        refreshParticipants(room)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Connection failed")
          setConnecting(false)
        }
      }
    }

    // Wire up events
    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        refreshParticipants(room)
        console.log(`[Livekit] participant joined: ${p.identity}`)
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        refreshParticipants(room)
        console.log(`[Livekit] participant left: ${p.identity}`)
      })
      .on(RoomEvent.TrackSubscribed, (track, pub) => {
        if (isDeafRef.current && track.kind === Track.Kind.Audio) {
          pub.setSubscribed(false)
        }
        refreshParticipants(room)
      })
      .on(RoomEvent.TrackUnsubscribed, () => refreshParticipants(room))
      .on(RoomEvent.TrackPublished, () => refreshParticipants(room))
      .on(RoomEvent.TrackUnpublished, () => refreshParticipants(room))
      .on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room))
      .on(RoomEvent.LocalTrackPublished, () => refreshParticipants(room))
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          setConnected(true)
          setConnecting(false)
        } else if (state === ConnectionState.Disconnected) {
          setConnected(false)
        } else if (state === ConnectionState.Reconnecting) {
          setConnecting(true)
        }
      })
      .on(RoomEvent.Disconnected, () => {
        setConnected(false)
        setConnecting(false)
        setParticipants(new Map())
        setLocalParticipant(null)
      })

    // Local speaking detection
    room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, (isSpeaking: boolean) => {
      setSpeaking(isSpeaking)
    })

    // Track local screen-share publications
    room
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.source === Track.Source.ScreenShare) {
          setScreenShareEnabled(true)
          setScreenTrack(pub.track.mediaStreamTrack ?? null)
        }
        refreshParticipants(room)
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) {
          setScreenShareEnabled(false)
          setScreenTrack(null)
        }
        refreshParticipants(room)
      })

    // Enumerate devices once the connection is established
    async function enumerateDevices() {
      try {
        const [inputs, outputs] = await Promise.all([
          Room.getLocalDevices("audioinput"),
          Room.getLocalDevices("audiooutput"),
        ])
        setAudioInputDevices(inputs)
        setAudioOutputDevices(outputs)
      } catch {
        // Device enumeration may fail in restricted environments; safe to ignore
      }
    }

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        enumerateDevices()
      }
    })

    connect()

    return () => {
      cancelled = true
      room.disconnect()
      roomRef.current = null
      setConnected(false)
      setConnecting(false)
      setParticipants(new Map())
      setLocalParticipant(null)
    }
  }, [enabled, channelId, serverId, refreshParticipants])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const nextMuted = !muted
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted)
      setMuted(nextMuted)
    } catch (err) {
      console.error("[Livekit] Failed to toggle microphone", err)
    }
  }, [muted])

  const toggleDeafen = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const nextDeafened = !deafened
    isDeafRef.current = nextDeafened
    // Subscribe/unsubscribe all remote audio tracks
    for (const [, participant] of room.remoteParticipants) {
      for (const pub of participant.getTrackPublications()) {
        if (pub.kind === Track.Kind.Audio) {
          ;(pub as RemoteTrackPublication).setSubscribed(!nextDeafened)
        }
      }
    }
    setDeafened(nextDeafened)
  }, [deafened])

  const toggleVideo = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const nextEnabled = !videoEnabled
    try {
      await room.localParticipant.setCameraEnabled(nextEnabled)
      setVideoEnabled(nextEnabled)
      refreshParticipants(room)
    } catch (err) {
      console.error("[Livekit] Failed to toggle camera", err)
    }
  }, [videoEnabled, refreshParticipants])

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !screenShareEnabled
    try {
      await room.localParticipant.setScreenShareEnabled(next)
      // State is updated via LocalTrackPublished / LocalTrackUnpublished events
    } catch (err) {
      console.error("[Livekit] Failed to toggle screen share", err)
    }
  }, [screenShareEnabled])

  const setInputDevice = useCallback(async (deviceId: string) => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice("audioinput", deviceId)
      setSelectedInputId(deviceId)
    } catch (err) {
      console.error("[Livekit] Failed to switch audio input", err)
    }
  }, [])

  const setOutputDevice = useCallback(async (deviceId: string) => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice("audiooutput", deviceId)
      setSelectedOutputId(deviceId)
    } catch (err) {
      console.error("[Livekit] Failed to switch audio output", err)
    }
  }, [])

  const leave = useCallback(() => {
    roomRef.current?.disconnect()
  }, [])

  return {
    connected,
    connecting,
    error,
    participants,
    localParticipant,
    muted,
    deafened,
    speaking,
    videoEnabled,
    screenShareEnabled,
    screenTrack,
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    setInputDevice,
    setOutputDevice,
    leave,
    room: roomRef.current,
  }
}
