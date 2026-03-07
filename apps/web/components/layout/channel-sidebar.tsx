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
import dynamic from "next/dynamic"
import { UserPanel } from "@/components/layout/user-panel"

const CreateChannelModal = dynamic(() => import("@/components/modals/create-channel-modal").then((m) => ({ default: m.CreateChannelModal })))
const EditChannelModal = dynamic(() => import("@/components/modals/edit-channel-modal").then((m) => ({ default: m.EditChannelModal })))
const ServerSettingsModal = dynamic(() => import("@/components/modals/server-settings-modal").then((m) => ({ default: m.ServerSettingsModal })))
const QuickSwitcherModal = dynamic(() => import("@/components/modals/quickswitcher-modal").then((m) => ({ default: m.QuickSwitcherModal })))
const SearchModal = dynamic(() => import("@/components/modals/search-modal").then((m) => ({ default: m.SearchModal })))
const KeyboardShortcutsModal = dynamic(() => import("@/components/modals/keyboard-shortcuts-modal").then((m) => ({ default: m.KeyboardShortcutsModal })))
import { PERMISSIONS, hasPermission } from "@vortex/shared"
import { useUnreadChannels } from "@/hooks/use-unread-channels"
import { useNotificationSound } from "@/hooks/use-notification-sound"
import { useKeyboardShortcuts, type ShortcutHandlers } from "@/hooks/use-keyboard-shortcuts"

const NO_CATEGORY = "__no_category__"
const MAX_AUTO_EXPANDED_CATEGORIES = 18
const CATEGORY_COLLAPSE_ANIMATION_MAX_HEIGHT = 520

