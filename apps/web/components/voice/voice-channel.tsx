"use client"

import { useEffect, useRef, useState } from "react"
import {
  Volume2, Mic, MicOff, Headphones, PhoneOff,
  Monitor, MonitorOff, Video, VideoOff, Radio, Settings,
} from "lucide-react"
import { useVoice } from "@/lib/webrtc/use-voice"
import { usePushToTalk } from "@/hooks/use-push-to-talk"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { UserRow } from "@/types/database"
import { cn } from "@/lib/utils/cn"

interface Props {
  channelId: string
  channelName: string
  serverId: string
  currentUserId: string
}

export function VoiceChannel({ channelId, channelName, serverId, currentUserId }: Props) {
  const { currentUser, setVoiceChannel } = useAppStore()
  const [voiceParticipants, setVoiceParticipants] = useState<UserRow[]>([])
  const [pttEnabled, setPttEnabled] = useState(false)
  const supabase = createClientSupabaseClient()

  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const {
    peers,
    muted,
    deafened,
    speaking,
    screenSharing,
    videoEnabled,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleVideo,
    leaveChannel,
    localStream,
    screenStream,
    cameraStream,
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
  } = useVoice(channelId, currentUserId)

  // Push-to-talk: temporarily unmutes while key is held (default: Space)
  usePushToTalk(
    pttEnabled,
    () => { if (muted) toggleMute() },
    () => { if (!muted) toggleMute() }
  )

  useEffect(() => {
    async function joinVoiceState() {
      await supabase
        .from("voice_states")
        .upsert({
          user_id: currentUserId,
          channel_id: channelId,
          server_id: serverId,
          muted,
          deafened,
          speaking,
          self_stream: screenSharing,
        })
    }
    joinVoiceState()

    return () => {
      supabase
        .from("voice_states")
        .delete()
        .eq("user_id", currentUserId)
        .eq("channel_id", channelId)
        .then()
    }
  }, [channelId, currentUserId, serverId])

  useEffect(() => {
    supabase
      .from("voice_states")
      .update({ muted, deafened, speaking, self_stream: screenSharing })
      .eq("user_id", currentUserId)
      .eq("channel_id", channelId)
      .then()
  }, [muted, deafened, speaking, screenSharing])

  useEffect(() => {
    async function fetchParticipants() {
      const { data } = await supabase
        .from("voice_states")
        .select("user_id, users(*)")
        .eq("channel_id", channelId)
      setVoiceParticipants(data?.map((d: any) => d.users).filter(Boolean) ?? [])
    }
    fetchParticipants()

    const channel = supabase
      .channel(`voice:${channelId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "voice_states",
        filter: `channel_id=eq.${channelId}`,
      }, fetchParticipants)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId])

  function handleLeave() {
    leaveChannel()
    setVoiceChannel(null, null)
  }

  const peerArray = peers ? Array.from(peers.entries()) : []
  const hasVideo = videoEnabled || screenSharing || peerArray.some(
    ([, { stream }]) => stream.getVideoTracks().length > 0
  )

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1" style={{ background: "#313338" }}>
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: "#1e1f22" }}
        >
          <Volume2 className="w-5 h-5" style={{ color: "#23a55a" }} />
          <span className="font-semibold text-white">{channelName}</span>
          <span className="text-sm ml-1" style={{ color: "#949ba4" }}>
            — Voice Connected
          </span>
        </div>

        {/* Participant grid */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
          {peerArray.length === 0 && !currentUser ? (
            <div className="text-center">
              <Volume2 className="w-16 h-16 mx-auto mb-4" style={{ color: "#4e5058" }} />
              <p className="text-white text-lg font-semibold mb-1">You&apos;re the only one here</p>
              <p style={{ color: "#949ba4" }} className="text-sm">
                Invite others to join this voice channel
              </p>
            </div>
          ) : (
            <div
              className="grid gap-4 w-full"
              style={{
                gridTemplateColumns: hasVideo
                  ? "repeat(auto-fill, minmax(320px, 1fr))"
                  : "repeat(auto-fill, minmax(200px, 1fr))",
              }}
            >
              {/* Local user tile */}
              {currentUser && (
                <ParticipantTile
                  user={currentUser}
                  speaking={speaking}
                  muted={muted}
                  deafened={deafened}
                  audioStream={localStream.current}
                  cameraStream={videoEnabled ? cameraStream.current : null}
                  screenStream={screenSharing ? screenStream.current : null}
                  isLocal
                />
              )}

              {/* Remote peers */}
              {peerArray.map(([peerId, { stream, speaking: pSpeaking, muted: pMuted, userId }]) => {
                const peerUser = voiceParticipants.find((u) => u.id === userId)
                return (
                  <ParticipantTile
                    key={peerId}
                    user={peerUser}
                    speaking={pSpeaking}
                    muted={pMuted}
                    deafened={false}
                    audioStream={stream}
                    cameraStream={null}
                    screenStream={null}
                    isLocal={false}
                    remoteStream={stream}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Controls */}
        <div
          className="flex items-center justify-center gap-3 py-4 border-t flex-shrink-0"
          style={{ borderColor: "#1e1f22", background: "#232428" }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleMute}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: muted ? "#f23f43" : "#4e5058" }}
              >
                {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{muted ? "Unmute" : "Mute"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleDeafen}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: deafened ? "#f23f43" : "#4e5058" }}
              >
                <Headphones className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{deafened ? "Undeafen" : "Deafen"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPttEnabled((v) => !v)}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: pttEnabled ? "#5865f2" : "#4e5058" }}
                title="Push-to-Talk (Space)"
              >
                <Radio className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{pttEnabled ? "Disable PTT" : "Enable Push-to-Talk (Space)"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleVideo}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: videoEnabled ? "#23a55a" : "#4e5058" }}
              >
                {videoEnabled
                  ? <Video className="w-5 h-5 text-white" />
                  : <VideoOff className="w-5 h-5 text-white" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{videoEnabled ? "Turn Off Camera" : "Turn On Camera"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleScreenShare}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: screenSharing ? "#23a55a" : "#4e5058" }}
              >
                {screenSharing
                  ? <MonitorOff className="w-5 h-5 text-white" />
                  : <Monitor className="w-5 h-5 text-white" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{screenSharing ? "Stop Sharing" : "Share Screen"}</TooltipContent>
          </Tooltip>

          {/* Device settings */}
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setDeviceMenuOpen((v) => !v)}
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: deviceMenuOpen ? "#5865f2" : "#4e5058" }}
                >
                  <Settings className="w-5 h-5 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Audio Settings</TooltipContent>
            </Tooltip>
            {deviceMenuOpen && (
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 rounded-xl shadow-2xl p-4 space-y-4 z-50"
                style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}
              >
                <div>
                  <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#b5bac1" }}>
                    Microphone
                  </label>
                  <select
                    value={selectedInputId ?? ""}
                    onChange={(e) => setSelectedInputId(e.target.value || null)}
                    className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
                    style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
                  >
                    <option value="">Default</option>
                    {audioInputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                </div>
                {audioOutputDevices.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#b5bac1" }}>
                      Speaker
                    </label>
                    <select
                      value={selectedOutputId ?? ""}
                      onChange={(e) => setSelectedOutputId(e.target.value || null)}
                      className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
                      style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
                    >
                      <option value="">Default</option>
                      {audioOutputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 6)}`}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs" style={{ color: "#4e5058" }}>Rejoin the channel to apply input changes.</p>
              </div>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLeave}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "#f23f43" }}
              >
                <PhoneOff className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Disconnect</TooltipContent>
          </Tooltip>
        </div>

        {/* Remote audio elements — always render so deafen works */}
        {peerArray.map(([peerId, { stream }]) => (
          <RemoteAudio key={peerId} stream={stream} deafened={deafened} />
        ))}
      </div>
    </TooltipProvider>
  )
}

