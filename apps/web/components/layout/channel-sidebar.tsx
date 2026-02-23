"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Clipboard, Trash2, MessageSquare, Mic2, Megaphone, Image, Clock, GripVertical, CalendarDays, Command, Search
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
import { QuickSwitcherModal } from "@/components/modals/quickswitcher-modal"
import { SearchModal } from "@/components/modals/search-modal"
import { PERMISSIONS, hasPermission } from "@vortex/shared"
import { useUnreadChannels } from "@/hooks/use-unread-channels"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { NotificationBell } from "@/components/notifications/notification-bell"

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
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useKeyboardShortcuts({
    onQuickSwitcher: useCallback(() => setQuickSwitcherOpen(true), []),
    onSearch: useCallback(() => setSearchOpen(true), []),
  })

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
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-white/5 motion-interactive motion-press group focus-ring" aria-label="Open server settings"
          style={{ borderColor: '#1e1f22' }}
        >
          <span className="font-semibold text-white truncate text-sm">{server.name}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-white motion-interactive motion-press" />
        </button>

        <button
          onClick={() => router.push(`/channels/${server.id}/events`)}
          className="mx-2 mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 motion-interactive motion-press hover:bg-white/10 focus-ring" aria-label="Open server events"
        >
          <CalendarDays className="h-4 w-4" />
          Events
        </button>

        <div className="mx-2 mt-2 space-y-1">
          <button
            onClick={() => setQuickSwitcherOpen(true)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-200 motion-interactive motion-press hover:bg-white/10 focus-ring"
            aria-label="Open quick switcher"
          >
            <span className="flex items-center gap-2">
              <Command className="h-4 w-4" />
              Quick Switcher
            </span>
            <span className="text-[10px] uppercase tracking-wide tertiary-metadata">⌘K</span>
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-200 motion-interactive motion-press hover:bg-white/10 focus-ring"
            aria-label="Open channel search"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </span>
            <span className="text-[10px] uppercase tracking-wide tertiary-metadata">⌘F</span>
          </button>

          <NotificationBell userId={currentUserId} variant="sidebar" />
        </div>

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
                            <span className="text-xs tertiary-metadata">Drop here</span>
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
                className="flex items-center gap-1 px-2 py-1 rounded w-full hover:bg-white/5 motion-interactive motion-press focus-ring tertiary-metadata" aria-label="Add channel"
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

        {quickSwitcherOpen && <QuickSwitcherModal onClose={() => setQuickSwitcherOpen(false)} />}
        {searchOpen && (
          <SearchModal
            serverId={server.id}
            onClose={() => setSearchOpen(false)}
            onJumpToMessage={(channelId, messageId) => {
              router.push(`/channels/${server.id}/${channelId}?message=${encodeURIComponent(messageId)}`)
            }}
          />
        )}

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
                className="px-4 py-2 rounded text-sm font-medium motion-interactive motion-press hover:bg-white/10 focus-ring"
                style={{ color: '#b5bac1' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteChannel}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600 hover:bg-red-500 text-white motion-interactive motion-press focus-ring"
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

/** Returns a short human-readable string for the time remaining until `expiresAt`. */
function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "expired"
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) return `${totalHours}h`
  const totalDays = Math.floor(totalHours / 24)
  return `${totalDays}d`
}

function ChannelIcon({ channel, isVoiceActive }: { channel: ChannelRow; isVoiceActive: boolean }) {
  const iconStyle = { color: isVoiceActive ? '#23a55a' : undefined }
  switch (channel.type) {
    case "voice":        return <Volume2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "forum":        return <MessageSquare className="w-4 h-4 flex-shrink-0 tertiary-metadata" />
    case "stage":        return <Mic2 className="w-4 h-4 flex-shrink-0" style={iconStyle} />
    case "announcement": return <Megaphone className="w-4 h-4 flex-shrink-0 tertiary-metadata" />
    case "media":        return <Image className="w-4 h-4 flex-shrink-0 tertiary-metadata" />
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
        "flex items-center justify-between px-2 py-1 group rounded mx-1 motion-interactive motion-press",
        isDragOver && "bg-white/5"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 flex-1 min-w-0 text-left focus-ring rounded-sm"
        aria-label={`${isCollapsed ? "Expand" : "Collapse"} category ${category.name}`}
      >
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3 tertiary-metadata" />
        ) : (
          <ChevronDown className="w-3 h-3 tertiary-metadata" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider tertiary-metadata truncate">
          {category.name}
        </span>
      </button>
      {canManageChannels && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddChannel() }}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-white motion-interactive focus-ring rounded-sm tertiary-metadata" aria-label={`Create channel in ${category.name}`}
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

  // Live countdown for temporary channels
  const [timeRemaining, setTimeRemaining] = useState<string | null>(
    channel.expires_at ? formatTimeRemaining(channel.expires_at) : null
  )
  useEffect(() => {
    if (!channel.expires_at) return
    setTimeRemaining(formatTimeRemaining(channel.expires_at))
    const msRemaining = new Date(channel.expires_at).getTime() - Date.now()
    const delay = msRemaining <= 60_000 ? 1_000 : 30_000
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(channel.expires_at!))
    }, delay)
    return () => clearInterval(interval)
  }, [channel.expires_at])

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
            aria-label={`${channel.type} channel ${channel.name}`}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded w-full text-left motion-interactive motion-press text-sm group/channel cursor-pointer select-none focus-ring",
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
                <GripVertical className="w-3 h-3 tertiary-metadata" />
              </span>
            )}
            <ChannelIcon channel={channel} isVoiceActive={isVoiceActive} />
            <span className={cn("truncate flex-1", isUnread && !isActive ? "font-semibold" : "")}>
              {channel.name}
            </span>
            <span className="ml-auto flex items-center gap-1 flex-shrink-0 tertiary-metadata">
              {timeRemaining && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded"
                      style={{ background: 'rgba(250,166,26,0.15)', color: '#faa61a' }}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {timeRemaining}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Temporary channel — deletes {timeRemaining === "expired" ? "soon" : `in ${timeRemaining}`}
                  </TooltipContent>
                </Tooltip>
              )}
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

        <ContextMenuContent className="w-48" aria-label={`Channel actions for #${channel.name}`}>
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