export interface VoiceParticipant {
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
  initialThreadCounts?: Record<string, number>
  initialVoiceParticipants?: VoiceParticipant[]
  initialUnreadChannelIds?: string[]
  initialMentionCounts?: Record<string, number>
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

function buildContainerIndex(items: Record<string, string[]>): Record<string, string> {
  const index: Record<string, string> = {}
  for (const [containerId, channelIds] of Object.entries(items)) {
    for (const channelId of channelIds) {
      index[channelId] = containerId
    }
  }
  return index
}

export function getAutoExpandedCategoryIds(
  channels: ChannelRow[],
  activeChannelId: string | null,
  unreadChannelIds: Set<string>,
  voiceChannelId: string | null
): Set<string> {
  const ranked = new Set<string>()

  const addCategoryId = (channelId: string | null | undefined) => {
    if (!channelId) return
    const channel = channels.find((item) => item.id === channelId)
    if (!channel?.parent_id) return
    ranked.add(channel.parent_id)
  }

  addCategoryId(activeChannelId)
  addCategoryId(voiceChannelId)

  for (const channelId of unreadChannelIds) {
    addCategoryId(channelId)
    if (ranked.size >= MAX_AUTO_EXPANDED_CATEGORIES) break
  }

  return new Set(Array.from(ranked).slice(0, MAX_AUTO_EXPANDED_CATEGORIES))
}

export function resolveExpandedCategoryIds(
  categoryIds: string[],
  autoExpandedCategoryIds: Set<string>,
  manualOverrides: Record<string, boolean>
): Set<string> {
  const expanded = new Set<string>()

  for (const categoryId of categoryIds) {
    if (manualOverrides[categoryId] === false) continue
    if (manualOverrides[categoryId] === true || autoExpandedCategoryIds.has(categoryId)) {
      expanded.add(categoryId)
    }
  }

  return expanded
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

export function normalizeVoiceParticipants(rows: any[]): VoiceParticipant[] {
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
export function ChannelSidebar({ server, channels: initialChannels, currentUserId, isOwner, userRoles, initialThreadCounts, initialVoiceParticipants, initialUnreadChannelIds, initialMentionCounts }: Props) {
  const { activeChannelId, voiceChannelId, setVoiceChannel, channels: storeChannels, setChannels, addChannel, updateChannel, removeChannel, toggleMemberList, toggleThreadPanel, toggleWorkspacePanel, setServerHasUnread } = useAppStore(
    useShallow((s) => ({ activeChannelId: s.activeChannelId, voiceChannelId: s.voiceChannelId, setVoiceChannel: s.setVoiceChannel, channels: s.channels, setChannels: s.setChannels, addChannel: s.addChannel, updateChannel: s.updateChannel, removeChannel: s.removeChannel, toggleMemberList: s.toggleMemberList, toggleThreadPanel: s.toggleThreadPanel, toggleWorkspacePanel: s.toggleWorkspacePanel, setServerHasUnread: s.setServerHasUnread }))
  )
  const [categoryExpansionOverrides, setCategoryExpansionOverrides] = useState<Record<string, boolean>>({})
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, string[]>>({})
  const [overContainerId, setOverContainerId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<ChannelRow | null>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ id: string; name: string } | null>(null)
  const [editCategoryTarget, setEditCategoryTarget] = useState<ChannelRow | null>(null)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [activeThreadCounts, setActiveThreadCounts] = useState<Record<string, number>>(initialThreadCounts ?? {})
  const router = useRouter()
  const { toast } = useToast()

  // Always reflects the latest committed items — used in drag handlers to avoid stale closures
  const itemsRef = useRef<Record<string, string[]>>({})
  itemsRef.current = items
  const containerIndexRef = useRef<Record<string, string>>({})
  const isDraggingRef = useRef(false)
  isDraggingRef.current = activeId !== null
  // After a drag-end reorder, suppress the sync effect briefly.
  // handleDragEnd already set items to the correct order; realtime echoes
  // trigger multiple sync firings that can overwrite items before all
  // position updates propagate through the store.
  const skipSyncUntilRef = useRef(0)

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
  const categoryIds = useMemo(
    () => grouped.map((entry) => entry.category?.id).filter((id): id is string => !!id),
    [grouped]
  )
  const channelById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels])

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

    // Skip the immediate fetch if SSR data was provided — the 30s poll will pick up changes
    if (!initialThreadCounts) {
      void loadThreadCounts()
    }
    const interval = window.setInterval(() => {
      void loadThreadCounts()
    }, 30000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [server.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync items when channels change (store update, realtime event, etc.).
  // After a drag-end reorder, skip syncing for a brief window — handleDragEnd
  // already set items to the correct order, and realtime echoes from the
  // individual Supabase updates can trigger multiple sync firings before all
  // positions have propagated.
  useEffect(() => {
    if (Date.now() < skipSyncUntilRef.current) return
    if (isDraggingRef.current) {
      setItems((prev) => mergeItemsPreservingOrder(prev, buildItems(grouped)))
    } else {
      setItems(buildItems(grouped))
    }
  }, [grouped])

  useEffect(() => {
    containerIndexRef.current = buildContainerIndex(items)
  }, [items])

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
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>(initialVoiceParticipants ?? [])

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

    // Skip initial fetch if SSR data was provided — real-time subscription handles updates
    if (!initialVoiceParticipants) {
      fetchVoiceParticipants()
    }

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
  }, [server.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const unreadInitialData = initialUnreadChannelIds
    ? { unreadChannelIds: initialUnreadChannelIds, mentionCounts: initialMentionCounts ?? {} }
    : undefined
  const { unreadChannelIds, mentionCounts, markRead } = useUnreadChannels(
    server.id,
    textChannelIds,
    currentUserId,
    activeChannelId,
    playNotification,
    unreadInitialData
  )

  // Keep the server-level unread indicator in the app store in sync so the
  // server sidebar can show a pip badge without needing its own subscription.
  //
  // Scope note: this effect only runs while ChannelSidebar is mounted (i.e.
  // while the user is looking at a specific server). Badges for other servers
  // are therefore only populated after the user visits them during a session.
  // A future BackgroundUnreadSync component could subscribe to all servers
  // up-front and call setServerHasUnread centrally, but that would multiply
  // Supabase realtime subscriptions. The current trade-off is intentional.
  useEffect(() => {
    setServerHasUnread(server.id, unreadChannelIds.size > 0)
  }, [server.id, unreadChannelIds, setServerHasUnread])

  useEffect(() => {
    setCategoryExpansionOverrides((prev) => {
      const allowed = new Set(categoryIds)
      const cleaned = Object.entries(prev).filter(([key]) => allowed.has(key))
      return cleaned.length === Object.keys(prev).length ? prev : Object.fromEntries(cleaned)
    })
  }, [categoryIds])

  const autoExpandedCategoryIds = useMemo(
    () => getAutoExpandedCategoryIds(channels, activeChannelId, unreadChannelIds, voiceChannelId),
    [channels, activeChannelId, unreadChannelIds, voiceChannelId]
  )

  const expandedCategoryIds = useMemo(
    () => resolveExpandedCategoryIds(categoryIds, autoExpandedCategoryIds, categoryExpansionOverrides),
    [categoryIds, autoExpandedCategoryIds, categoryExpansionOverrides]
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
    setCategoryExpansionOverrides((prev) => ({
      ...prev,
      [id]: !expandedCategoryIds.has(id),
    }))
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

  async function confirmDeleteCategory() {
    if (!deleteCategoryTarget) return
    const { id: categoryId } = deleteCategoryTarget
    setDeleteCategoryTarget(null)
    const supabase = createClientSupabaseClient()
    try {
      const { error } = await supabase.from("channels").delete().eq("id", categoryId)
      if (error) throw error
      removeChannel(categoryId)
      toast({ title: "Category deleted" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to delete category", description: error.message })
    }
  }

  function findContainer(channelId: string): string | null {
    return containerIndexRef.current[channelId] ?? null
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
    // If hovering over a category sortable (id prefixed "category:"), resolve to the raw category id
    const resolvedOverId = getCategoryIdFromDragId(overId) ?? overId

    const targetContainer = itemsRef.current[resolvedOverId] !== undefined ? resolvedOverId : findContainer(resolvedOverId)
    setOverContainerId(targetContainer)

    const sourceContainer = findContainer(draggedId)
    if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return

    // Move optimistically between containers; update refs eagerly (before
    // setItems) so subsequent handlers read the correct state.
    const prev = itemsRef.current
    const sourceItems = [...(prev[sourceContainer] ?? [])]
    const targetItems = [...(prev[targetContainer] ?? [])]

    const sourceIndex = sourceItems.indexOf(draggedId)
    if (sourceIndex === -1) return
    sourceItems.splice(sourceIndex, 1)

    const overIndex = targetItems.indexOf(resolvedOverId)
    if (overIndex === -1) {
      targetItems.push(draggedId)
    } else {
      targetItems.splice(overIndex, 0, draggedId)
    }

    const next = { ...prev, [sourceContainer]: sourceItems, [targetContainer]: targetItems }
    itemsRef.current = next
    containerIndexRef.current = buildContainerIndex(next)
    setItems(next)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverContainerId(null)

    if (!over) return

    const draggedId = active.id as string
    const overId = over.id as string

    // Category-to-category reorder
    const draggedCategoryId = getCategoryIdFromDragId(draggedId)
    const overCategoryId = getCategoryIdFromDragId(overId)

    if (draggedCategoryId && overCategoryId && draggedCategoryId !== overCategoryId) {
      persistCategoryOrder(draggedCategoryId, overCategoryId)
      return
    }

    // Channel reorder — resolve IDs and containers
    const latestItems = itemsRef.current
    const sourceContainer = findContainer(draggedId)
    const resolvedOverId = getCategoryIdFromDragId(overId) ?? overId
    const targetContainer = latestItems[resolvedOverId] !== undefined ? resolvedOverId : findContainer(resolvedOverId)

    if (!sourceContainer || !targetContainer) return

    if (sourceContainer === targetContainer) {
      const containerItems = [...(latestItems[sourceContainer] ?? [])]
      const oldIndex = containerItems.indexOf(draggedId)
      const newIndex = containerItems.indexOf(resolvedOverId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(containerItems, oldIndex, newIndex)
        // Update refs BEFORE setItems — React 18 batching defers the updater
        // function to the render phase, so refs must be updated eagerly for
        // persistChannelOrder to read the correct order.
        const next = { ...latestItems, [sourceContainer]: reordered }
        itemsRef.current = next
        containerIndexRef.current = buildContainerIndex(next)
        setItems(next)
        skipSyncUntilRef.current = Date.now() + 2000
        persistChannelOrder()
      }
    } else {
      // Cross-container move was already applied in handleDragOver; persist
      skipSyncUntilRef.current = Date.now() + 2000
      persistChannelOrder()
    }
  }

  async function persistAllChannelStructure(categoryOrderOverride?: string[]) {
    const latestItems = itemsRef.current
    const categories = channels
      .filter((channel) => channel.type === "category")
      .sort((a, b) => a.position - b.position)
    const orderedCategoryIds = categoryOrderOverride ?? categories.map((category) => category.id)

    const orderedIds: string[] = [
      ...(latestItems[NO_CATEGORY] ?? []),
      ...orderedCategoryIds.flatMap((categoryId) => [categoryId, ...(latestItems[categoryId] ?? [])]),
    ]

    if (orderedIds.length === 0) return

    const channelById = new Map(channels.map((channel) => [channel.id, channel]))
    const updates = orderedIds
      .map((id, position) => {
        const channel = channelById.get(id)
        if (!channel) return null
        const parent_id = channel.type === "category"
          ? null
          : (findContainer(id) === NO_CATEGORY ? null : findContainer(id))
        return { id, position, parent_id }
      })
      .filter((update): update is { id: string; position: number; parent_id: string | null } => !!update)

    if (updates.length === 0) return

    const previous = updates.map(({ id }) => {
      const channel = channelById.get(id)
      return {
        id,
        position: channel?.position ?? 0,
        parent_id: channel?.parent_id ?? null,
      }
    })

    // Apply all position changes in a single store update to avoid batching issues
    const updateMap = new Map(updates.map(({ id, position, parent_id }) => [id, { position, parent_id }]))
    const updatedChannels = channels.map((c) => {
      const upd = updateMap.get(c.id)
      return upd ? { ...c, ...upd } : c
    })
    setChannels(server.id, updatedChannels)

    const supabase = createClientSupabaseClient()
    try {
      const results = await Promise.all(
        updates.map(({ id, position, parent_id }) =>
          supabase.from("channels").update({ position, parent_id }).eq("id", id)
        )
      )
      const failed = results.find(({ error }) => error)
      if (failed?.error) throw failed.error
    } catch (error: any) {
      // Rollback: restore previous positions in a single store update
      const rollbackMap = new Map(previous.map(({ id, position, parent_id }) => [id, { position, parent_id }]))
      const rolledBack = channels.map((c) => {
        const rb = rollbackMap.get(c.id)
        return rb ? { ...c, ...rb } : c
      })
      setChannels(server.id, rolledBack)
      toast({ variant: "destructive", title: "Failed to save channel order", description: error.message })
    }
  }

  async function persistCategoryOrder(draggedCategoryId: string, overCategoryId: string) {
    const categories = channels
      .filter((channel) => channel.type === "category")
      .sort((a, b) => a.position - b.position)
    const oldIndex = categories.findIndex((category) => category.id === draggedCategoryId)
    const newIndex = categories.findIndex((category) => category.id === overCategoryId)
    if (oldIndex === -1 || newIndex === -1) return

    const reorderedCategoryIds = arrayMove(categories, oldIndex, newIndex).map((category) => category.id)
    await persistAllChannelStructure(reorderedCategoryIds)
  }

  async function persistChannelOrder() {
    await persistAllChannelStructure()
  }

  const activeChannel = activeId ? channels.find((c) => c.id === activeId) : null
  const activeCategoryId = activeId ? getCategoryIdFromDragId(activeId) : null
  const activeCategory = activeCategoryId ? channels.find((c) => c.id === activeCategoryId) : null

  // Rebuild grouped view from live items map to reflect drag state
  const liveGrouped = grouped.map(({ category }) => {
    const key = category?.id ?? NO_CATEGORY
    const channelIds = items[key] ?? []
    const categoryChannels = channelIds
      .map((id) => channelById.get(id))
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
        className="w-60 flex flex-col flex-shrink-0 channel-sidebar-surface"
      >
        {/* Server header */}
        <button
          onClick={() => setShowServerSettings(true)}
          className="flex items-center justify-between px-4 py-3 border-b cursor-pointer surface-hover motion-interactive motion-press group focus-ring channel-sidebar-header" aria-label="Open server settings"
        >
          <span className="font-semibold truncate text-sm channel-sidebar-title">{server.name}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 motion-interactive text-muted-interactive" />
        </button>

        <button
          onClick={() => router.push(`/channels/${server.id}/events`)}
          className="mx-2 mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm surface-hover-md motion-interactive motion-press focus-ring channel-sidebar-events" aria-label="Open server events"
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
              const isCollapsed = category ? !expandedCategoryIds.has(category.id) : false

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
                      onEdit={() => setEditCategoryTarget(category)}
                      onDelete={() => setDeleteCategoryTarget({ id: category.id, name: category.name })}
                      onCopyId={() => {
                        navigator.clipboard.writeText(category.id)
                        toast({ title: "Category ID copied!" })
                      }}
                    />
                  )}

                  {!category && <DropContainer id={containerId} />}

                  <SortableContext
                    id={containerId}
                    items={items[containerId] ?? []}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      className={cn(
                        "space-y-0.5 px-2 min-h-[4px] overflow-hidden transition-[max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                        isCollapsed ? "max-h-0 opacity-0 -translate-y-1 pointer-events-none" : "opacity-100 translate-y-0"
                      )}
                      style={{ maxHeight: isCollapsed ? 0 : Math.min(CATEGORY_COLLAPSE_ANIMATION_MAX_HEIGHT, Math.max(32, categoryChannels.length * 36)) }}
                    >
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
                              if (channel.parent_id) {
                                setCategoryExpansionOverrides((prev) => ({ ...prev, [channel.parent_id!]: true }))
                              }
                              if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
                                setVoiceChannel(channel.id, server.id)
                              }
                              router.push(`/channels/${server.id}/${channel.id}`)
                            }}
                            onEdit={() => setEditTarget(channel)}
                            onDelete={() => setDeleteTarget({ id: channel.id, name: channel.name })}
                            onCreateThread={() => {
                              router.push(`/channels/${server.id}/${channel.id}?createThread=1`)
                            }}
                          />
                        ))}

