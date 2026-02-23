"use client"

import { useState } from "react"
import { Mic, MicOff, Headphones, PhoneOff, Settings, Clipboard, Circle } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import { ProfileSettingsModal } from "@/components/modals/profile-settings-modal"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { UserRow } from "@/types/database"

const STATUS_OPTIONS: { value: UserRow["status"]; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "#23a55a" },
  { value: "idle", label: "Idle", color: "#f0b132" },
  { value: "dnd", label: "Do Not Disturb", color: "#f23f43" },
  { value: "invisible", label: "Invisible", color: "#80848e" },
]

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.color ?? "#80848e"
}

export function UserPanel() {
  const { currentUser, voiceChannelId, setVoiceChannel, setCurrentUser } = useAppStore()
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [showProfileSettings, setShowProfileSettings] = useState(false)
  const { toast } = useToast()
  const supabase = createClientSupabaseClient()

  if (!currentUser) return null

  const displayName = currentUser.display_name || currentUser.username
  const initials = displayName.slice(0, 2).toUpperCase()

  async function handleSetStatus(status: UserRow["status"]) {
    try {
      const latestUser = useAppStore.getState().currentUser
      if (!latestUser) return
      const { error } = await supabase
        .from("users")
        .update({ status })
        .eq("id", latestUser.id)
      if (error) throw error
      setCurrentUser({ ...latestUser, status })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to update status", description: error.message })
    }
  }

  return (
    <div
      className="flex items-center gap-2 p-2 border-t"
      style={{ background: '#232428', borderColor: '#1e1f22' }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" role="button" tabIndex={0} onClick={() => setShowProfileSettings(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowProfileSettings(true) }}>
            {/* Avatar with status */}
            <div className="relative flex-shrink-0">
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
            <div className="min-w-0">
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
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Circle className="w-4 h-4 mr-2 fill-current" style={{ color: getStatusColor(currentUser.status) }} /> Set Status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {STATUS_OPTIONS.map(({ value, label, color }) => (
                <ContextMenuItem key={value} onClick={() => handleSetStatus(value)}>
                  <Circle className="w-3 h-3 mr-2 fill-current" style={{ color }} />
                  {label}
                  {currentUser.status === value && <span className="ml-auto text-xs" style={{ color: '#949ba4' }}>&#10003;</span>}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => {
            navigator.clipboard.writeText(currentUser.username)
            toast({ title: "Username copied!" })
          }}>
            <Clipboard className="w-4 h-4 mr-2" /> Copy Username
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

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
