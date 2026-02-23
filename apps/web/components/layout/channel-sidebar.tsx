"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Clipboard, Trash2, GripVertical
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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

const NO_CATEGORY = "__no_category__"

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
  const sorted = [...channels].sort((a, b) => a.position - b.position)
  const categories = sorted.filter((c) => c.type === "category")
  const noCategory = sorted.filter((c) => c.type !== "category" && !c.parent_id)

  const result: GroupedChannels = []

  if (noCategory.length > 0 || categories.length === 0) {
    result.push({ category: null, channels: noCategory })
  }

  for (const cat of categories) {
    const children = sorted.filter(
      (c) => c.parent_id === cat.id && c.type !== "category"
    )
    result.push({ category: cat, channels: children })
  }

  return result
}

function buildItems(grouped: GroupedChannels): Record<string, string[]> {
  const items: Record<string, string[]> = {}
  for (const { category, channels } of grouped) {
    const key = category?.id ?? NO_CATEGORY
    items[key] = channels.map((c) => c.id)
  }
  return items
}

export function ChannelSidebar({ server, channels: initialChannels, currentUserId, isOwner, userRoles }: Props) {
  const { activeChannelId, voiceChannelId, setVoiceChannel, channels: storeChannels, setChannels, addChannel, updateChannel, removeChannel } = useAppStore()
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, string[]>>({})
  const [overContainerId, setOverContainerId] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const seededServerRef = useRef<string | null>(null)
  useEffect(() => {
    if (seededServerRef.current !== server.id) {
      setChannels(server.id, initialChannels)
      seededServerRef.current = server.id
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, setChannels])

  const channels = storeChannels[server.id] ?? initialChannels
  const grouped = groupChannels(channels)

  // Sync items whenever channels change but not during an active drag
  useEffect(() => {
    if (!activeId) {
      setItems(buildItems(grouped))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, activeId])

  useEffect(() => {
    const supabase = createClientSupabaseClient()
    const subscription = supabase
      .channel(`channels:${server.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => { addChannel(payload.new as ChannelRow) }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => { removeChannel((payload.old as { id: string }).id) }
      )
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }, [server.id, addChannel, removeChannel])

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

  async function handleDeleteChannel(channelId: string, channelName: string) {
    if (!window.confirm(`Are you sure you want to delete #${channelName}? This cannot be undone.`)) return
    const supabase = createClientSupabaseClient()
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

  function findContainer(channelId: string): string | null {
    for (const [containerId, channelIds] of Object.entries(items)) {
      if (channelIds.includes(channelId)) return containerId
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    setOverContainerId(null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) { setOverContainerId(null); return }

    const draggedId = active.id as string
    const overId = over.id as string

    // Determine which container the over target belongs to
    const targetContainer = items[overId] !== undefined ? overId : findContainer(overId)
    setOverContainerId(targetContainer)

    const sourceContainer = findContainer(draggedId)
    if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return

    // Move optimistically between containers
    setItems((prev) => {
      const sourceItems = [...(prev[sourceContainer] ?? [])]
      const targetItems = [...(prev[targetContainer] ?? [])]

      const sourceIndex = sourceItems.indexOf(draggedId)
      if (sourceIndex === -1) return prev
      sourceItems.splice(sourceIndex, 1)

      const overIndex = targetItems.indexOf(overId)
      if (overIndex === -1) {
        targetItems.push(draggedId)
      } else {
        targetItems.splice(overIndex, 0, draggedId)
      }

      return { ...prev, [sourceContainer]: sourceItems, [targetContainer]: targetItems }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverContainerId(null)

    if (!over) return

    const draggedId = active.id as string
    const overId = over.id as string

    const sourceContainer = findContainer(draggedId)
    const targetContainer = items[overId] !== undefined ? overId : findContainer(overId)

    if (!sourceContainer || !targetContainer) return

    if (sourceContainer === targetContainer && draggedId !== overId) {
      // Reorder within same container
      setItems((prev) => {
        const containerItems = [...(prev[sourceContainer] ?? [])]
        const oldIndex = containerItems.indexOf(draggedId)
        const newIndex = containerItems.indexOf(overId)
        if (oldIndex === -1 || newIndex === -1) return prev
        const reordered = arrayMove(containerItems, oldIndex, newIndex)
        persistChannelOrder(sourceContainer, reordered)
        return { ...prev, [sourceContainer]: reordered }
      })
    } else if (sourceContainer !== targetContainer) {
      // Cross-container move already applied in handleDragOver; persist both containers
      persistChannelOrder(sourceContainer, items[sourceContainer] ?? [])
      persistChannelOrder(targetContainer, items[targetContainer] ?? [])
    }
  }

  async function persistChannelOrder(containerId: string, orderedIds: string[]) {
    const supabase = createClientSupabaseClient()
    const newParentId = containerId === NO_CATEGORY ? null : containerId

    // Optimistically update store
    for (const id of orderedIds) {
      updateChannel(id, { parent_id: newParentId })
    }

    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await supabase
          .from("channels")
          .update({ position: i, parent_id: newParentId })
          .eq("id", orderedIds[i])
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save channel order", description: error.message })
    }
  }

  const activeChannel = activeId ? channels.find((c) => c.id === activeId) : null

  // Rebuild grouped view from live items map to reflect drag state
  const liveGrouped = grouped.map(({ category }) => {
    const key = category?.id ?? NO_CATEGORY
    const channelIds = items[key] ?? []
    const categoryChannels = channelIds
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is ChannelRow => !!c)
    return { category, channels: categoryChannels }
  })

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {liveGrouped.map(({ category, channels: categoryChannels }) => {
              const containerId = category?.id ?? NO_CATEGORY
              const isCollapsed = category ? collapsedCategories.has(category.id) : false

              return (
                <div key={containerId} className="mb-2">
                  {category && (
                    <CategoryHeader
                      category={category}
                      isCollapsed={isCollapsed}
                      canManageChannels={canManageChannels}
                      isDragOver={overContainerId === containerId && !!activeId}
                      onToggle={() => toggleCategory(category.id)}
                      onAddChannel={() => {
                        setCreateChannelCategoryId(category.id)
                        setShowCreateChannel(true)
                      }}
                    />
                  )}

                  {!isCollapsed && (
                    <SortableContext
                      id={containerId}
                      items={items[containerId] ?? []}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-0.5 px-2 min-h-[4px]">
                        {categoryChannels.map((channel) => (
                          <SortableChannelItem
                            key={channel.id}
                            channel={channel}
                            isActive={activeChannelId === channel.id}
                            isVoiceActive={voiceChannelId === channel.id}
                            canManageChannels={canManageChannels}
                            isDragging={activeId === channel.id}
                            onClick={() => {
                              if (channel.type === "text") {
                                router.push(`/channels/${server.id}/${channel.id}`)
                              } else if (channel.type === "voice") {
                                setVoiceChannel(channel.id, server.id)
                                router.push(`/channels/${server.id}/${channel.id}`)
                              }
                            }}
                            onDelete={() => handleDeleteChannel(channel.id, channel.name)}
                          />
                        ))}

                        {/* Drop hint for empty categories */}
                        {categoryChannels.length === 0 && activeId && (
                          <div className="h-8 rounded border border-dashed border-white/20 flex items-center justify-center">
                            <span className="text-xs" style={{ color: '#949ba4' }}>Drop here</span>
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  )}
                </div>
              )
            })}

            <DragOverlay dropAnimation={null}>
              {activeChannel ? (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-white shadow-lg opacity-90"
                  style={{ background: '#313338', width: '208px' }}
                >
                  {activeChannel.type === "text" ? (
                    <Hash className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  )}
                  <span className="truncate">{activeChannel.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add channel button */}
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
          channels={channels.filter((c) => c.type === "text").map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </TooltipProvider>
  )
}

function CategoryHeader({
  category,
  isCollapsed,
  canManageChannels,
  isDragOver,
  onToggle,
  onAddChannel,
}: {
  category: ChannelRow
  isCollapsed: boolean
  canManageChannels: boolean
  isDragOver: boolean
  onToggle: () => void
  onAddChannel: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-1 cursor-pointer group rounded mx-1 transition-colors",
        isDragOver && "bg-white/5"
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1">
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3" style={{ color: '#949ba4' }} />
        ) : (
          <ChevronDown className="w-3 h-3" style={{ color: '#949ba4' }} />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#949ba4' }}>
          {category.name}
        </span>
      </div>
      {canManageChannels && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); onAddChannel() }}
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
  )
}

function SortableChannelItem({
  channel,
  isActive,
  isVoiceActive,
  canManageChannels,
  isDragging,
  onClick,
  onDelete,
}: {
  channel: ChannelRow
  isActive: boolean
  isVoiceActive: boolean
  canManageChannels: boolean
  isDragging: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: channel.id })
  const { toast } = useToast()

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded w-full text-left transition-colors text-sm group/channel",
              isActive || isVoiceActive
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            )}
          >
            {canManageChannels && (
              <span
                {...attributes}
                {...listeners}
                className="opacity-0 group-hover/channel:opacity-100 cursor-grab active:cursor-grabbing flex-shrink-0 -ml-1 touch-none"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-3 h-3" style={{ color: '#949ba4' }} />
              </span>
            )}
            {channel.type === "text" ? (
              <Hash className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Volume2
                className="w-4 h-4 flex-shrink-0"
                style={{ color: isVoiceActive ? '#23a55a' : undefined }}
              />
            )}
            <span className="truncate">{channel.name}</span>
            {isVoiceActive && (
              <span className="ml-auto">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
              </span>
            )}
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
    </div>
  )
}