function ParticipantTile({
  user,
  speaking,
  muted,
  deafened,
  audioStream,
  cameraStream,
  screenStream,
  isLocal,
  remoteStream,
}: {
  user?: UserRow | null
  speaking: boolean
  muted: boolean
  deafened: boolean
  audioStream: MediaStream | null
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  isLocal: boolean
  remoteStream?: MediaStream
}) {
  const cameraRef = useRef<HTMLVideoElement>(null)
  const screenRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  // Local camera
  useEffect(() => {
    if (cameraRef.current && cameraStream) {
      cameraRef.current.srcObject = cameraStream
    }
  }, [cameraStream])

  // Local screen share
  useEffect(() => {
    if (screenRef.current && screenStream) {
      screenRef.current.srcObject = screenStream
    }
  }, [screenStream])

  // Remote video (camera or screen, whichever track is in stream)
  const remoteHasVideo = remoteStream && remoteStream.getVideoTracks().length > 0
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && remoteHasVideo) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream, remoteHasVideo])

  const displayName = user?.display_name || user?.username || (isLocal ? "You" : "Unknown")
  const initials = displayName.slice(0, 2).toUpperCase()

  // Determine what to show: priority = screen > camera > remote video > avatar
  const showScreen = isLocal && !!screenStream
  const showCamera = isLocal && !!cameraStream && !showScreen
  const showRemoteVideo = !isLocal && remoteHasVideo

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden flex flex-col relative",
        speaking && !muted ? "ring-2 ring-green-500" : ""
      )}
      style={{ background: "#1e1f22", minHeight: showScreen || showCamera || showRemoteVideo ? "240px" : "160px" }}
    >
      {/* Video area */}
      {showScreen && (
        <video
          ref={screenRef}
          autoPlay
          playsInline
          muted
          className="w-full flex-1 object-contain bg-black"
        />
      )}
      {showCamera && (
        <video
          ref={cameraRef}
          autoPlay
          playsInline
          muted
          className="w-full flex-1 object-cover bg-black"
          style={{ transform: "scaleX(-1)" /* mirror local camera */ }}
        />
      )}
      {showRemoteVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted /* audio comes from RemoteAudio element */
          className="w-full flex-1 object-cover bg-black"
        />
      )}

      {/* Avatar (shown when no video) */}
      {!showScreen && !showCamera && !showRemoteVideo && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Avatar className="w-20 h-20">
            {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
            <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "24px" }}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* Name bar — always at bottom */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <span className="text-sm font-medium text-white flex-1 truncate">{displayName}</span>
        {isLocal && (
          <span className="text-xs px-1 rounded" style={{ background: "#5865f2", color: "white" }}>You</span>
        )}
        {muted && <MicOff className="w-3 h-3 flex-shrink-0" style={{ color: "#f23f43" }} />}
        {deafened && <Headphones className="w-3 h-3 flex-shrink-0" style={{ color: "#f23f43" }} />}
      </div>
    </div>
  )
}

function RemoteAudio({ stream, deafened }: { stream: MediaStream; deafened: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream
      audioRef.current.muted = deafened
    }
  }, [stream, deafened])

  return <audio ref={audioRef} autoPlay playsInline />
}
