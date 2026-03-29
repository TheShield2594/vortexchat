"use client"

/**
 * DM Voice/Video Call UI
 *
 * Architecture:
 * - Caller clicks Phone/Video button → broadcasts "call-offer" via Supabase Realtime
 * - Callee sees incoming call toast → accepts (broadcasts "call-answer") or rejects
 * - Both sides enter the call screen (WebRTC P2P via existing signaling API)
 * - Either party can hang up (broadcasts "call-hangup")
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Loader2, X } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils/cn"
import { useCallMediaToggles } from "@/lib/webrtc/use-call-media-toggles"
import { useVortexRecap } from "@/lib/voice/use-vortex-recap"
import { VortexRecapIndicator } from "@/components/voice/vortex-recap-indicator"
import { VoiceConsentModal } from "@/components/voice/voice-consent-modal"
import { VoiceTranscriptViewer } from "@/components/voice/voice-transcript-viewer"

interface Participant {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

interface IncomingCall {
  callerId: string
  callerName: string
  callerAvatar: string | null
  channelId: string
  withVideo: boolean
}

interface DMCallScreenProps {
  channelId: string
  currentUserId: string
  partner: Participant
  withVideo: boolean
  onHangUp: () => void
}

// ─── Call Screen (active call) ────────────────────────────────────────────────

/** Full-screen WebRTC call UI with local/remote video, mute/camera toggles, and signaling via Supabase Realtime. */
export function DMCallScreen({ channelId, currentUserId, partner, withVideo, onHangUp }: DMCallScreenProps) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const rtChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(!withVideo)
  const [connected, setConnected] = useState(false)
  const clientId = useRef(crypto.randomUUID())

  useEffect(() => {
    let mounted = true

    // Build ICE servers (same env var pattern as use-voice.ts)
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]
    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL
    const turnsUrl = process.env.NEXT_PUBLIC_TURNS_URL
    const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME
    const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    if (turnUrl && turnUser && turnCred) {
      const urls = [turnUrl, ...(turnsUrl ? [turnsUrl] : [])]
      iceServers.push({ urls, username: turnUser, credential: turnCred })
    }

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: withVideo,
      })
      if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return }
      localStreamRef.current = stream
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream }
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    }

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
      setConnected(true)
    }

    const rtChannel = supabase.channel(`dm-call:${channelId}`)
    rtChannelRef.current = rtChannel

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        rtChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "ice-candidate", candidate, from: clientId.current } })
      }
    }

    rtChannel
      .on("broadcast", { event: "call-signal" }, async ({ payload }) => {
        if (payload.from === clientId.current) return
        if (payload.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          rtChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "answer", answer, from: clientId.current } })
        } else if (payload.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer))
        } else if (payload.type === "ice-candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
        } else if (payload.type === "hangup") {
          onHangUp()
        }
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return
        await init()
        // Initiator rule: current user ID > partner ID → create offer
        if (currentUserId > partner.id) {
          pc.onnegotiationneeded = async () => {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            rtChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "offer", offer, from: clientId.current } })
          }
        }
      })

    return () => {
      mounted = false
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      pc.close()
      supabase.removeChannel(rtChannel)
    }
  }, [channelId, currentUserId, partner.id, withVideo])

  function handleHangUp() {
    // Broadcast hangup to partner on the live subscribed channel
    rtChannelRef.current?.send({ type: "broadcast", event: "call-signal", payload: { type: "hangup", from: clientId.current } })
    onHangUp()
  }

  // ── Voice Intelligence (DM call) ──────────────────────────────────────────
  const {
    session: viSession,
    policy: viPolicy,
    myConsent: viConsent,
    participantConsents: viParticipantConsents,
    transcriptionStatus: viTranscriptionStatus,
    interimSegment: viInterimSegment,
    finalSegments: viFinalSegments,
    summaryPending: viSummaryPending,
    startSession: viStartSession,
    setConsent: viSetConsent,
    endSession: viEndSession,
  } = useVortexRecap(currentUserId)

  const [showConsentModal, setShowConsentModal] = useState(false)

  // DM call: start intelligence session when connected.
  // Show consent modal (bilateral gate: if this user declines, transcription stays off).
  useEffect(() => {
    if (!connected) return
    viStartSession({
      scopeType: "dm_call",
      scopeId: channelId,
      localStream: localStreamRef.current,
      language: "en-US",
    })
      .then(() => {
        // Show consent modal for DM calls — bilateral consent required
        setShowConsentModal(true)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  // End intelligence session on unmount / hang-up.
  useEffect(() => {
    return () => {
      viEndSession().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // ── End Voice Intelligence ────────────────────────────────────────────────

  const { toggleMute, toggleVideo } = useCallMediaToggles({
    muted,
    videoOff,
    setMuted,
    setVideoOff,
    onToggleMute: (isMuted) => {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = isMuted
      })
    },
    onToggleVideo: (isVideoOff) => {
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff
      })
    },
  })

  const partnerName = partner.display_name || partner.username
  const initials = partnerName.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col items-center justify-between flex-1 p-6 relative" style={{ background: "var(--theme-bg-tertiary)" }}>
      {/* DM consent modal — bilateral gate */}
      {showConsentModal && (
        <VoiceConsentModal
          isDmCall
          onAccept={(consentTranscription, consentTranslation, subtitleLanguage) => {
            setShowConsentModal(false)
            viSetConsent(consentTranscription, consentTranslation, subtitleLanguage).catch(() => {})
          }}
          onDecline={() => {
            setShowConsentModal(false)
            viSetConsent(false, false, null).catch(() => {})
          }}
        />
      )}
      {/* Remote video / avatar */}
      <div className="flex-1 flex items-center justify-center w-full relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn("w-full max-h-[60vh] rounded-xl object-cover", !connected && "hidden")}
          style={{ background: "#000" }}
        />
        <audio ref={remoteAudioRef} autoPlay playsInline />
        {!connected && (
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24">
              {partner.avatar_url && <AvatarImage src={partner.avatar_url} alt={`${partnerName}'s avatar`} />}
              <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "32px" }}>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-white font-semibold text-lg">{partnerName}</div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Connecting…
            </div>
          </div>
        )}

        {/* Local video PiP */}
        {withVideo && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-32 h-24 rounded-lg object-cover border-2"
            style={{ borderColor: "var(--theme-accent)", background: "#000", transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* Intelligence indicator */}
      <VortexRecapIndicator
        transcriptionStatus={viTranscriptionStatus}
        summaryPending={viSummaryPending}
        participantConsents={viParticipantConsents}
        className="mb-2"
      />

      {/* Live transcript (only when consented) */}
      {viConsent?.consentTranscription && (
        <VoiceTranscriptViewer
          finalSegments={viFinalSegments}
          interimSegment={viInterimSegment}
          className="w-full mb-4"
        />
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={toggleMute}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
          style={{ background: muted ? "var(--theme-danger)" : "var(--theme-text-faint)" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
        </button>

        {withVideo && (
          <button
            onClick={toggleVideo}
            className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
            style={{ background: videoOff ? "var(--theme-danger)" : "var(--theme-text-faint)" }}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
          </button>
        )}

        <button
          onClick={handleHangUp}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "var(--theme-danger)" }}
          title="Hang up"
        >
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  )
}

// ─── Incoming Call Toast ───────────────────────────────────────────────────────

interface IncomingCallToastProps {
  call: IncomingCall
  onAccept: (withVideo: boolean) => void
  onDecline: () => void
}

/** Fixed-position toast showing an incoming voice/video call with accept (audio/video) and decline buttons. */
export function IncomingCallToast({ call, onAccept, onDecline }: IncomingCallToastProps) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-xl shadow-2xl p-4 flex items-center gap-4 min-w-72"
      style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
    >
      {call.callerAvatar ? (
        <img src={call.callerAvatar} alt={`${call.callerName}'s avatar`} className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "var(--theme-accent)" }}>
          {call.callerName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold truncate">{call.callerName}</div>
        <div className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>
          {call.withVideo ? "Incoming video call…" : "Incoming voice call…"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAccept(false)}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "var(--theme-success)" }}
          title="Accept (voice)"
        >
          <Phone className="w-4 h-4 text-white" />
        </button>
        {call.withVideo && (
          <button
            onClick={() => onAccept(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "var(--theme-accent)" }}
            title="Accept (video)"
          >
            <Video className="w-4 h-4 text-white" />
          </button>
        )}
        <button
          onClick={onDecline}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "var(--theme-danger)" }}
          title="Decline"
        >
          <PhoneOff className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  )
}

