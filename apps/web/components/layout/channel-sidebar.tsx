"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Hash, Volume2, ChevronDown, ChevronRight,
  Plus, Clipboard, Pencil, Trash2, MessageSquare, Mic2, Megaphone, Image, Clock, GripVertical, CalendarDays, MessageCircle,
  MicOff, Headphones
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
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
import type { ChannelRow, RoleRow, ServerRow, UserRow } from "@/types/database"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { CreateChannelModal } from "@/components/modals/create-channel-modal"
import { EditChannelModal } from "@/components/modals/edit-channel-modal"
import { ServerSettingsModal } from "@/components/modals/server-settings-modal"
import { UserPanel } from "@/components/layout/user-panel"
import { QuickSwitcherModal } from "@/components/modals/quickswitcher-modal"
import { SearchModal } from "@/components/modals/search-modal"
import { KeyboardShortcutsModal } from "@/components/modals/keyboard-shortcuts-modal"
import { PERMISSIONS, hasPermission } from "@vortex/shared"
import { useUnreadChannels } from "@/hooks/use-unread-channels"
import { useNotificationSound } from "@/hooks/use-notification-sound"
import { useKeyboardShortcuts, type ShortcutHandlers } from "@/hooks/use-keyboard-shortcuts"

const NO_CATEGORY = "__no_category__"

interface VoiceParticipant {
  user_id: string
  channel_id: string
  muted: boolean
  deafened: boolean
  user: Pick<UserRow, "id" | "username" | "display_name" | "avatar_url"> | null
}

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

const CATEGORY_DRAG_PREFIX = "category:"

function getCategoryDragId(categoryId: string) {
  return `${CATEGORY_DRAG_PREFIX}${categoryId}`
}

function getCategoryIdFromDragId(id: string) {
  return id.startsWith(CATEGORY_DRAG_PREFIX) ? id.slice(CATEGORY_DRAG_PREFIX.length) : null
}

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

function normalizeVoiceParticipants(rows: any[]): VoiceParticipant[] {
  return rows.map((d: any) => ({
    user_id: d.user_id,
    channel_id: d.channel_id,
    muted: d.muted,
    deafened: d.deafened,
    user: d.users ?? null,
  }))
}

async function fetchThreadCounts(serverId: string, signal: AbortSignal) {
  const response = await fetch(`/api/threads/counts?serverId=${serverId}`, { signal })
  if (!response.ok) return null
  const data = await response.json()
  return data && typeof data === "object" ? data as Record<string, number> : null
}

