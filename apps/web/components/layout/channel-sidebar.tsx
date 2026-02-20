"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Settings, Mic, MicOff, Headphones, PhoneOff
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import type { ChannelRow, RoleRow, ServerRow } from "@/types/database"
import { useAppStore } from "@/lib/stores/app-store"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CreateChannelModal } from "@/components/modals/create-channel-modal"
import { ServerSettingsModal } from "@/components/modals/server-settings-modal"
import { UserPanel } from "@/components/layout/user-panel"
import { hasPermission } from "@vortex/shared"

interface Props {
  server: ServerRow
  channels: ChannelRow[]
  currentUserId: string
  isOwner: boolean
  userRoles: RoleRow[]
}

type GroupedChannels = {
  category: ChannelRow | null
  channels: ChannelRow[]
}[]

function groupChannels(channels: ChannelRow[]): GroupedChannels {
  const categories = channels.filter((c) => c.type === "category")
  const noCategory = channels.filter((c) => c.type !== "category" && !c.parent_id)

  const result: GroupedChannels = []

  // Channels without category first
  if (noCategory.length > 0) {
    result.push({ category: null, channels: noCategory })
  }

  // Channels grouped by category
  for (const cat of categories) {
    const children = channels.filter(
      (c) => c.parent_id === cat.id && c.type !== "category"
    )
    result.push({ category: cat, channels: children })
  }

  return result
}

export function ChannelSidebar({ server, channels, currentUserId, isOwner, userRoles }: Props) {
  const { activeChannelId, voiceChannelId, setVoiceChannel } = useAppStore()
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>()
  const router = useRouter()

  const grouped = groupChannels(channels)

  // Compute effective permissions
  const userPermissions = userRoles.reduce((acc, role) => acc | role.permissions, 0)
  const canManageChannels = isOwner || hasPermission(userPermissions, "MANAGE_CHANNELS")

  function toggleCategory(id: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-60 flex flex-col flex-shrink-0 bg-vortex-bg-secondary">
        {/* Server header */}
        <button
          onClick={() => setShowServerSettings(true)}
          className="flex items-center justify-between px-4 py-3 border-b border-vortex-bg-tertiary cursor-pointer hover:bg-white/5 transition-colors group"
        >
          <span className="font-semibold text-white truncate text-sm">{server.name}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-white transition-colors" />
        </button>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto py-2">
          {grouped.map(({ category, channels: categoryChannels }) => (
            <div key={category?.id ?? "no-category"} className="mb-2">
              {category && (
                <div
                  className="flex items-center justify-between px-2 py-1 cursor-pointer group"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div className="flex items-center gap-1">
                    {collapsedCategories.has(category.id) ? (
                      <ChevronRight className="w-3 h-3 text-vortex-interactive" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-vortex-interactive" />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wider text-vortex-interactive">
                      {category.name}
                    </span>
                  </div>
                  {canManageChannels && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCreateChannelCategoryId(category.id)
                            setShowCreateChannel(true)
                          }}
                          className="opacity-0 group-hover:opacity-100 text-vortex-interactive hover:text-white transition-opacity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Create Channel</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {(!category || !collapsedCategories.has(category.id)) && (
                <div className="space-y-0.5 px-2">
                  {categoryChannels.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={activeChannelId === channel.id}
                      isVoiceActive={voiceChannelId === channel.id}
                      onClick={() => {
                        if (channel.type === "text") {
                          router.push(`/channels/${server.id}/${channel.id}`)
                        } else if (channel.type === "voice") {
                          setVoiceChannel(channel.id, server.id)
                          router.push(`/channels/${server.id}/${channel.id}`)
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Add channel button (if no categories) */}
          {canManageChannels && (
            <div className="px-2 mt-1">
              <button
                onClick={() => {
                  setCreateChannelCategoryId(undefined)
                  setShowCreateChannel(true)
                }}
                className="flex items-center gap-1 px-2 py-1 rounded w-full hover:bg-white/5 transition-colors text-vortex-interactive"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add Channel</span>
              </button>
            </div>
          )}
        </div>

        {/* User panel */}
        <UserPanel />

        {/* Modals */}
        <CreateChannelModal
          open={showCreateChannel}
          onClose={() => setShowCreateChannel(false)}
          serverId={server.id}
          categoryId={createChannelCategoryId}
        />
        <ServerSettingsModal
          open={showServerSettings}
          onClose={() => setShowServerSettings(false)}
          server={server}
          isOwner={isOwner}
        />
      </div>
    </TooltipProvider>
  )
}

function ChannelItem({
  channel,
  isActive,
  isVoiceActive,
  onClick,
}: {
  channel: ChannelRow
  isActive: boolean
  isVoiceActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded w-full text-left transition-colors text-sm",
        isActive || isVoiceActive
          ? "bg-white/10 text-white"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      )}
    >
      {channel.type === "text" ? (
        <Hash className="w-4 h-4 flex-shrink-0" />
      ) : (
        <Volume2 className={cn("w-4 h-4 flex-shrink-0", isVoiceActive && "text-vortex-success")} />
      )}
      <span className="truncate">{channel.name}</span>
      {isVoiceActive && (
        <span className="ml-auto">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
        </span>
      )}
    </button>
  )
}
