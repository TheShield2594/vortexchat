"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Clipboard, Trash2, MessageSquare, Mic2, Megaphone, Image
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import type { ChannelRow, RoleRow, ServerRow } from "@/types/database"
import { useAppStore } from "@/lib/stores/app-store"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import { CreateChannelModal } from "@/components/modals/create-channel-modal"
import { ServerSettingsModal } from "@/components/modals/server-settings-modal"
import { UserPanel } from "@/components/layout/user-panel"
import { PERMISSIONS, hasPermission } from "@vortex/shared"
import { useUnreadChannels } from "@/hooks/use-unread-channels"

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

/** Channel types that support messaging (messages table) */
const MESSAGE_CHANNEL_TYPES = ["text", "announcement", "forum", "media"] as const

/** Channel types that use voice infrastructure */
const VOICE_CHANNEL_TYPES = ["voice", "stage"] as const

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

export function ChannelSidebar({ server, channels: initialChannels, currentUserId, isOwner, userRoles }: Props) {
  const { activeChannelId, voiceChannelId, setVoiceChannel, channels: storeChannels, setChannels, addChannel, removeChannel } = useAppStore()
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>()
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClientSupabaseClient()

  async function handleDeleteChannel(channelId: string, channelName: string) {
    if (!window.confirm(`Are you sure you want to delete #${channelName}? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from("channels").delete().eq("id", channelId)
      if (error) throw error
      removeChannel(channelId)
      if (activeChannelId === channelId) {
        router.push(`/channels/${server.id}`)
      }
      toast({ title: "Channel deleted" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to delete channel", description: error.message })
    }
  }

  // Seed store with server-fetched channels once per server (not on every re-render,
  // which would overwrite channels added via realtime or addChannel)
  const seededServerRef = useRef<string | null>(null)
  useEffect(() => {
    if (seededServerRef.current !== server.id) {
      setChannels(server.id, initialChannels)
      seededServerRef.current = server.id
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, setChannels])

  // Subscribe to realtime channel changes so other users see new/deleted channels
  useEffect(() => {
    const supabase = createClientSupabaseClient()
    const subscription = supabase
      .channel(`channels:${server.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => {
          addChannel(payload.new as ChannelRow)
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => {
          removeChannel((payload.old as { id: string }).id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [server.id, addChannel, removeChannel])

  const channels = storeChannels[server.id] ?? initialChannels
  const grouped = groupChannels(channels)

  // Compute effective permissions
  const userPermissions = userRoles.reduce((acc, role) => acc | role.permissions, 0)
  const canManageChannels = isOwner || hasPermission(userPermissions, "MANAGE_CHANNELS")

  // Track unread state for all text channels in this server
  const textChannelIds = channels.filter((c) => c.type === "text").map((c) => c.id)
  const { unreadChannelIds, mentionCounts } = useUnreadChannels(
    server.id,
    textChannelIds,
    currentUserId,
    activeChannelId
  )

  function toggleCategory(id: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Channels eligible for webhooks are all message-based channel types
  const webhookEligibleChannels = channels
    .filter((c) => (MESSAGE_CHANNEL_TYPES as readonly string[]).includes(c.type))
    .map((c) => ({ id: c.id, name: c.name }))

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="w-60 flex flex-col flex-shrink-0"
        style={{ background: '#2b2d31' }}
      >
        {/* Server header */}
        <button
          onClick={() => setShowServerSettings(true)}
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-white/5 transition-colors group"
          style={{ borderColor: '#1e1f22' }}
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
                      <ChevronRight className="w-3 h-3" style={{ color: '#949ba4' }} />
                    ) : (
                      <ChevronDown className="w-3 h-3" style={{ color: '#949ba4' }} />
                    )}
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#949ba4' }}
                    >
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
                          className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
                          style={{ color: '#949ba4' }}
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
                      canManageChannels={canManageChannels}
                      isUnread={unreadChannelIds.has(channel.id)}
                      mentionCount={mentionCounts[channel.id] ?? 0}
                      onClick={() => {
                        if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
                          setVoiceChannel(channel.id, server.id)
                        }
                        router.push(`/channels/${server.id}/${channel.id}`)
                      }}
                      onDelete={() => handleDeleteChannel(channel.id, channel.name)}
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
                className="flex items-center gap-1 px-2 py-1 rounded w-full hover:bg-white/5 transition-colors"
                style={{ color: '#949ba4' }}
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
          channels={webhookEligibleChannels}
        />
      </div>
    </TooltipProvider>
  )
}

function ChannelIcon({ channel, isVoiceActive }: { channel: ChannelRow; isVoiceActive: boolean }) {
  const iconStyle = { color: isVoiceActive ? '#23a55a' : undefined }
  switch (channel.type) {
    case "voice":   return <Volume2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "forum":   return <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    case "stage":   return <Mic2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "announcement": return <Megaphone className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    case "media":   return <Image className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    default:        return <Hash className="w-4 h-4 flex-shrink-0" />
  }
}

function ChannelItem({
  channel,
  isActive,
  isVoiceActive,
  canManageChannels,
  isUnread,
  mentionCount,
  onClick,
  onDelete,
}: {
  channel: ChannelRow
  isActive: boolean
  isVoiceActive: boolean
  canManageChannels: boolean
  isUnread?: boolean
  mentionCount?: number
  onClick: () => void
  onDelete: () => void
}) {
  const { toast } = useToast()
  const showBadge = !isActive && (isUnread || (mentionCount ?? 0) > 0)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded w-full text-left transition-colors text-sm",
            isActive || isVoiceActive
              ? "bg-white/10 text-white"
              : isUnread
              ? "text-white hover:bg-white/5"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
          )}
        >
          <ChannelIcon channel={channel} isVoiceActive={isVoiceActive} />
          <span className={cn("truncate flex-1", isUnread && !isActive ? "font-semibold" : "")}>{channel.name}</span>
          <span className="ml-auto flex items-center gap-1 flex-shrink-0">
            {isVoiceActive && (
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
            )}
            {showBadge && (mentionCount ?? 0) > 0 ? (
              <span
                className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold text-white px-1"
                style={{ background: "#f23f43" }}
              >
                {(mentionCount ?? 0) > 99 ? "99+" : mentionCount}
              </span>
            ) : showBadge ? (
              <span className="w-2 h-2 rounded-full" style={{ background: "#f2f3f5" }} />
            ) : null}
          </span>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(channel.id)
          toast({ title: "Channel ID copied!" })
        }}>
          <Clipboard className="w-4 h-4 mr-2" /> Copy Channel ID
        </ContextMenuItem>
        {canManageChannels && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Channel
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
