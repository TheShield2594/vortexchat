"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, Mic, MicOff, Headphones, PhoneOff, Monitor, MonitorOff } from "lucide-react"
import { useVoice } from "@/lib/webrtc/use-voice"
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
  const supabase = createClientSupabaseClient()

  const {
    peers,
    muted,
    deafened,
    speaking,
    screenSharing,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    leaveChannel,
    localStream,
    screenStream,
  } = useVoice(channelId, currentUserId)

  useEffect(() => {
    // Track voice state in Supabase
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

  // Sync mute/deafen state to DB
  useEffect(() => {
    supabase
      .from("voice_states")
      .update({ muted, deafened, speaking, self_stream: screenSharing })
      .eq("user_id", currentUserId)
      .eq("channel_id", channelId)
      .then()
  }, [muted, deafened, speaking, screenSharing])

  // Fetch participants from voice_states
  useEffect(() => {
    async function fetchParticipants() {
      const { data } = await supabase
        .from("voice_states")
        .select("user_id, users(*)")
        .eq("channel_id", channelId)
      setVoiceParticipants(data?.map((d: any) => d.users).filter(Boolean) ?? [])
    }
    fetchParticipants()

    // Subscribe to voice state changes
    const channel = supabase
      .channel(`voice:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_states", filter: `channel_id=eq.${channelId}` }, fetchParticipants)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId])

  function handleLeave() {
    leaveChannel()
    setVoiceChannel(null, null)
  }

  const peerArray = peers ? Array.from(peers.entries()) : []

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
        <div className="flex-1 flex items-center justify-center p-8">
          {peerArray.length === 0 && !currentUser ? (
            <div className="text-center">
              <Volume2 className="w-16 h-16 mx-auto mb-4" style={{ color: "#4e5058" }} />
              <p className="text-white text-lg font-semibold mb-1">
                You're the only one here
              </p>
              <p style={{ color: "#949ba4" }} className="text-sm">
                Invite others to join this voice channel
              </p>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", width: "100%" }}>
              {/* Local user tile */}
              {currentUser && (
                <ParticipantTile
                  user={currentUser}
                  speaking={speaking}
                  muted={muted}
                  deafened={deafened}
                  stream={localStream.current ?? null}
                  isLocal
                  screenStream={screenSharing ? screenStream.current : null}
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
                    stream={stream}
                    isLocal={false}
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
                {muted ? (
                  <MicOff className="w-5 h-5 text-white" />
                ) : (
                  <Mic className="w-5 h-5 text-white" />
                )}
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
                onClick={toggleScreenShare}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: screenSharing ? "#23a55a" : "#4e5058" }}
              >
                {screenSharing ? (
                  <MonitorOff className="w-5 h-5 text-white" />
                ) : (
                  <Monitor className="w-5 h-5 text-white" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{screenSharing ? "Stop Sharing" : "Share Screen"}</TooltipContent>
          </Tooltip>

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

        {/* Remote audio elements (hidden) */}
        {peerArray.map(([peerId, { stream }]) => (
          <RemoteAudio key={peerId} stream={stream} />
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
  stream,
  isLocal,
  screenStream,
}: {
  user?: any
  speaking: boolean
  muted: boolean
  deafened: boolean
  stream: MediaStream | null
  isLocal: boolean
  screenStream?: MediaStream | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (screenRef.current && screenStream) {
      screenRef.current.srcObject = screenStream
    }
  }, [screenStream])

  const displayName = user?.display_name || user?.username || (isLocal ? "You" : "Unknown")
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div
      className={cn(
        "rounded-lg p-4 flex flex-col items-center gap-3 relative",
        speaking && !muted && "ring-2 ring-green-500"
      )}
      style={{ background: "#1e1f22", minHeight: "160px" }}
    >
      {screenStream ? (
        <video
          ref={screenRef}
          autoPlay
          playsInline
          className="w-full rounded object-contain"
          style={{ maxHeight: "200px" }}
        />
      ) : (
        <>
          <div className={cn("relative", speaking && !muted && "speaking-ring rounded-full")}>
            <Avatar className="w-20 h-20">
              {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
              <AvatarFallback
                style={{ background: "#5865f2", color: "white", fontSize: "24px" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white">{displayName}</span>
        {muted && <MicOff className="w-3 h-3" style={{ color: "#f23f43" }} />}
        {deafened && <Headphones className="w-3 h-3" style={{ color: "#f23f43" }} />}
        {isLocal && (
          <span className="text-xs px-1 rounded" style={{ background: "#5865f2", color: "white" }}>
            You
          </span>
        )}
      </div>
    </div>
  )
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream
    }
  }, [stream])

  return <audio ref={audioRef} autoPlay playsInline />
}