                        {/* Drop hint for empty categories */}
                        {categoryChannels.length === 0 && activeId && (
                          <div className="h-8 rounded flex items-center justify-center" style={{ border: '1px dashed color-mix(in srgb, var(--theme-text-primary) 20%, transparent)' }}>
                            <span className="text-xs tertiary-metadata">Drop here</span>
                          </div>
                        )}
                    </div>
                  </SortableContext>
                </div>
              )
            })}
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeChannel ? (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm shadow-lg opacity-90 channel-sidebar-drag-overlay"
                  style={{ width: '208px' }}
                >
                  <ChannelIcon channel={activeChannel} isVoiceActive={false} />
                  <span className="truncate">{activeChannel.name}</span>
                </div>
              ) : activeCategory ? (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm shadow-lg opacity-90 channel-sidebar-drag-overlay"
                  style={{ width: '208px' }}
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
                className="flex items-center gap-1 px-2 py-1 rounded w-full surface-hover motion-interactive motion-press focus-ring tertiary-metadata" aria-label="Add channel"
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
          <DialogContent className="channel-sidebar-dialog-content">
            <DialogHeader>
              <DialogTitle className="channel-sidebar-title">Delete Channel</DialogTitle>
              <DialogDescription className="channel-sidebar-description">
                Are you sure you want to delete{" "}
                <span className="font-semibold channel-sidebar-title">#{deleteTarget?.name}</span>?
                {" "}This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded text-sm font-medium motion-interactive motion-press surface-hover-md focus-ring channel-sidebar-description"
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

        {/* Delete category confirmation */}
        <Dialog open={!!deleteCategoryTarget} onOpenChange={(open) => { if (!open) setDeleteCategoryTarget(null) }}>
          <DialogContent className="channel-sidebar-dialog-content">
            <DialogHeader>
              <DialogTitle className="channel-sidebar-title">Delete Category</DialogTitle>
              <DialogDescription className="channel-sidebar-description">
                Are you sure you want to delete{" "}
                <span className="font-semibold channel-sidebar-title">{deleteCategoryTarget?.name}</span>?
                {" "}Channels inside will be moved to uncategorized. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setDeleteCategoryTarget(null)}
                className="px-4 py-2 rounded text-sm font-medium motion-interactive motion-press surface-hover-md focus-ring channel-sidebar-description"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600 hover:bg-red-500 text-white motion-interactive motion-press focus-ring"
              >
                Delete Category
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit category (reuse EditChannelModal) */}
        {editCategoryTarget && (
          <EditChannelModal
            channel={editCategoryTarget}
            open={!!editCategoryTarget}
            onClose={() => setEditCategoryTarget(null)}
          />
        )}
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
  onEdit,
  onDelete,
  onCopyId,
}: {
  category: ChannelRow
  containerId: string
  isCollapsed: boolean
  canManageChannels: boolean
  isDragOver: boolean
  onToggle: () => void
  onAddChannel: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopyId?: () => void
}) {
  const { setNodeRef } = useDroppable({ id: containerId })
  const sortable = useSortable({ id: getCategoryDragId(category.id), disabled: !canManageChannels })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={sortable.setNodeRef}
          style={style}
          className={cn(
            "flex items-center justify-between px-2 py-1 group rounded mx-1 motion-interactive",
            isDragOver && "surface-hover"
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
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-interactive motion-interactive focus-ring rounded-sm" aria-label={`Create channel in ${category.name}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Create Channel</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56" aria-label={`Category actions for ${category.name}`}>
        {canManageChannels && (
          <ContextMenuItem onClick={onAddChannel}>
            <Plus className="w-4 h-4 mr-2" /> Create Channel
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {canManageChannels && onEdit && (
          <ContextMenuItem onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" /> Edit Category
          </ContextMenuItem>
        )}
        {onCopyId && (
          <ContextMenuItem onClick={onCopyId}>
            <Clipboard className="w-4 h-4 mr-2" /> Copy Category ID
          </ContextMenuItem>
        )}
        {canManageChannels && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Category
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
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
  onCreateThread,
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
  onCreateThread?: () => void
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
              isActive || isVoiceActive ? "channel-active channel-sidebar-active-elevated" : "surface-hover text-muted-interactive",
              isUnread && !isActive && "channel-sidebar-unread channel-sidebar-unread-elevated"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-300 channel-sidebar-accent-bar",
                isActive || isVoiceActive
                  ? "opacity-100 h-8 w-1 channel-sidebar-accent-bar-active"
                  : "opacity-0 h-5 w-0 group-hover/channel:opacity-60 group-hover/channel:w-0.5 group-hover/channel:h-5"
              )}
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
                    <span className="flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded channel-sidebar-warning-chip">
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
                <span className="w-2 h-2 rounded-full inline-block animate-pulse channel-sidebar-success-dot" />
              )}
              {showBadge && (mentionCount ?? 0) > 0 ? (
                <span
                  className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold px-1 channel-sidebar-mention-badge"
                >
                  {(mentionCount ?? 0) > 99 ? "99+" : mentionCount}
                </span>
              ) : showBadge ? (
                <span className="w-2 h-2 rounded-full channel-sidebar-unread-dot" />
              ) : null}
              {(activeThreadCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-semibold channel-sidebar-thread-pill"
                  title={`${activeThreadCount} active ${activeThreadCount === 1 ? "thread" : "threads"} in #${channel.name}`}
                >
                  <MessageCircle className="h-2.5 w-2.5" />
                  {activeThreadCount}
                </span>
              )}
            </span>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56" aria-label={`Channel actions for #${channel.name}`}>
          {onCreateThread && channel.type === "text" && (
            <>
              <ContextMenuItem onClick={onCreateThread}>
                <MessageSquare className="w-4 h-4 mr-2" /> Create Thread
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
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
                className="flex items-center gap-2 px-2 py-1 rounded text-xs surface-hover channel-sidebar-description"
              >
                <Avatar className="w-5 h-5 flex-shrink-0">
                  {participant.user?.avatar_url && (
                    <AvatarImage src={participant.user.avatar_url} />
                  )}
                  <AvatarFallback className="channel-sidebar-avatar-fallback" style={{ fontSize: "8px" }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{name}</span>
                {participant.muted && (
                  <MicOff className="w-3 h-3 flex-shrink-0 channel-sidebar-danger-icon" />
                )}
                {participant.deafened && (
                  <Headphones className="w-3 h-3 flex-shrink-0 channel-sidebar-danger-icon" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