/** Server channel sidebar with drag-and-drop reordering, category grouping, voice state indicators, and unread tracking. */
export function ChannelSidebar({ server, channels: initialChannels, currentUserId, isOwner, userRoles }: Props) {
  const { activeChannelId, voiceChannelId, setVoiceChannel, channels: storeChannels, setChannels, addChannel, updateChannel, removeChannel, toggleMemberList, toggleThreadPanel, toggleWorkspacePanel } = useAppStore(
    useShallow((s) => ({ activeChannelId: s.activeChannelId, voiceChannelId: s.voiceChannelId, setVoiceChannel: s.setVoiceChannel, channels: s.channels, setChannels: s.setChannels, addChannel: s.addChannel, updateChannel: s.updateChannel, removeChannel: s.removeChannel, toggleMemberList: s.toggleMemberList, toggleThreadPanel: s.toggleThreadPanel, toggleWorkspacePanel: s.toggleWorkspacePanel }))
  )
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, string[]>>({})
  const [overContainerId, setOverContainerId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<ChannelRow | null>(null)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [activeThreadCounts, setActiveThreadCounts] = useState<Record<string, number>>({})
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
  const grouped = useMemo(() => groupChannels(channels), [channels])

  useEffect(() => {
    const controller = new AbortController()

    async function loadThreadCounts() {
      try {
        const data = await fetchThreadCounts(server.id, controller.signal)
        if (!controller.signal.aborted && data) {
          setActiveThreadCounts(data)
        }
      } catch (error: any) {
        if (error?.name !== "AbortError") console.error("Failed to load thread counts", error)
      }
    }

    void loadThreadCounts()
    const interval = window.setInterval(() => {
      void loadThreadCounts()
    }, 30000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [server.id])

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

  // Voice participants per channel
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([])

  useEffect(() => {
    const supabase = createClientSupabaseClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    async function fetchVoiceParticipants() {
      const { data } = await supabase
        .from("voice_states")
        .select("user_id, channel_id, muted, deafened, users(id, username, display_name, avatar_url)")
        .eq("server_id", server.id)
      if (cancelled) return
      setVoiceParticipants(normalizeVoiceParticipants(data ?? []))
    }

    function debouncedFetch() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(fetchVoiceParticipants, 300)
    }

    fetchVoiceParticipants()

    const subscription = supabase
      .channel(`voice-states:${server.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_states", filter: `server_id=eq.${server.id}` },
        debouncedFetch
      )
      .subscribe()

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(subscription)
    }
  }, [server.id])

  // Pre-group voice participants by channel to avoid per-item filtering
  const voiceParticipantsByChannel = useMemo(() => {
    const map = new Map<string, VoiceParticipant[]>()
    for (const p of voiceParticipants) {
      const list = map.get(p.channel_id)
      if (list) list.push(p)
      else map.set(p.channel_id, [p])
    }
    return map
  }, [voiceParticipants])

  // Compute effective permissions
  const userPermissions = userRoles.reduce((acc, role) => acc | role.permissions, 0)
  const canManageChannels = isOwner || hasPermission(userPermissions, "MANAGE_CHANNELS")

  // Track unread state for all text channels in this server
  const textChannelIds = useMemo(() => channels.filter((c) => c.type === "text").map((c) => c.id), [channels])
  const { playNotification } = useNotificationSound()
  const { unreadChannelIds, mentionCounts, markRead } = useUnreadChannels(
    server.id,
    textChannelIds,
    currentUserId,
    activeChannelId,
    playNotification
  )

  const navigableChannelIds = useMemo(
    () => channels.filter((channel) => channel.type !== "category").sort((a, b) => a.position - b.position).map((channel) => channel.id),
    [channels]
  )

  const unreadNavigableChannelIds = useMemo(
    () => navigableChannelIds.filter((id) => unreadChannelIds.has(id)),
    [navigableChannelIds, unreadChannelIds]
  )

  const jumpToChannel = useCallback((channelId: string) => {
    if (!channelId) return
    router.push(`/channels/${server.id}/${channelId}`)
  }, [router, server.id])

  const jumpRelative = useCallback((ids: string[], direction: "next" | "prev") => {
    if (ids.length === 0) return
    const currentIndex = activeChannelId ? ids.indexOf(activeChannelId) : -1
    const nextIndex = direction === "next"
      ? (currentIndex >= ids.length - 1 ? 0 : currentIndex + 1)
      : (currentIndex <= 0 ? ids.length - 1 : currentIndex - 1)
    jumpToChannel(ids[nextIndex])
  }, [activeChannelId, jumpToChannel])

  const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
    onQuickSwitcher: () => setQuickSwitcherOpen(true),
    onSearch: () => setSearchOpen(true),
    onSearchInChannel: () => setSearchOpen(true),
    onMarkRead: () => {
      if (activeChannelId) void markRead(activeChannelId)
    },
    onJumpChannelPrev: () => jumpRelative(navigableChannelIds, "prev"),
    onJumpChannelNext: () => jumpRelative(navigableChannelIds, "next"),
    onJumpUnreadPrev: () => jumpRelative(unreadNavigableChannelIds, "prev"),
    onJumpUnreadNext: () => jumpRelative(unreadNavigableChannelIds, "next"),
    onToggleMemberList: () => toggleMemberList(),
    onToggleThreadPanel: () => toggleThreadPanel(),
    onToggleWorkspacePanel: () => toggleWorkspacePanel(),
    onOpenShortcutHelp: () => setShortcutHelpOpen(true),
    onAnalytics: (event) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[shortcuts] analytics", event)
      }
    },
  }), [activeChannelId, jumpRelative, markRead, navigableChannelIds, unreadNavigableChannelIds, toggleMemberList, toggleThreadPanel, toggleWorkspacePanel])

  useKeyboardShortcuts(shortcutHandlers)

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
    if (getCategoryIdFromDragId(draggedId)) {
      return
    }
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

    const draggedCategoryId = getCategoryIdFromDragId(draggedId)
    const overCategoryId = getCategoryIdFromDragId(overId)

    if (draggedCategoryId && overCategoryId && draggedCategoryId !== overCategoryId) {
      persistCategoryOrder(draggedCategoryId, overCategoryId)
      return
    }

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

  async function persistCategoryOrder(draggedCategoryId: string, overCategoryId: string) {
    const categories = channels
      .filter((channel) => channel.type === "category")
      .sort((a, b) => a.position - b.position)
    const oldIndex = categories.findIndex((category) => category.id === draggedCategoryId)
    const newIndex = categories.findIndex((category) => category.id === overCategoryId)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(categories, oldIndex, newIndex)
    const updates = reordered.map((category, index) => ({ id: category.id, position: index }))
    updates.forEach(({ id, position }) => updateChannel(id, { position }))

    const supabase = createClientSupabaseClient()
    try {
      const results = await Promise.all(
        updates.map(({ id, position }) =>
          supabase.from("channels").update({ position }).eq("id", id)
        )
      )
      const failed = results.find(({ error }) => error)
      if (failed?.error) throw failed.error
    } catch (error: any) {
      categories.forEach((category) => updateChannel(category.id, { position: category.position }))
      toast({ variant: "destructive", title: "Failed to save category order", description: error.message })
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
  const activeCategoryId = activeId ? getCategoryIdFromDragId(activeId) : null
  const activeCategory = activeCategoryId ? channels.find((c) => c.id === activeCategoryId) : null

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
        style={{ background: 'var(--theme-bg-secondary)' }}
      >
        {/* Server header */}
        <button
          onClick={() => setShowServerSettings(true)}
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer hover:bg-white/5 motion-interactive motion-press group focus-ring" aria-label="Open server settings"
          style={{ borderColor: 'var(--theme-bg-tertiary)' }}
        >
          <span className="font-semibold text-white truncate text-sm">{server.name}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-white motion-interactive" />
        </button>

        <button
          onClick={() => router.push(`/channels/${server.id}/events`)}
          className="mx-2 mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 motion-interactive motion-press hover:bg-white/10 focus-ring" aria-label="Open server events"
        >
          <CalendarDays className="h-4 w-4" />
          Events
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
            <SortableContext
              items={grouped.filter((g) => g.category).map((g) => getCategoryDragId(g.category!.id))}
              strategy={verticalListSortingStrategy}
            >
            {liveGrouped.map(({ category, channels: categoryChannels }) => {
              const containerId = category?.id ?? NO_CATEGORY
              const isCollapsed = category ? collapsedCategories.has(category.id) : false

              return (
                <div key={containerId} className="mb-2">
                  {category && (
                    <CategoryHeader
                      category={category}
                      containerId={containerId}
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

                  {!category && <DropContainer id={containerId} />}

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
                            activeThreadCount={activeThreadCounts[channel.id] ?? 0}
                            voiceParticipants={
                              (VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)
                                ? voiceParticipantsByChannel.get(channel.id)
                                : undefined
                            }
                            onClick={() => {
                              if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
                                setVoiceChannel(channel.id, server.id)
                              }
                              router.push(`/channels/${server.id}/${channel.id}`)
                            }}
                            onEdit={() => setEditTarget(channel)}
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
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeChannel ? (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-white shadow-lg opacity-90"
                  style={{ background: 'var(--theme-bg-primary)', width: '208px' }}
                >
                  <ChannelIcon channel={activeChannel} isVoiceActive={false} />
                  <span className="truncate">{activeChannel.name}</span>
                </div>
              ) : activeCategory ? (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-white shadow-lg opacity-90"
                  style={{ background: 'var(--theme-bg-primary)', width: '208px' }}
                >
                  <ChevronDown className="w-3 h-3 tertiary-metadata" />
                  <span className="truncate uppercase text-xs font-semibold tracking-wider">{activeCategory.name}</span>
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
        <KeyboardShortcutsModal
          open={shortcutHelpOpen}
          onOpenChange={setShortcutHelpOpen}
          handlers={shortcutHandlers}
        />
        {editTarget && (
          <EditChannelModal
            open={!!editTarget}
            onClose={() => setEditTarget(null)}
            channel={editTarget}
          />
        )}

        {/* Delete channel confirmation dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <DialogContent style={{ background: 'var(--theme-bg-primary)', borderColor: 'var(--theme-bg-tertiary)' }}>
            <DialogHeader>
              <DialogTitle className="text-white">Delete Channel</DialogTitle>
              <DialogDescription style={{ color: 'var(--theme-text-secondary)' }}>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-white">#{deleteTarget?.name}</span>?
                {" "}This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded text-sm font-medium motion-interactive motion-press hover:bg-white/10 focus-ring"
                style={{ color: 'var(--theme-text-secondary)' }}
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
  const iconStyle = { color: isVoiceActive ? 'var(--theme-success)' : undefined }
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
  containerId,
  isCollapsed,
  canManageChannels,
  isDragOver,
  onToggle,
  onAddChannel,
}: {
  category: ChannelRow
  containerId: string
  isCollapsed: boolean
  canManageChannels: boolean
  isDragOver: boolean
  onToggle: () => void
  onAddChannel: () => void
}) {
  const { setNodeRef } = useDroppable({ id: containerId })
  const sortable = useSortable({ id: getCategoryDragId(category.id), disabled: !canManageChannels })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between px-2 py-1 group rounded mx-1 motion-interactive",
        isDragOver && "bg-white/5"
      )}
    >
      <button
        ref={setNodeRef}
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
        <div className="flex items-center">
          <span
            {...sortable.attributes}
            {...sortable.listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing tertiary-metadata"
            onClick={(event) => event.stopPropagation()}
          >
            <GripVertical className="w-3 h-3" />
          </span>
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
        </div>
      )}
    </div>
  )
}

function DropContainer({ id }: { id: string }) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef} className="h-0" aria-hidden />
}

function SortableChannelItem({
  channel,
  isActive,
  isVoiceActive,
  canManageChannels,
  isDragging,
  isUnread,
  mentionCount,
  activeThreadCount,
  voiceParticipants,
  onClick,
  onEdit,
  onDelete,
}: {
  channel: ChannelRow
  isActive: boolean
  isVoiceActive: boolean
  canManageChannels: boolean
  isDragging: boolean
  isUnread?: boolean
  mentionCount?: number
  activeThreadCount?: number
  voiceParticipants?: VoiceParticipant[]
  onClick: () => void
  onEdit: () => void
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
              "relative flex items-center gap-2 px-2 py-1.5 rounded w-full text-left motion-interactive motion-press text-sm group/channel cursor-pointer select-none focus-ring",
              isActive || isVoiceActive
                ? "text-white"
                : isUnread
                ? "text-white hover:bg-white/5"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            )}
            style={isActive || isVoiceActive ? { background: "color-mix(in srgb, var(--theme-accent) 14%, var(--theme-surface-elevated))" } : undefined}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-300",
                isActive || isVoiceActive
                  ? "opacity-100 h-8 w-1"
                  : "opacity-0 h-5 w-0 group-hover/channel:opacity-60 group-hover/channel:w-0.5 group-hover/channel:h-5"
              )}
              style={{ background: "var(--theme-accent)", boxShadow: isActive || isVoiceActive ? "2px 0 8px color-mix(in srgb, var(--theme-accent) 60%, transparent)" : undefined }}
            />
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
                      style={{ background: 'color-mix(in srgb, var(--theme-warning) 15%, transparent)', color: 'var(--theme-warning)' }}
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
                  style={{ background: "var(--theme-danger)" }}
                >
                  {(mentionCount ?? 0) > 99 ? "99+" : mentionCount}
                </span>
              ) : showBadge ? (
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--theme-text-primary)" }} />
              ) : null}
              {(activeThreadCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--theme-accent) 22%, transparent)", color: "color-mix(in srgb, var(--theme-accent) 80%, white)" }}
                  title={`${activeThreadCount} active ${activeThreadCount === 1 ? "thread" : "threads"} in #${channel.name}`}
                >
                  <MessageCircle className="h-2.5 w-2.5" />
                  {activeThreadCount}
                </span>
              )}
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
              <ContextMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" /> Edit Channel
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Channel
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Voice participants listed under voice channels */}
      {voiceParticipants && voiceParticipants.length > 0 && (
        <div className="ml-6 mt-0.5 space-y-0.5">
          {voiceParticipants.map((participant) => {
            const name = participant.user?.display_name || participant.user?.username || "Unknown"
            const initials = name.slice(0, 2).toUpperCase()
            return (
              <div
                key={participant.user_id}
                className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-white/5"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                <Avatar className="w-5 h-5 flex-shrink-0">
                  {participant.user?.avatar_url && (
                    <AvatarImage src={participant.user.avatar_url} />
                  )}
                  <AvatarFallback
                    style={{ background: "var(--theme-accent)", color: "white", fontSize: "8px" }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{name}</span>
                {participant.muted && (
                  <MicOff className="w-3 h-3 flex-shrink-0" style={{ color: "var(--theme-danger)" }} />
                )}
                {participant.deafened && (
                  <Headphones className="w-3 h-3 flex-shrink-0" style={{ color: "var(--theme-danger)" }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
