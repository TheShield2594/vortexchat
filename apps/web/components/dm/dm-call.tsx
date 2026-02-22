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

import { useEffect, useRef, useState, useCallback } from "react"
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Loader2, X } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils/cn"

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

export function DMCallScreen({ channelId, currentUserId, partner, withVideo, onHangUp }: DMCallScreenProps) {
  const supabase = createClientSupabaseClient()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
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
    // Broadcast hangup to partner before closing
    const rtChannel = supabase.channel(`dm-call:${channelId}`)
    rtChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "hangup", from: clientId.current } }).then(() => supabase.removeChannel(rtChannel))
    onHangUp()
  }

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted })
    setMuted((m) => !m)
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = videoOff })
    setVideoOff((v) => !v)
  }

  const partnerName = partner.display_name || partner.username
  const initials = partnerName.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col items-center justify-between flex-1 p-6" style={{ background: "#1e1f22" }}>
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
              {partner.avatar_url && <AvatarImage src={partner.avatar_url} />}
              <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "32px" }}>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-white font-semibold text-lg">{partnerName}</div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "#b5bac1" }}>
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
            style={{ borderColor: "#5865f2", background: "#000", transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={toggleMute}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
          style={{ background: muted ? "#f23f43" : "#4e5058" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
        </button>

        {withVideo && (
          <button
            onClick={toggleVideo}
            className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
            style={{ background: videoOff ? "#f23f43" : "#4e5058" }}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
          </button>
        )}

        <button
          onClick={handleHangUp}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "#f23f43" }}
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

export function IncomingCallToast({ call, onAccept, onDecline }: IncomingCallToastProps) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-xl shadow-2xl p-4 flex items-center gap-4 min-w-72"
      style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}
    >
      {call.callerAvatar ? (
        <img src={call.callerAvatar} alt="" className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "#5865f2" }}>
          {call.callerName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold truncate">{call.callerName}</div>
        <div className="text-sm" style={{ color: "#b5bac1" }}>
          {call.withVideo ? "Incoming video call…" : "Incoming voice call…"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAccept(false)}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "#23a55a" }}
          title="Accept (voice)"
        >
          <Phone className="w-4 h-4 text-white" />
        </button>
        {call.withVideo && (
          <button
            onClick={() => onAccept(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "#5865f2" }}
            title="Accept (video)"
          >
            <Video className="w-4 h-4 text-white" />
          </button>
        )}
        <button
          onClick={onDecline}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "#f23f43" }}
          title="Decline"
        >
          <PhoneOff className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  )
}

// ─── useDMCall hook ─────────────────────────────────────────────────────────────
// Manages incoming call state for a DM channel

export function useDMCall(channelId: string, currentUserId: string, currentUserName: string) {
  const supabase = createClientSupabaseClient()
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [activeCall, setActiveCall] = useState<{ withVideo: boolean } | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

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
      if (incomingCall?.callerId === payload.callerId) setIncomingCall(null)
    })
    .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [channelId, currentUserId])

  const startCall = useCallback(async (withVideo: boolean, callerAvatar?: string | null) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "call-invite",
      payload: { callerId: currentUserId, callerName: currentUserName, callerAvatar: callerAvatar ?? null, withVideo },
    })
    setActiveCall({ withVideo })
  }, [currentUserId, currentUserName])

  const acceptCall = useCallback((withVideo: boolean) => {
    setIncomingCall(null)
    setActiveCall({ withVideo })
  }, [])

  const declineCall = useCallback(() => {
    setIncomingCall(null)
  }, [])

  const endCall = useCallback(() => {
    setActiveCall(null)
  }, [])

  return { incomingCall, activeCall, startCall, acceptCall, declineCall, endCall }
}
