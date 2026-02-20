"use client"

import { useState } from "react"
import { PhoneOff, Settings } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProfileSettingsModal } from "@/components/modals/profile-settings-modal"
import { cn } from "@/lib/utils/cn"

export function UserPanel() {
  const { currentUser, voiceChannelId, setVoiceChannel } = useAppStore()
  const [showProfileSettings, setShowProfileSettings] = useState(false)

  if (!currentUser) return null

  const displayName = currentUser.display_name || currentUser.username
  const initials = displayName.slice(0, 2).toUpperCase()

  function getStatusClass(status: string) {
    switch (status) {
      case "online": return "bg-vortex-success"
      case "idle": return "bg-[#f0b132]"
      case "dnd": return "bg-vortex-danger"
      default: return "bg-[#80848e]"
    }
  }

  return (
    <div className="flex items-center gap-2 p-2 border-t bg-vortex-bg-overlay border-vortex-bg-tertiary">
      {/* Avatar with status */}
      <button
        className="relative flex-shrink-0"
        onClick={() => setShowProfileSettings(true)}
        aria-label="Open profile settings"
      >
        <Avatar className="w-8 h-8">
          {currentUser.avatar_url && <AvatarImage src={currentUser.avatar_url} />}
          <AvatarFallback className="bg-vortex-accent text-white text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-vortex-bg-overlay",
            getStatusClass(currentUser.status)
          )}
        />
      </button>

      {/* Username */}
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => setShowProfileSettings(true)}
        aria-label="Open profile settings"
      >
        <div className="text-xs font-semibold text-white truncate">{displayName}</div>
        {currentUser.status_message ? (
          <div className="text-xs truncate text-vortex-interactive">
            {currentUser.status_message}
          </div>
        ) : (
          <div className="text-xs text-vortex-interactive">
            #{currentUser.username}
          </div>
        )}
      </button>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        {voiceChannelId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setVoiceChannel(null, null)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors text-vortex-danger"
                aria-label="Disconnect from voice"
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
              onClick={() => setShowProfileSettings(true)}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10 transition-colors text-vortex-interactive"
              aria-label="User settings"
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
