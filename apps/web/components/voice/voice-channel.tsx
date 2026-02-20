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
    supabase
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
      .then(({ error }) => {
        if (error) console.error("[voice_states] upsert failed:", error.message)
      })

    return () => {
      supabase
        .from("voice_states")
        .delete()
        .eq("user_id", currentUserId)
        .eq("channel_id", channelId)
        .then(({ error }) => {
          if (error) console.error("[voice_states] delete failed:", error.message)
        })
    }
  }, [channelId, currentUserId, serverId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mute/deafen state to DB
  useEffect(() => {
    supabase
      .from("voice_states")
      .update({ muted, deafened, speaking, self_stream: screenSharing })
      .eq("user_id", currentUserId)
      .eq("channel_id", channelId)
      .then(({ error }) => {
        if (error) console.error("[voice_states] update failed:", error.message)
      })
  }, [muted, deafened, speaking, screenSharing, currentUserId, channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch participants from voice_states
  useEffect(() => {
    async function fetchParticipants() {
      const { data } = await supabase
        .from("voice_states")
        .select("user_id, users(*)")
        .eq("channel_id", channelId)

      const users = data
        ?.map((d) => {
          const joined = d as { users: UserRow | null }
          return joined.users
        })
        .filter((u): u is UserRow => u !== null) ?? []
      setVoiceParticipants(users)
    }
    fetchParticipants()

    // Subscribe to voice state changes
    const channel = supabase
      .channel(`voice:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_states", filter: `channel_id=eq.${channelId}` }, fetchParticipants)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLeave() {
    leaveChannel()
    setVoiceChannel(null, null)
  }

  const peerArray = peers ? Array.from(peers.entries()) : []

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1 bg-vortex-bg-primary">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-vortex-bg-tertiary flex-shrink-0">
          <Volume2 className="w-5 h-5 text-vortex-success" />
          <span className="font-semibold text-white">{channelName}</span>
          <span className="text-sm ml-1 text-vortex-interactive">
            — Voice Connected
          </span>
        </div>

        {/* Participant grid */}
        <div className="flex-1 flex items-center justify-center p-8">
          {peerArray.length === 0 && !currentUser ? (
            <div className="text-center">
              <Volume2 className="w-16 h-16 mx-auto mb-4 text-vortex-text-muted" />
              <p className="text-white text-lg font-semibold mb-1">
                You&apos;re the only one here
              </p>
              <p className="text-sm text-vortex-interactive">
                Invite others to join this voice channel
              </p>
            </div>
          ) : (
            <div className="grid gap-4 w-full" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
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
        <div className="flex items-center justify-center gap-3 py-4 border-t border-vortex-bg-tertiary bg-vortex-bg-overlay flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleMute}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  muted ? "bg-vortex-danger" : "bg-vortex-text-muted"
                )}
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
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  deafened ? "bg-vortex-danger" : "bg-vortex-text-muted"
                )}
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
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  screenSharing ? "bg-vortex-success" : "bg-vortex-text-muted"
                )}
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
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors bg-vortex-danger"
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
  user?: UserRow
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
        "rounded-lg p-4 flex flex-col items-center gap-3 relative bg-vortex-bg-tertiary min-h-[160px]",
        speaking && !muted && "ring-2 ring-green-500"
      )}
    >
      {screenStream ? (
        <video
          ref={screenRef}
          autoPlay
          playsInline
          className="w-full rounded object-contain max-h-[200px]"
        />
      ) : (
        <div className={cn("relative", speaking && !muted && "speaking-ring rounded-full")}>
          <Avatar className="w-20 h-20">
            {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
            <AvatarFallback className="bg-vortex-accent text-white text-2xl">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white">{displayName}</span>
        {muted && <MicOff className="w-3 h-3 text-vortex-danger" />}
        {deafened && <Headphones className="w-3 h-3 text-vortex-danger" />}
        {isLocal && (
          <span className="text-xs px-1 rounded bg-vortex-accent text-white">
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