// ─── Caller Ringing Overlay ────────────────────────────────────────────────────

interface CallerRingingOverlayProps {
  partnerName: string
  partnerAvatar: string | null
  withVideo: boolean
  onCancel: () => void
}

/** Shown on the caller's side while waiting for the callee to pick up (max 30 s). */
export function CallerRingingOverlay({ partnerName, partnerAvatar, withVideo, onCancel }: CallerRingingOverlayProps) {
  const initials = partnerName.slice(0, 2).toUpperCase()
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6" style={{ background: "var(--theme-bg-tertiary)" }}>
      <Avatar className="w-24 h-24">
        {partnerAvatar && <AvatarImage src={partnerAvatar} alt={`${partnerName}'s avatar`} />}
        <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "32px" }}>{initials}</AvatarFallback>
      </Avatar>
      <div className="text-center">
        <div className="text-white font-semibold text-xl mb-1">{partnerName}</div>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          {withVideo ? "Calling (video)…" : "Calling…"}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "var(--theme-danger)" }}
        title="Cancel call"
      >
        <PhoneOff className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}

// ─── useDMCall hook ─────────────────────────────────────────────────────────────
// Manages incoming call state for a DM channel

/** Manages incoming/outgoing DM call state and signaling via Supabase Realtime broadcast. */
export function useDMCall(channelId: string, currentUserId: string, currentUserName: string) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [activeCall, setActiveCall] = useState<{ withVideo: boolean } | null>(null)
  const [ringing, setRinging] = useState<{ withVideo: boolean } | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const incomingCallRef = useRef(incomingCall)
  incomingCallRef.current = incomingCall
  const ringingRef = useRef(ringing)
  ringingRef.current = ringing
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ch = supabase.channel(`dm-call-notify:${channelId}`)
    channelRef.current = ch

    ch.on("broadcast", { event: "call-invite" }, ({ payload }) => {
      if (payload.callerId === currentUserId) return
      setIncomingCall({
        callerId: payload.callerId,
        callerName: payload.callerName,
        callerAvatar: payload.callerAvatar ?? null,
        channelId,
        withVideo: payload.withVideo ?? false,
      })
    })
    .on("broadcast", { event: "call-cancelled" }, ({ payload }) => {
      if (incomingCallRef.current?.callerId === payload.callerId) setIncomingCall(null)
    })
    .on("broadcast", { event: "call-accepted" }, ({ payload }) => {
      if (!ringingRef.current) return
      if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null }
      setRinging(null)
      setActiveCall({ withVideo: payload.acceptedWithVideo ?? false })
    })
    .on("broadcast", { event: "call-declined" }, () => {
      if (!ringingRef.current) return
      if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null }
      setRinging(null)
    })
    .subscribe()

    return () => {
      if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null }
      supabase.removeChannel(ch)
    }
  }, [channelId, currentUserId])

  const startCall = useCallback((withVideo: boolean, callerAvatar?: string | null) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "call-invite",
      payload: { callerId: currentUserId, callerName: currentUserName, callerAvatar: callerAvatar ?? null, withVideo },
    })
    setRinging({ withVideo })
    ringTimeoutRef.current = setTimeout(() => {
      ringTimeoutRef.current = null
      channelRef.current?.send({ type: "broadcast", event: "call-cancelled", payload: { callerId: currentUserId } })
      setRinging(null)
    }, 30_000)
  }, [currentUserId, currentUserName])

  const cancelCall = useCallback(() => {
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null }
    channelRef.current?.send({ type: "broadcast", event: "call-cancelled", payload: { callerId: currentUserId } })
    setRinging(null)
  }, [currentUserId])

  const acceptCall = useCallback((withVideo: boolean) => {
    channelRef.current?.send({ type: "broadcast", event: "call-accepted", payload: { acceptedWithVideo: withVideo } })
    setIncomingCall(null)
    setActiveCall({ withVideo })
  }, [])

  const declineCall = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "call-declined", payload: {} })
    setIncomingCall(null)
  }, [])

  const endCall = useCallback(() => {
    setActiveCall(null)
  }, [])

  return { incomingCall, activeCall, ringing, startCall, cancelCall, acceptCall, declineCall, endCall }
}
