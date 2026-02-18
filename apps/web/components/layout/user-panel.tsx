"use client"

import { useState } from "react"
import { Mic, MicOff, Headphones, PhoneOff, Settings } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProfileSettingsModal } from "@/components/modals/profile-settings-modal"
import { createClientSupabaseClient } from "@/lib/supabase/client"

export function UserPanel() {
  const { currentUser, voiceChannelId, setVoiceChannel } = useAppStore()
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [showProfileSettings, setShowProfileSettings] = useState(false)

  if (!currentUser) return null

  const displayName = currentUser.display_name || currentUser.username
  const initials = displayName.slice(0, 2).toUpperCase()

  function getStatusColor(status: string) {
    switch (status) {
      case "online": return "#23a55a"
      case "idle": return "#f0b132"
      case "dnd": return "#f23f43"
      default: return "#80848e"
    }
  }

  return (
    <div
      className="flex items-center gap-2 p-2 border-t"
      style={{ background: '#232428', borderColor: '#1e1f22' }}
    >
      {/* Avatar with status */}
      <div className="relative flex-shrink-0 cursor-pointer" onClick={() => setShowProfileSettings(true)}>
        <Avatar className="w-8 h-8">
          {currentUser.avatar_url && <AvatarImage src={currentUser.avatar_url} />}
          <AvatarFallback style={{ background: '#5865f2', color: 'white', fontSize: '12px' }}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{
            background: getStatusColor(currentUser.status),
            borderColor: '#232428',
          }}
        />
      </div>

      {/* Username */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowProfileSettings(true)}>
        <div className="text-xs font-semibold text-white truncate">{displayName}</div>
        {currentUser.status_message ? (
          <div className="text-xs truncate" style={{ color: '#949ba4' }}>
            {currentUser.status_message}
          </div>
        ) : (
          <div className="text-xs" style={{ color: '#949ba4' }}>
            #{currentUser.username}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        {voiceChannelId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setVoiceChannel(null, null)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors"
                style={{ color: '#f23f43' }}
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Disconnect</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setMuted(!muted)}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: muted ? '#f23f43' : '#949ba4' }}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{muted ? "Unmute" : "Mute"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setDeafened(!deafened)}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: deafened ? '#f23f43' : '#949ba4' }}
            >
              <Headphones className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{deafened ? "Undeafen" : "Deafen"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowProfileSettings(true)}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: '#949ba4' }}
            >
              <Settings className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>User Settings</TooltipContent>
        </Tooltip>
      </div>

      <ProfileSettingsModal
        open={showProfileSettings}
        onClose={() => setShowProfileSettings(false)}
        user={currentUser}
      />
    </div>
  )
}
