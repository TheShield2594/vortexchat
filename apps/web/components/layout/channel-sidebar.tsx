"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Clipboard, Trash2, MessageSquare, Mic2, Megaphone, Image, GripVertical
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { CreateChannelModal } from "@/components/modals/create-channel-modal"
import { ServerSettingsModal } from "@/components/modals/server-settings-modal"
import { UserPanel } from "@/components/layout/user-panel"
import { PERMISSIONS, hasPermission } from "@vortex/shared"
import { useUnreadChannels } from "@/hooks/use-unread-channels"

const NO_CATEGORY = "__no_category__"

/** Channel types that support messaging (messages table) */
const MESSAGE_CHANNEL_TYPES = ["text", "announcement", "forum", "media"] as const

/** Channel types that use voice infrastructure */
const VOICE_CHANNEL_TYPES = ["voice", "stage"] as const

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

/**
 * Merge incoming channel data into the current drag-ordered items.
 * - Preserves the existing display order within each container.
 * - Appends channels that arrived while dragging to the end of their container.
 * - Removes channels that were deleted while dragging.
 */
function mergeItemsPreservingOrder(
  prev: Record<string, string[]>,
  next: Record<string, string[]>
): Record<string, string[]> {
  const merged: Record<string, string[]> = {}
  const allContainers = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const containerId of allContainers) {
    const prevIds = prev[containerId] ?? []
    const nextIds = next[containerId] ?? []
    const nextSet = new Set(nextIds)
    const kept = prevIds.filter((id) => nextSet.has(id))
    const keptSet = new Set(kept)
    const added = nextIds.filter((id) => !keptSet.has(id))
    merged[containerId] = [...kept, ...added]
  }
  return merged
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  // Always reflects the latest committed items — used in drag handlers to avoid stale closures
  const itemsRef = useRef<Record<string, string[]>>({})
  itemsRef.current = items

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Seed store with server-fetched channels once per server
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

  // Sync items on channel changes.
  // During an active drag, merge instead of replacing so realtime inserts/deletes
  // are not dropped and the in-progress drag order is preserved.
  useEffect(() => {
    if (activeId) {
      setItems((prev) => mergeItemsPreservingOrder(prev, buildItems(grouped)))
    } else {
      setItems(buildItems(grouped))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, activeId])

  // Subscribe to realtime channel changes (INSERT / UPDATE / DELETE)
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
        { event: "UPDATE", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => { updateChannel((payload.new as ChannelRow).id, payload.new as ChannelRow) }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channels", filter: `server_id=eq.${server.id}` },
        (payload) => { removeChannel((payload.old as { id: string }).id) }
      )
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }, [server.id, addChannel, updateChannel, removeChannel])

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

  async function confirmDeleteChannel() {
    if (!deleteTarget) return
    const { id: channelId } = deleteTarget
    setDeleteTarget(null)
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
    for (const [containerId, channelIds] of Object.entries(itemsRef.current)) {
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

    const targetContainer = itemsRef.current[overId] !== undefined ? overId : findContainer(overId)
    setOverContainerId(targetContainer)

    const sourceContainer = findContainer(draggedId)
    if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return

    // Move optimistically between containers; keep ref in sync immediately
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

      const next = { ...prev, [sourceContainer]: sourceItems, [targetContainer]: targetItems }
      itemsRef.current = next
      return next
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverContainerId(null)

    if (!over) return

    const draggedId = active.id as string
    const overId = over.id as string

    // Read from ref to get the latest state (avoids stale closure from batched updates)
    const latestItems = itemsRef.current
    const sourceContainer = findContainer(draggedId)
    const targetContainer = latestItems[overId] !== undefined ? overId : findContainer(overId)

    if (!sourceContainer || !targetContainer) return

    if (sourceContainer === targetContainer && draggedId !== overId) {
      // Compute the reordered array first, then update state and persist — no side
      // effects inside the functional updater
      const containerItems = [...(latestItems[sourceContainer] ?? [])]
      const oldIndex = containerItems.indexOf(draggedId)
      const newIndex = containerItems.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(containerItems, oldIndex, newIndex)
      setItems((prev) => ({ ...prev, [sourceContainer]: reordered }))
      persistChannelOrder(sourceContainer, reordered)
    } else if (sourceContainer !== targetContainer) {
      // Cross-container move was already applied in handleDragOver; persist both
      persistChannelOrder(sourceContainer, latestItems[sourceContainer] ?? [])
      persistChannelOrder(targetContainer, latestItems[targetContainer] ?? [])
    }
  }

  async function persistChannelOrder(containerId: string, orderedIds: string[]) {
    if (orderedIds.length === 0) return
    const supabase = createClientSupabaseClient()
    const newParentId = containerId === NO_CATEGORY ? null : containerId

    // Capture current state for rollback
    const previous = orderedIds.map((id) => {
      const ch = channels.find((c) => c.id === id)
      return { id, position: ch?.position ?? 0, parent_id: ch?.parent_id ?? null }
    })

    // Optimistic update — both parent_id and position
    orderedIds.forEach((id, i) => {
      updateChannel(id, { parent_id: newParentId, position: i })
    })

    try {
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from("channels").update({ position: i, parent_id: newParentId }).eq("id", id)
        )
      )
      const failed = results.find(({ error }) => error)
      if (failed?.error) throw failed.error
    } catch (error: any) {
      // Rollback optimistic update
      for (const { id, position, parent_id } of previous) {
        updateChannel(id, { position, parent_id })
      }
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
                            isUnread={unreadChannelIds.has(channel.id)}
                            mentionCount={mentionCounts[channel.id] ?? 0}
                            onClick={() => {
                              if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
                                setVoiceChannel(channel.id, server.id)
                              }
                              router.push(`/channels/${server.id}/${channel.id}`)
                            }}
                            onDelete={() => setDeleteTarget({ id: channel.id, name: channel.name })}
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
                  <ChannelIcon channel={activeChannel} isVoiceActive={false} />
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
          channels={webhookEligibleChannels}
        />

        {/* Delete channel confirmation dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <DialogContent style={{ background: '#313338', borderColor: '#1e1f22' }}>
            <DialogHeader>
              <DialogTitle className="text-white">Delete Channel</DialogTitle>
              <DialogDescription style={{ color: '#b5bac1' }}>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-white">#{deleteTarget?.name}</span>?
                {" "}This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded text-sm font-medium transition-colors hover:bg-white/10"
                style={{ color: '#b5bac1' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteChannel}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Delete Channel
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

function ChannelIcon({ channel, isVoiceActive }: { channel: ChannelRow; isVoiceActive: boolean }) {
  const iconStyle = { color: isVoiceActive ? '#23a55a' : undefined }
  switch (channel.type) {
    case "voice":        return <Volume2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "forum":        return <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    case "stage":        return <Mic2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "announcement": return <Megaphone className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    case "media":        return <Image className="w-4 h-4 flex-shrink-0" style={{ color: '#949ba4' }} />
    default:             return <Hash className="w-4 h-4 flex-shrink-0" />
  }
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
  isUnread,
  mentionCount,
  onClick,
  onDelete,
}: {
  channel: ChannelRow
  isActive: boolean
  isVoiceActive: boolean
  canManageChannels: boolean
  isDragging: boolean
  isUnread?: boolean
  mentionCount?: number
  onClick: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: channel.id })
  const { toast } = useToast()
  const showBadge = !isActive && (isUnread || (mentionCount ?? 0) > 0)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/*
            Use a div with role="button" instead of a native <button> so the
            drag-handle span (which carries dnd-kit's event listeners) is not an
            interactive element nested inside another interactive element.
          */}
          <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded w-full text-left transition-colors text-sm group/channel cursor-pointer select-none",
              isActive || isVoiceActive
                ? "bg-white/10 text-white"
                : isUnread
                ? "text-white hover:bg-white/5"
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
            <ChannelIcon channel={channel} isVoiceActive={isVoiceActive} />
            <span className={cn("truncate flex-1", isUnread && !isActive ? "font-semibold" : "")}>
              {channel.name}
            </span>
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
          </div>
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
