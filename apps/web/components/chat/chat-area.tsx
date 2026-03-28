"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { perfLogSinceNav, perfClearNav } from "@/lib/perf"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleHelp, Hash, MessageSquareText, Pin, Search, Users, Briefcase, Sparkles, MoreHorizontal } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { sendReactionMutation } from "@/lib/reactions-client"
import { useAppStore } from "@/lib/stores/app-store"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { useShallow } from "zustand/react/shallow"
import type { AttachmentRow, ChannelRow, MessageWithAuthor, ThreadRow } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeMessages, type RealtimeStatus } from "@/hooks/use-realtime-messages"
import { useTyping } from "@/hooks/use-typing"
import { useToast } from "@/components/ui/use-toast"
const ThreadPanel = lazy(() => import("@/components/chat/thread-panel").then((m) => ({ default: m.ThreadPanel })))
const SearchModal = lazy(() => import("@/components/modals/search-modal").then((m) => ({ default: m.SearchModal })))
const CreateThreadModal = lazy(() => import("@/components/modals/create-thread-modal").then((m) => ({ default: m.CreateThreadModal })))
const KeyboardShortcutsModal = lazy(() => import("@/components/modals/keyboard-shortcuts-modal").then((m) => ({ default: m.KeyboardShortcutsModal })))
import { WorkspacePanel } from "@/components/chat/workspace-panel"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { useChatOutbox } from "@/components/chat/hooks/use-chat-outbox"
import { useChatScroll } from "@/components/chat/hooks/use-chat-scroll"
import { ChannelSummaryCard } from "@/components/chat/channel-summary-card"
import { PinnedMessagesPanel } from "@/components/chat/pinned-messages-panel"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type OutboxEntry,
  removeOutboxEntry,
  resolveReplayOrder,
  setDraft,
  updateOutboxStatus,
  upsertOutboxEntry,
} from "@/lib/chat-outbox"
import { buildReplyJumpPath, shouldHandleReturnToContextShortcut } from "@/lib/reply-navigation"
import { resolveCommandBarLayout } from "@/lib/channel-command-bar"
import { useMobileLayout } from "@/hooks/use-mobile-layout"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { ConnectionBanner } from "@/components/connection-banner"
import { VoiceRecapCard } from "@/components/voice/voice-recap-card"

interface Props {
  channel: ChannelRow
  initialMessages: MessageWithAuthor[]
  currentUserId: string
  serverId: string
  initialLastReadAt: string | null
  canManageMessages: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
const RECENTLY_ACTIVE_DECAY_MS = 12_000
/** Cap displayed messages to keep the DOM manageable — older/newer trimmed on fetch. */
const DISPLAY_LIMIT = 150

function sortMessagesChronologically(items: MessageWithAuthor[]): MessageWithAuthor[] {
  const timestamps = new Map<string, number>()
  for (const item of items) {
    timestamps.set(item.id, Date.parse(item.created_at))
  }

  return [...items].sort((a, b) => {
    const ts = (timestamps.get(a.id) ?? 0) - (timestamps.get(b.id) ?? 0)
    return ts !== 0 ? ts : a.id.localeCompare(b.id)
  })
}

/** Primary text channel view with message list, outbox queue, real-time updates, thread panel, unread markers, and infinite scroll. */
export function ChatArea({ channel, initialMessages, currentUserId, serverId, initialLastReadAt, canManageMessages }: Props) {
  const messageGrouping = useAppearanceStore((s) => s.messageGrouping)
  const isMobile = useMobileLayout()
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList, currentUser, workspaceOpen, toggleWorkspacePanel, threadPanelOpen, toggleThreadPanel, setThreadPanelOpen, cacheMessages, mobilePendingAction, setMobilePendingAction } = useAppStore(
    useShallow((s) => ({ setActiveServer: s.setActiveServer, setActiveChannel: s.setActiveChannel, memberListOpen: s.memberListOpen, toggleMemberList: s.toggleMemberList, currentUser: s.currentUser, workspaceOpen: s.workspaceOpen, toggleWorkspacePanel: s.toggleWorkspacePanel, threadPanelOpen: s.threadPanelOpen, toggleThreadPanel: s.toggleThreadPanel, setThreadPanelOpen: s.setThreadPanelOpen, cacheMessages: s.cacheMessages, mobilePendingAction: s.mobilePendingAction, setMobilePendingAction: s.setMobilePendingAction }))
  )
  const [messages, setMessages] = useState<MessageWithAuthor[]>(initialMessages)
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const [activeThread, setActiveThread] = useState<ThreadRow | null>(null)
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0)
  const [liveAnnouncement, setLiveAnnouncement] = useState("")
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [showReturnToContext, setShowReturnToContext] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showCreateChannelThread, setShowCreateChannelThread] = useState(false)
  const [isPaginating, setIsPaginating] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(() => initialMessages.length >= 50)
  const [recentlyActiveTimestamps, setRecentlyActiveTimestamps] = useState<Record<string, number>>({})
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set())
  const [showSummary, setShowSummary] = useState(false)
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting")
  const [voiceRecaps, setVoiceRecaps] = useState<Array<{ sessionId: string; channelName: string; durationSeconds: number }>>([])
  const [viewportWidth, setViewportWidth] = useState(1280)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [focusedActionIndex, setFocusedActionIndex] = useState(0)
  const commandActionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const overflowRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageScrollerRef = useRef<HTMLDivElement>(null)
  const previousLastMessageIdRef = useRef<string | null>(initialMessages[initialMessages.length - 1]?.id ?? null)
  const jumpedRef = useRef(false)
  const lastJumpMessageIdRef = useRef<string | null>(null)
  const jumpSignatureRef = useRef<string | null>(null)
  const paginationRequestRef = useRef<Promise<unknown> | null>(null)
  const shouldAutoScrollToLatestRef = useRef(true)
  const prevChannelIdRef = useRef(channel.id)
  const messagesRef = useRef<MessageWithAuthor[]>(initialMessages)
  const reconnectCycleRef = useRef(0)
  const liveAnnouncementCounterRef = useRef(0)
  const unreadAnchorCycleRef = useRef<number | null>(null)
  const animatedMessageTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"
  const { typingUsers, onKeystroke, onSent } = useTyping(channel.id, currentUserId, currentDisplayName)
  const jumpToMessageId = searchParams.get("message")
  const openThreadId = searchParams.get("thread")
  const createThreadParam = searchParams.get("createThread")

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Consume mobile header actions dispatched via the Zustand store
  useEffect(() => {
    if (!mobilePendingAction) return
    switch (mobilePendingAction) {
      case "search": setShowSearchModal(true); break
      case "summary": setShowSummary((v) => !v); break
      case "pins": setShowPinnedPanel((v) => !v); break
      case "help": setShowKeyboardShortcuts(true); break
    }
    setMobilePendingAction(null)
  }, [mobilePendingAction, setMobilePendingAction])

  const trackCommandEvent = useCallback((eventType: "action" | "discoverability", payload: Record<string, string | number | boolean>) => {
    const body = JSON.stringify({ eventType, payload, channelId: channel.id, serverId, timestamp: Date.now() })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/telemetry/channel-command-bar", body)
      } else {
        fetch("/api/telemetry/channel-command-bar", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {})
      }
    } catch {
      // best-effort telemetry only
    }
  }, [channel.id, serverId])

  // ── Message index map ────────────────────────────────────────────────────
  // O(1) lookup of message index by ID — used for jump-to-message
  const messageIndexMap = useMemo(
    () => new Map(messages.map((m, i) => [m.id, i])),
    [messages]
  )

  const jumpToMessage = useCallback((messageId: string) => {
    router.replace(buildReplyJumpPath(`/channels/${serverId}/${channel.id}`, searchParams.toString(), messageId))
  }, [channel.id, router, searchParams, serverId])

  // Auto-open create thread modal when navigated from channel right-click
  useEffect(() => {
    if (createThreadParam === "1") {
      setShowCreateChannelThread(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete("createThread")
      router.replace(`/channels/${serverId}/${channel.id}?${params.toString()}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createThreadParam])

  const unreadAnchorStorageKey = useMemo(
    () => `vortexchat:unread-anchor:${currentUserId}:${channel.id}`,
    [channel.id, currentUserId]
  )
  const scrollStorageKey = useMemo(
    () => `vortexchat:scroll:${currentUserId}:${channel.id}`,
    [channel.id, currentUserId]
  )
  const returnScrollStorageKey = useMemo(
    () => `vortexchat:return-scroll:${currentUserId}:${channel.id}`,
    [channel.id, currentUserId]
  )
  const unreadDividerMessageId = useMemo(() => {
    if (!unreadAnchorMessageId) return null
    return messages.some((message) => message.id === unreadAnchorMessageId) ? unreadAnchorMessageId : null
  }, [messages, unreadAnchorMessageId])
  const typingAnnouncement = useMemo(() => {
    if (typingUsers.length === 0) return ""

    const getTypingName = (entry: (typeof typingUsers)[number]) =>
      entry.displayName || entry.userId

    if (typingUsers.length === 1) return `${getTypingName(typingUsers[0])} is typing`
    if (typingUsers.length === 2) return `${getTypingName(typingUsers[0])} and ${getTypingName(typingUsers[1])} are typing`
    return `${typingUsers.length} people are typing`
  }, [typingUsers])

  const optimisticAuthor = useMemo(() => {
    return currentUser ?? {
      id: currentUserId,
      username: "You",
      display_name: "You",
      avatar_url: null,
      banner_color: null,
      banner_url: null,
      bio: null,
      custom_tag: null,
      status: "online" as const,
      status_message: null,
      status_emoji: null,
      status_expires_at: null,
      discoverable: false,
      appearance_settings: null,
      interests: [],
      activity_visibility: "public" as const,
      onboarding_completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }, [currentUser, currentUserId])

  const upsertMessage = useCallback((incoming: MessageWithAuthor) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((m) => {
        if (m.id === incoming.id) return true

        if (!m.client_nonce || !incoming.client_nonce) return false
        return (
          m.client_nonce === incoming.client_nonce
          && m.author_id === incoming.author_id
          && m.channel_id === incoming.channel_id
        )
      })

      const isNewMessage = existingIndex === -1
      const next = isNewMessage
        ? [...prev, incoming]
        : prev.map((message, idx) => (idx === existingIndex ? { ...prev[existingIndex], ...incoming } : message))

      if (isNewMessage) {
        setAnimatedMessageIds((current) => {
          const nextIds = new Set(current)
          nextIds.add(incoming.id)
          return nextIds
        })

        const existingTimer = animatedMessageTimersRef.current.get(incoming.id)
        if (existingTimer) clearTimeout(existingTimer)
        const timer = setTimeout(() => {
          setAnimatedMessageIds((current) => {
            if (!current.has(incoming.id)) return current
            const nextIds = new Set(current)
            nextIds.delete(incoming.id)
            return nextIds
          })
          animatedMessageTimersRef.current.delete(incoming.id)
        }, 220)
        animatedMessageTimersRef.current.set(incoming.id, timer)
      }

      const sorted = sortMessagesChronologically(next)
      // Trim to display limit, keeping newest messages
      return sorted.length > DISPLAY_LIMIT ? sorted.slice(sorted.length - DISPLAY_LIMIT) : sorted
    })
  }, [])

  const makeOptimisticMessage = useCallback((entry: OutboxEntry): MessageWithAuthor => {
    const replyToMessage = entry.replyToId ? messagesRef.current.find((message) => message.id === entry.replyToId) ?? null : null
    return ({
    id: entry.id,
    channel_id: entry.channelId,
    author_id: entry.authorId,
    content: entry.content,
    client_nonce: entry.id,
    edited_at: null,
    deleted_at: null,
    reply_to_id: entry.replyToId,
    thread_id: null,
    mentions: [],
    mention_everyone: false,
    pinned: false,
    pinned_at: null,
    pinned_by: null,
    created_at: entry.createdAt,
    author: optimisticAuthor,
    attachments: (entry.attachments ?? []).map((attachment) => ({
      id: `local-${entry.id}-${attachment.filename}`,
      message_id: entry.id,
      url: attachment.url,
      filename: attachment.filename,
      size: attachment.size,
      content_type: attachment.content_type,
      width: null,
      height: null,
      created_at: entry.createdAt,
    })) as AttachmentRow[],
    reactions: [],
    reply_to: replyToMessage,
  })
  }, [optimisticAuthor])

  const {
    draft,
    draftPersistTimerRef,
    draftRef,
    flushTrigger,
    isOnline,
    outbox,
    outboxRef,
    resetComposerState,
    setAndPersistOutbox,
    setDraftState,
    setIsOnline,
  } = useChatOutbox({
    channelId: channel.id,
    initialIsOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    makeOptimisticMessage,
    setMessages,
    setReplyTo,
  })

  const sendOutboxEntry = useCallback(async (entry: OutboxEntry) => {
    setAndPersistOutbox((current) => updateOutboxStatus(current, entry.id, { status: "sending", lastError: null }))

    let message: MessageWithAuthor | null = null
    let errorMsg: string | null = null
    try {
      const mentions = (entry.content.match(/<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi) ?? []).map((m) => m.slice(2, -1))
      const mentionEveryone = entry.content.includes("@everyone")
      const apiResponse = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: entry.channelId,
          content: entry.content.trim() || undefined,
          replyToId: entry.replyToId ?? undefined,
          mentions,
          mentionEveryone,
          attachments: (entry.attachments ?? []).map(({ url, filename, size, content_type }) => ({ url, filename, size, content_type })),
          clientNonce: entry.id,
        }),
      })
      if (apiResponse.ok) {
        message = await apiResponse.json() as MessageWithAuthor
      } else {
        try {
          const body = await apiResponse.json()
          errorMsg = typeof body.error === "string" ? body.error : "Failed to replay outbox entry"
        } catch {
          errorMsg = "Failed to replay outbox entry"
        }
      }
    } catch (caughtError) {
      errorMsg = caughtError instanceof Error ? caughtError.message : "Failed to replay outbox entry"
    }

    if (errorMsg) {
      const nextStatus = navigator.onLine ? "failed" : "queued"
      setAndPersistOutbox((current) => updateOutboxStatus(current, entry.id, {
        status: nextStatus,
        retryCount: entry.retryCount + 1,
        lastError: errorMsg,
      }))
      return
    }

    setAndPersistOutbox((current) => removeOutboxEntry(current, entry.id))

    if (message) {
      upsertMessage(message)
    }
  }, [setAndPersistOutbox, upsertMessage])

  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine) return
    const toReplay = resolveReplayOrder(outboxRef.current).filter((entry) => entry.channelId === channel.id)
    for (const entry of toReplay) {
      if (!navigator.onLine) break
      if (entry.retryCount > 0) {
        const backoffMs = Math.min(1000 * (2 ** Math.min(entry.retryCount, 5)), 30_000)
        const jitterMs = Math.floor(Math.random() * 300)
        await sleep(backoffMs + jitterMs)
        if (!navigator.onLine) break
      }
      if (!navigator.onLine) break
      await sendOutboxEntry(entry)
    }
  }, [channel.id, sendOutboxEntry])

  useEffect(() => {
    perfLogSinceNav("ChatArea mounted")
    perfClearNav()
    setActiveServer(serverId)
    setActiveChannel(channel.id)
    return () => {
      setActiveServer(null)
      setActiveChannel(null)
    }
  }, [serverId, channel.id, setActiveServer, setActiveChannel])

  // Persist last-visited channel per server for fast navigation on next session
  useEffect(() => {
    try {
      localStorage.setItem(`vortexchat:last-channel:${serverId}`, channel.id)
    } catch {}
  }, [serverId, channel.id])

  // Keep messagesRef in sync with the messages state so that
  // scrollToLatest, loadOlderMessages, and ensureMessageLoaded always
  // operate on the current list — not just the initial server payload.
  // Declared early so it runs before any effect that reads the ref.
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Cache messages when leaving a channel (component unmount or channel switch)
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current
      if (msgs.length > 0) {
        const scrollTop = messageScrollerRef.current?.scrollTop ?? 0
        cacheMessages(channel.id, msgs, scrollTop)
      }
    }
  }, [channel.id, cacheMessages])

  useEffect(() => {
    // On channel switch, merge cached messages with server-provided
    // initialMessages to avoid surfacing stale history while preserving
    // any extra paginated messages the cache may hold.
    const cached = useAppStore.getState().messageCache[channel.id]

    let msgs: typeof initialMessages
    if (!cached || cached.messages.length === 0) {
      msgs = initialMessages
    } else {
      const cachedNewest = cached.messages[cached.messages.length - 1]?.created_at ?? ""
      const initialNewest = initialMessages[initialMessages.length - 1]?.created_at ?? ""
      if (initialNewest > cachedNewest) {
        // Server data is fresher — merge: deduplicate on id, sort by time
        const byId = new Map(cached.messages.map((m) => [m.id, m]))
        for (const m of initialMessages) byId.set(m.id, m)
        msgs = sortMessagesChronologically([...byId.values()])
        // Trim to display limit, keeping newest
        if (msgs.length > DISPLAY_LIMIT) msgs = msgs.slice(msgs.length - DISPLAY_LIMIT)
      } else if (cached.messages.length >= initialMessages.length) {
        // Cache has at least as much coverage and is equally fresh
        msgs = cached.messages
      } else {
        msgs = initialMessages
      }
    }

    messagesRef.current = msgs
    setMessages(msgs)
    previousLastMessageIdRef.current = msgs[msgs.length - 1]?.id ?? null
    setPendingNewMessageCount(0)
    setHasMoreHistory(msgs.length >= 50)
    for (const timer of animatedMessageTimersRef.current.values()) {
      clearTimeout(timer)
    }
    animatedMessageTimersRef.current.clear()
    setAnimatedMessageIds(new Set())
    setIsPaginating(false)
    paginationRequestRef.current = null
  }, [initialMessages, channel.id])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messageScrollerRef.current
    if (!container) return
    // In column-reverse, scrollTop 0 = bottom (newest messages visible).
    container.scrollTo({ top: 0, behavior })
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of animatedMessageTimersRef.current.values()) {
        clearTimeout(timer)
      }
      animatedMessageTimersRef.current.clear()
    }
  }, [])

  const loadOlderMessages = useCallback(async () => {
    const container = messageScrollerRef.current
    const currentMessages = messagesRef.current
    if (!container || !hasMoreHistory || currentMessages.length === 0) return

    if (paginationRequestRef.current) {
      await paginationRequestRef.current.catch(() => undefined)
      return
    }

    setIsPaginating(true)

    // Capture the oldest message element for scroll anchoring after prepend.
    const anchorId = currentMessages[0]?.id ?? null
    const anchorEl = anchorId ? document.getElementById(`message-${anchorId}`) : null
    const anchorRect = anchorEl?.getBoundingClientRect() ?? null

    const paginationPromise = (async () => {
      const oldest = currentMessages[0]
      const before = encodeURIComponent(oldest.created_at)

      let older: MessageWithAuthor[] | null = null
      try {
        const res = await fetch(`/api/messages?channelId=${channel.id}&before=${before}&limit=50`)
        if (!res.ok) return
        older = await res.json() as MessageWithAuthor[]
      } catch (error) {
        console.error("Failed to paginate older messages", error)
        return
      }

      if (!Array.isArray(older) || older.length === 0) {
        setHasMoreHistory(false)
        return
      }

      if (older.length < 50) {
        setHasMoreHistory(false)
      }

      // Use flushSync so React commits the DOM update synchronously,
      // letting us measure the anchor's new position immediately after.
      flushSync(() => {
        setMessages((prev) => {
          const known = new Set(prev.map((message) => message.id))
          const newItems = older.filter((message) => !known.has(message.id))
          const merged = sortMessagesChronologically([...newItems, ...prev])
          // Trim oldest messages if over display limit
          if (merged.length > DISPLAY_LIMIT) {
            return merged.slice(merged.length - DISPLAY_LIMIT)
          }
          return merged
        })
      })

      // Restore scroll position: measure the anchor element's new position
      // and adjust scrollTop by the delta so the viewport doesn't jump.
      if (anchorId && anchorRect && container) {
        const updatedAnchorEl = document.getElementById(`message-${anchorId}`)
        const updatedRect = updatedAnchorEl?.getBoundingClientRect() ?? null
        if (updatedRect) {
          const delta = updatedRect.top - anchorRect.top
          if (Math.abs(delta) > 2) {
            container.scrollTop += delta
          }
        }
      }
    })()

    paginationRequestRef.current = paginationPromise

    try {
      await paginationPromise
    } finally {
      if (paginationRequestRef.current === paginationPromise) {
        paginationRequestRef.current = null
      }
      setIsPaginating(false)
    }
  }, [channel.id, hasMoreHistory])

  const ensureMessageLoaded = useCallback(async (messageId: string) => {
    if (messagesRef.current.some((message) => message.id === messageId)) return true

    if (paginationRequestRef.current) {
      await paginationRequestRef.current.catch(() => undefined)
      if (messagesRef.current.some((message) => message.id === messageId)) return true
    }

    setIsPaginating(true)
    const paginationPromise = (async () => {
      let attempts = 0
      let localHasMore = hasMoreHistory
      let cursor = messagesRef.current[0]?.created_at ?? null

      while (attempts < 8 && localHasMore && cursor) {
        attempts += 1

        let older: MessageWithAuthor[] | null = null
        try {
          const res = await fetch(`/api/messages?channelId=${channel.id}&before=${encodeURIComponent(cursor)}&limit=50`)
          if (!res.ok) return false
          older = await res.json() as MessageWithAuthor[]
        } catch (error) {
          console.error("Failed to load message jump target", error)
          return false
        }

        if (!Array.isArray(older) || older.length === 0) {
          localHasMore = false
          setHasMoreHistory(false)
          return false
        }

        setMessages((prev) => {
          const known = new Set(prev.map((message) => message.id))
          const merged = [...older.filter((message) => !known.has(message.id)), ...prev]
          return sortMessagesChronologically(merged)
        })

        if (older.some((message) => message.id === messageId)) {
          return true
        }

        cursor = older[0]?.created_at ?? null
        if (older.length < 50) {
          localHasMore = false
          setHasMoreHistory(false)
        }
      }

      return false
    })()

    paginationRequestRef.current = paginationPromise

    try {
      return await paginationPromise
    } finally {
      if (paginationRequestRef.current === paginationPromise) {
        paginationRequestRef.current = null
      }
      setIsPaginating(false)
    }
  }, [channel.id, hasMoreHistory])

  const loadMessageContextWindow = useCallback(async (messageId: string) => {
    type ContextPayload = { messages?: MessageWithAuthor[]; hasMoreBefore?: boolean }

    try {
      const res = await fetch(`/api/messages?channelId=${channel.id}&around=${encodeURIComponent(messageId)}&limit=25`)
      if (!res.ok) return false
      const payload = await res.json() as ContextPayload
      const contextMessages = Array.isArray(payload?.messages) ? payload.messages : []
      if (contextMessages.length === 0 || !contextMessages.some((message) => message.id === messageId)) return false
      setMessages(sortMessagesChronologically(contextMessages))
      setHasMoreHistory(Boolean(payload.hasMoreBefore))
      return true
    } catch (error) {
      console.error("Failed to load message context window", error)
      return false
    }
  }, [channel.id])

  const onReachedBottom = useCallback(() => {
    setPendingNewMessageCount(0)
    setUnreadAnchorMessageId(null)
  }, [])

  const { isAtBottom, scrollToBottom } = useChatScroll({
    hasMoreHistory,
    loadOlderMessages,
    messageScrollerRef,
    paginationRequestRef,
    scrollStorageKey,
    unreadAnchorStorageKey,
    onReachedBottom,
  })

  // Pull-to-refresh: resync latest messages from the server (mobile only)
  const handlePullRefresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/messages?channelId=${channel.id}&limit=50`)
      if (!res.ok) return
      const latest = (await res.json()) as MessageWithAuthor[]
      if (!Array.isArray(latest) || latest.length === 0) return
      setMessages((prev) => {
        // Build maps: by id for all messages, by client_nonce for optimistic ones
        const byId = new Map(prev.map((m) => [m.id, m]))
        const byNonce = new Map<string, MessageWithAuthor>()
        for (const m of prev) {
          if (m.client_nonce) byNonce.set(m.client_nonce, m)
        }

        // Merge latest: replace optimistic entries that share a client_nonce
        for (const incoming of latest) {
          byId.set(incoming.id, incoming)
          if (incoming.client_nonce && byNonce.has(incoming.client_nonce)) {
            const optimistic = byNonce.get(incoming.client_nonce)!
            if (optimistic.id !== incoming.id) {
              byId.delete(optimistic.id)
            }
          }
        }

        const merged = sortMessagesChronologically([...byId.values()])
        return merged.length > DISPLAY_LIMIT ? merged.slice(merged.length - DISPLAY_LIMIT) : merged
      })
    } catch (e) {
      console.error("pull-to-refresh failed", {
        action: "refreshMessages",
        channelId: channel.id,
        route: `/channels/${serverId}/${channel.id}`,
        currentUserId: currentUser?.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }, [channel.id, serverId, currentUser?.id])

  const { handlers: pullToRefreshHandlers, pullDistance, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    isAtTop: isAtBottom, // column-reverse: scrollTop=0 is visual top (newest messages)
  })

  useEffect(() => {
    const savedAnchor = typeof window === "undefined" ? null : window.sessionStorage.getItem(unreadAnchorStorageKey)
    if (savedAnchor && initialMessages.some((message) => message.id === savedAnchor)) {
      setUnreadAnchorMessageId(savedAnchor)
      return
    }

    if (!initialLastReadAt) {
      setUnreadAnchorMessageId(null)
      return
    }

    const firstUnread = initialMessages.find(
      (message) => message.author_id !== currentUserId && message.created_at > initialLastReadAt
    )
    if (firstUnread) {
      setUnreadAnchorMessageId(firstUnread.id)
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(unreadAnchorStorageKey, firstUnread.id)
      }
      return
    }
    setUnreadAnchorMessageId(null)
  }, [currentUserId, initialLastReadAt, initialMessages, unreadAnchorStorageKey])

  useEffect(() => {
    if (!unreadAnchorMessageId || unreadDividerMessageId) return
    setUnreadAnchorMessageId(null)
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(unreadAnchorStorageKey)
    }
  }, [unreadAnchorMessageId, unreadDividerMessageId, unreadAnchorStorageKey])

  useEffect(() => {
    const onOnline = () => {
      reconnectCycleRef.current += 1
      unreadAnchorCycleRef.current = null
      setIsOnline(true)
    }
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("online", onOnline)
    }
  }, [setIsOnline])

  // Resync messages when the browser tab regains focus — browsers throttle
  // WebSockets in background tabs so Supabase Realtime can silently drop.
  useEffect(() => {
    const onVisibility = async () => {
      if (document.hidden) return
      try {
        const res = await fetch(`/api/messages?channelId=${channel.id}&limit=50`)
        if (!res.ok) return
        const latest = (await res.json()) as MessageWithAuthor[]
        if (!Array.isArray(latest) || latest.length === 0) return
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          const fresh = latest.filter((m) => !known.has(m.id))
          if (fresh.length === 0) return prev
          const merged = sortMessagesChronologically([...prev, ...fresh])
          return merged.length > DISPLAY_LIMIT ? merged.slice(merged.length - DISPLAY_LIMIT) : merged
        })
      } catch (e) {
        console.error("visibilitychange resync failed", {
          action: "refreshMessages",
          channelId: channel.id,
          route: `/channels/${serverId}/${channel.id}`,
          currentUserId: currentUser?.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [channel.id, serverId, currentUser?.id])

  useEffect(() => {
    if (!isOnline) return
    flushOutbox()
  }, [isOnline, channel.id, flushOutbox, flushTrigger])

  // On channel switch, column-reverse naturally shows the bottom.
  // If there's a cached scroll position (user was scrolled up), restore it.
  // Otherwise, ensure we're at the bottom (scrollTop = 0 in column-reverse).
  useLayoutEffect(() => {
    // Detect channel switch synchronously so the ref reset and scroll
    // restoration are colocated and deterministic.
    if (prevChannelIdRef.current !== channel.id) {
      shouldAutoScrollToLatestRef.current = true
      prevChannelIdRef.current = channel.id
    }

    if (!shouldAutoScrollToLatestRef.current) return
    if (jumpToMessageId || openThreadId) return
    if (messages.length === 0) return
    shouldAutoScrollToLatestRef.current = false

    const container = messageScrollerRef.current
    if (!container) return

    // Check for cached scroll position from a previous visit to this channel
    const cached = useAppStore.getState().messageCache[channel.id]
    if (cached && cached.scrollOffset > 0) {
      // Restore where the user was (scrollOffset is scrollTop from column-reverse)
      container.scrollTop = cached.scrollOffset
    } else {
      // Ensure we're at the newest messages (scrollTop = 0 in column-reverse)
      container.scrollTop = 0
    }
  }, [channel.id, jumpToMessageId, messages.length, openThreadId])

  useEffect(() => {
    const newestMessage = messages[messages.length - 1]
    const newestMessageId = newestMessage?.id ?? null
    const hasNewMessages = !!newestMessageId && newestMessageId !== previousLastMessageIdRef.current
    previousLastMessageIdRef.current = newestMessageId
    if (!hasNewMessages || !newestMessage) return

    // In column-reverse, if the user is at the bottom (scrollTop ~0), new
    // messages appear naturally without any scrolling needed.  We only need
    // to explicitly scroll when the user sent a message while scrolled up.
    if (newestMessage.author_id === currentUserId && !isAtBottom) {
      scrollToLatest("smooth")
      return
    }

    // Announce new messages from other users for screen readers regardless of scroll position
    if (newestMessage.author_id !== currentUserId) {
      const authorName = newestMessage.author?.display_name || newestMessage.author?.username || "Unknown"
      const preview = newestMessage.content ? `: ${newestMessage.content.slice(0, 120)}` : ""
      liveAnnouncementCounterRef.current += 1
      setLiveAnnouncement("")
      queueMicrotask(() => {
        setLiveAnnouncement(`New message from ${authorName}${preview}`)
      })
    }

    // Already at bottom — no scroll needed, column-reverse handles it
    if (isAtBottom) return

    setPendingNewMessageCount((count) => count + 1)
    setUnreadAnchorMessageId((current) => {
      if (current) return current
      const reconnectCycle = reconnectCycleRef.current
      if (unreadAnchorCycleRef.current === reconnectCycle) return null
      unreadAnchorCycleRef.current = reconnectCycle
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(unreadAnchorStorageKey, newestMessage.id)
      }
      return newestMessage.id
    })
  }, [currentUserId, isAtBottom, messages, scrollToLatest, unreadAnchorStorageKey])

  useEffect(() => {
    if (!openThreadId) return

    let cancelled = false

    async function openThreadFromQuery() {
      const res = await fetch(`/api/threads/${openThreadId}`)
      if (!res.ok) return
      const thread = await res.json() as ThreadRow
      if (cancelled || !thread || thread.parent_channel_id !== channel.id) return
      setActiveThread(thread)
      setThreadPanelOpen(true)
    }

    openThreadFromQuery().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [channel.id, openThreadId])

  useEffect(() => {
    const navigationSignature = `${channel.id}:${serverId}:${jumpToMessageId ?? ""}:${openThreadId ?? ""}`

    if (jumpSignatureRef.current !== navigationSignature) {
      jumpSignatureRef.current = navigationSignature
      jumpedRef.current = false
      lastJumpMessageIdRef.current = null
    }

    if (!jumpToMessageId || openThreadId) {
      setShowReturnToContext(false)
      return
    }

    if (lastJumpMessageIdRef.current !== jumpToMessageId) {
      jumpedRef.current = false
      lastJumpMessageIdRef.current = jumpToMessageId
    }

    if (jumpedRef.current) return

    const container = messageScrollerRef.current
    if (!container) return

    if (typeof window !== "undefined" && !window.sessionStorage.getItem(returnScrollStorageKey)) {
      window.sessionStorage.setItem(returnScrollStorageKey, String(container.scrollTop))
      setShowReturnToContext(true)
    } else {
      setShowReturnToContext(true)
    }

    let cancelled = false
    let timerId: number | null = null
    let rafId: number | null = null

    void (async () => {
      const loadedFromContext = await loadMessageContextWindow(jumpToMessageId)
      const loaded = loadedFromContext || await ensureMessageLoaded(jumpToMessageId)
      if (!loaded || cancelled) {
        if (!cancelled) {
          jumpedRef.current = true
          toast({
            title: "Original message unavailable",
            description: "This reply target was deleted or can no longer be loaded.",
          })
        }
        return
      }

      rafId = window.requestAnimationFrame(() => {
        if (cancelled) return
        // Scroll to the target message element in the DOM
        const target = document.getElementById(`message-${jumpToMessageId}`)
        if (target) target.scrollIntoView({ block: "center", behavior: "auto" })
        if (cancelled) return
        setHighlightedMessageId(jumpToMessageId)
        jumpedRef.current = true
        timerId = window.setTimeout(() => {
          if (!cancelled) {
            setHighlightedMessageId(null)
          }
        }, 2200)
      })
    })()

    return () => {
      cancelled = true
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      if (timerId) window.clearTimeout(timerId)
    }
  }, [ensureMessageLoaded, jumpToMessageId, loadMessageContextWindow, messageIndexMap, openThreadId, returnScrollStorageKey, toast])

  const jumpToLatest = useCallback(() => {
    scrollToLatest("smooth")
    setPendingNewMessageCount(0)
    setUnreadAnchorMessageId(null)
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(unreadAnchorStorageKey)
    }
  }, [scrollToLatest, unreadAnchorStorageKey])

  const returnToContext = useCallback(() => {
    const container = messageScrollerRef.current
    if (!container) return
    const scrollValue = typeof window === "undefined" ? null : window.sessionStorage.getItem(returnScrollStorageKey)
    if (scrollValue) {
      container.scrollTop = Number(scrollValue)
      window.sessionStorage.removeItem(returnScrollStorageKey)
    }
    router.replace(`/channels/${serverId}/${channel.id}`)
    setShowReturnToContext(false)
  }, [channel.id, returnScrollStorageKey, router, serverId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleReturnToContextShortcut(showReturnToContext, event)) return
      event.preventDefault()
      returnToContext()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [returnToContext, showReturnToContext])

  // Backfill messages missed during a Supabase Realtime disconnection
  const backfillMissedMessages = useCallback(async () => {
    const current = messagesRef.current
    const lastMessage = current[current.length - 1]
    if (!lastMessage) return
    try {
      const res = await fetch(
        `/api/messages?channelId=${channel.id}&after=${encodeURIComponent(lastMessage.created_at)}&limit=100`
      )
      if (!res.ok) return
      const missed = (await res.json()) as MessageWithAuthor[]
      if (!Array.isArray(missed) || missed.length === 0) return
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id))
        const newItems = missed.filter((m) => !known.has(m.id))
        if (newItems.length === 0) return prev
        const merged = sortMessagesChronologically([...prev, ...newItems])
        // Trim to display limit, keeping newest messages
        return merged.length > DISPLAY_LIMIT ? merged.slice(merged.length - DISPLAY_LIMIT) : merged
      })
    } catch {
      // Best-effort backfill — realtime events will catch up
    }
  }, [channel.id])

  useRealtimeMessages(
    channel.id,
    (newMessage) => {
      upsertMessage(newMessage)
      setAndPersistOutbox((current) => removeOutboxEntry(current, newMessage.id))
    },
    (updatedMessage) => {
      setMessages((prev) => {
        if (updatedMessage.deleted_at) {
          return prev.filter((m) => m.id !== updatedMessage.id)
        }
        return prev.map((m) => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m)
      })
      if (updatedMessage.deleted_at) {
        setAndPersistOutbox((current) => removeOutboxEntry(current, updatedMessage.id))
      }
    },
    (reaction) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.message_id) return m
          if (m.reactions.some((r) => r.emoji === reaction.emoji && r.user_id === reaction.user_id)) return m
          return { ...m, reactions: [...m.reactions, reaction] }
        })
      )
    },
    (reaction) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.message_id) return m
          return { ...m, reactions: m.reactions.filter((r) => !(r.emoji === reaction.emoji && r.user_id === reaction.user_id)) }
        })
      )
    },
    setRealtimeStatus,
    backfillMissedMessages,
  )

  // ── Voice Recap — listen for ended voice sessions in this channel ──
  useEffect(() => {
    setVoiceRecaps([])
    const recapChannel = supabase
      .channel(`voice-recap:${channel.id}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "voice_call_sessions",
          filter: `scope_id=eq.${channel.id}`,
        } as Record<string, string>,
        (payload: { new: { id: string; ended_at: string | null; started_at: string; summary_status: string } }) => {
          const row = payload.new
          if (!row.ended_at) return

          const durationSeconds = Math.round(
            (new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000
          )

          setVoiceRecaps((prev) => {
            if (prev.some((r) => r.sessionId === row.id)) return prev
            return [
              ...prev,
              {
                sessionId: row.id,
                channelName: channel.name,
                durationSeconds,
              },
            ]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(recapChannel)
    }
  }, [channel.id, channel.name, supabase])

  async function handleSendMessage(content: string, attachmentFiles?: File[], onUploadProgress?: (percent: number) => void, abortSignal?: AbortSignal): Promise<void> {
    if (!content.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    if (!currentUserId) return

    if (!navigator.onLine && attachmentFiles?.length) {
      toast({
        variant: "destructive",
        title: "Attachments require a connection",
        description: "Files can't be queued offline yet. Reconnect and retry.",
      })
      throw new Error("Attachments require a connection")
    }

    const messageId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const entry: OutboxEntry = {
      id: messageId,
      channelId: channel.id,
      authorId: currentUserId,
      content,
      replyToId: replyTo?.id ?? null,
      createdAt,
      status: navigator.onLine ? "sending" : "queued",
      retryCount: 0,
      lastError: null,
      attachments: [],
    }

    const optimisticMessage = makeOptimisticMessage(entry)
    upsertMessage(optimisticMessage)
    setAndPersistOutbox((current) => upsertOutboxEntry(current, entry))

    if (!navigator.onLine) {
      resetComposerState()
      onSent()
      toast({ title: "Queued for send", description: "Message will send when your connection returns." })
      return
    }

    const attachments: Array<{ url: string; filename: string; size: number; content_type: string; storage_path: string }> = []
    if (attachmentFiles?.length) {
      const totalBytes = attachmentFiles.reduce((sum, f) => sum + f.size, 0)
      let uploadedBytes = 0

      for (let index = 0; index < attachmentFiles.length; index += 1) {
        if (abortSignal?.aborted) {
          // Clean up already-uploaded files on cancel
          if (attachments.length > 0) {
            await supabase.storage.from("attachments").remove(attachments.map((a) => a.storage_path))
          }
          setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
          setMessages((prev) => prev.filter((message) => message.id !== messageId))
          const cancelError = new Error("Upload cancelled")
          cancelError.name = "AbortError"
          throw cancelError
        }

        const file = attachmentFiles[index]
        const path = `${channel.id}/${Date.now()}-${file.name}`
        const fileStartBytes = uploadedBytes

        // Use Supabase upload but track per-file progress through the upload callback
        const { error } = await new Promise<{ error: { message: string } | null }>((resolve) => {
          // Supabase JS client supports an onUploadProgress option that gives
          // byte-level progress via tus or XHR under the hood.  We wrap the
          // native upload so we can report granular progress.
          const abortHandler = () => {
            // Supabase JS v2 doesn't expose an abort handle, so the best we
            // can do is mark the file as failed and clean it up after.
            resolve({ error: { message: "Upload cancelled" } })
          }

          if (abortSignal) {
            abortSignal.addEventListener("abort", abortHandler, { once: true })
          }

          supabase.storage
            .from("attachments")
            .upload(path, file)
            .then((result) => {
              if (abortSignal) abortSignal.removeEventListener("abort", abortHandler)
              // Once the file finishes, report full progress for this file
              uploadedBytes = fileStartBytes + file.size
              if (totalBytes > 0) {
                onUploadProgress?.(Math.round((uploadedBytes / totalBytes) * 100))
              }
              resolve(result)
            })
        })

        if (abortSignal?.aborted) {
          // Try to clean up the partially uploaded file
          await supabase.storage.from("attachments").remove([path])
          if (attachments.length > 0) {
            await supabase.storage.from("attachments").remove(attachments.map((a) => a.storage_path))
          }
          setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
          setMessages((prev) => prev.filter((message) => message.id !== messageId))
          const cancelError = new Error("Upload cancelled")
          cancelError.name = "AbortError"
          throw cancelError
        }

        if (error) {
          toast({
            variant: "destructive",
            title: "Upload failed",
            description: `Failed to upload ${file.name}: ${error.message}`,
          })
          // Don't increment uploadedBytes on failure — keep progress accurate
          continue
        }
        const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 3600 * 24 * 7)
        if (!signed) {
          const { error: cleanupError } = await supabase.storage.from("attachments").remove([path])
          if (cleanupError) {
            console.warn("failed to cleanup orphaned attachment after signed URL failure", {
              path,
              error: cleanupError.message,
            })
          }
          continue
        }

        attachments.push({
          url: signed.signedUrl,
          filename: file.name,
          size: file.size,
          content_type: file.type,
          storage_path: path,
        })
      }
    }

    if (attachmentFiles?.length && attachments.length === 0 && !content.trim()) {
      setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
      setMessages((prev) => prev.filter((message) => message.id !== messageId))
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "All attachment uploads failed.",
      })
      throw new Error("All attachment uploads failed.")
    }

    if (attachments.length > 0) {
      const nextEntry = { ...entry, attachments }
      setAndPersistOutbox((current) => upsertOutboxEntry(current, nextEntry))
      upsertMessage(makeOptimisticMessage(nextEntry))
    }

    const mentions = (content.match(/<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi) ?? []).map((m) => m.slice(2, -1))
    const mentionEveryone = content.includes("@everyone")
    const sendT0 = performance.now()
    const apiResponse = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel.id,
        serverId,
        content: content.trim() || undefined,
        replyToId: replyTo?.id || undefined,
        mentions,
        mentionEveryone,
        attachments: attachments.map(({ url, filename, size, content_type }) => ({ url, filename, size, content_type })),
        clientNonce: messageId,
      }),
    })

    if (!apiResponse.ok) {
      let errorMsg = "Your message could not be sent. Please try again."
      let errorCode: string | undefined
      try {
        const body = await apiResponse.json()
        if (typeof body.error === "string") errorMsg = body.error
        if (typeof body.code === "string") errorCode = body.code
      } catch {}
      if (attachments.length > 0) {
        await supabase.storage.from("attachments").remove(attachments.map((attachment) => attachment.storage_path))
      }

      // AutoMod blocks/quarantines are not retriable — remove the optimistic
      // message entirely instead of leaving a ghost "Failed" message in chat.
      if (errorCode === "AUTOMOD_BLOCKED" || errorCode === "AUTOMOD_QUARANTINED") {
        setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        throw new Error(errorMsg)
      }

      setAndPersistOutbox((current) => updateOutboxStatus(current, messageId, {
        status: "failed",
        retryCount: 1,
        lastError: errorMsg,
      }))
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: errorMsg,
      })
      throw new Error(errorMsg)
    }

    const message = await apiResponse.json() as MessageWithAuthor
    console.log(`[msg-send-client] ${(performance.now() - sendT0).toFixed(0)}ms round-trip (fetch + parse)`)

    setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
    upsertMessage(message)

    resetComposerState()
    onSent()
  }

  function handleRetryMessage(messageId: string) {
    const entry = outbox.find((candidate) => candidate.id === messageId)
    if (!entry) return
    void sendOutboxEntry({ ...entry, status: "queued" }).catch((error) => {
      console.error("Failed to retry message", error)
      setAndPersistOutbox((current) => updateOutboxStatus(current, messageId, {
        status: "failed",
        lastError: error instanceof Error ? error.message : "Retry failed",
      }))
    })
  }

  function handleDraftChange(value: string) {
    setDraftState(value)
    draftRef.current = value
    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current)
    }
    const activeChannelId = channel.id
    draftPersistTimerRef.current = setTimeout(() => {
      setDraft(activeChannelId, value)
      draftPersistTimerRef.current = null
    }, 300)
  }

  const outboxStateByMessageId = useMemo(() => {
    return outbox.reduce<Record<string, OutboxEntry["status"]>>((acc, entry) => {
      acc[entry.id] = entry.status
      return acc
    }, {})
  }, [outbox])

  useEffect(() => {
    if (typingUsers.length === 0) return

    const now = Date.now()
    setRecentlyActiveTimestamps((prev) => {
      const next = { ...prev }
      for (const user of typingUsers) {
        next[user.userId] = now
      }
      return next
    })
  }, [typingUsers])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setRecentlyActiveTimestamps((prev) => {
        let changed = false
        const next: Record<string, number> = {}
        for (const [userId, timestamp] of Object.entries(prev)) {
          if (now - timestamp <= RECENTLY_ACTIVE_DECAY_MS) {
            next[userId] = timestamp
          } else {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1_000)

    return () => clearInterval(interval)
  }, [])

  const recentlyActiveUserIds = useMemo(() => {
    const now = Date.now()
    const active = new Set<string>()
    for (const [userId, timestamp] of Object.entries(recentlyActiveTimestamps)) {
      if (now - timestamp <= RECENTLY_ACTIVE_DECAY_MS) {
        active.add(userId)
      }
    }
    return active
  }, [recentlyActiveTimestamps])

  type CommandAction = { id: string; label: string; group: "search" | "pins" | "threads" | "voice" | "help"; groupLabel: string; priority: number; ariaLabel: string; icon: ReactNode; onSelect: () => void }
  const commandActions = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = [
      {
        id: "search",
        label: "Search",
        group: "search",
        groupLabel: "Search",
        priority: 1,
        ariaLabel: "Search messages in this channel",
        icon: <Search className="w-4 h-4 text-[var(--theme-text-secondary)]" />,
        onSelect: () => setShowSearchModal(true),
      },
      {
        id: "pins",
        label: showPinnedPanel ? "Hide Pins" : "Pins",
        group: "pins",
        groupLabel: "Pins",
        priority: 2,
        ariaLabel: showPinnedPanel ? "Hide pinned messages" : "Show pinned messages",
        icon: <Pin className={`w-4 h-4 ${showPinnedPanel ? "chat-area-text-accent" : "text-[var(--theme-text-secondary)]"}`} />,
        onSelect: () => setShowPinnedPanel((v) => !v),
      },
      {
        id: "threads",
        label: threadPanelOpen ? "Hide Threads" : "Threads",
        group: "threads",
        groupLabel: "Threads",
        priority: 3,
        ariaLabel: threadPanelOpen ? "Hide thread panel" : "Show thread panel",
        icon: <MessageSquareText className={`w-4 h-4 ${threadPanelOpen ? "chat-area-text-primary" : "chat-area-text-muted"}`} />,
        onSelect: toggleThreadPanel,
      },
      {
        id: "voice",
        label: "Members",
        group: "voice",
        groupLabel: "Voice",
        priority: 5,
        ariaLabel: memberListOpen ? "Hide members" : "Show members",
        icon: <Users className={`w-4 h-4 ${memberListOpen ? "chat-area-text-primary" : "chat-area-text-muted"}`} />,
        onSelect: toggleMemberList,
      },
      {
        id: "help",
        label: "Help",
        group: "help",
        groupLabel: "Help",
        priority: 6,
        ariaLabel: "Show keyboard shortcuts and help",
        icon: <CircleHelp className="w-4 h-4 text-[var(--theme-text-secondary)]" />,
        onSelect: () => setShowKeyboardShortcuts(true),
      },
    ]
    return actions
  }, [memberListOpen, showPinnedPanel, threadPanelOpen, toggleMemberList, toggleThreadPanel])

  const layout = useMemo(
    () => resolveCommandBarLayout(viewportWidth, [...commandActions, { id: "inbox", group: "inbox", priority: 4 }]),
    [commandActions, viewportWidth]
  )

  useEffect(() => {
    if (layout.overflowActionIds.length > 0) {
      trackCommandEvent("discoverability", {
        overflowCount: layout.overflowActionIds.length,
        viewportWidth,
      })
    }
  }, [layout.overflowActionIds.length, trackCommandEvent, viewportWidth])

  const visibleActions = useMemo(
    () => commandActions.filter((action) => layout.visibleActionIds.includes(action.id)),
    [commandActions, layout.visibleActionIds]
  )
  const overflowActions = useMemo(
    () => commandActions.filter((action) => layout.overflowActionIds.includes(action.id)),
    [commandActions, layout.overflowActionIds]
  )

  const handleCommandBarKeydown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!visibleActions.length) return
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const maxIndex = visibleActions.length - 1
    const nextIndex =
      event.key === "Home" ? 0
      : event.key === "End" ? maxIndex
      : event.key === "ArrowRight" ? (focusedActionIndex + 1) % (maxIndex + 1)
      : (focusedActionIndex - 1 + maxIndex + 1) % (maxIndex + 1)
    setFocusedActionIndex(nextIndex)
    commandActionRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden chat-area-root-surface">
        {!isMobile && <div
          className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0 chat-area-header-surface"
        >
          <Hash className="w-5 h-5 flex-shrink-0 chat-area-header-hash" />
          <span className="font-semibold chat-area-text-bright">{channel.name}</span>
          {!isOnline && (
            <span className="text-xs px-2 py-0.5 rounded chat-area-offline-pill">
              Offline
            </span>
          )}
          {channel.topic && (
            <>
              <span className="chat-area-text-faint">|</span>
              <span className="text-sm truncate chat-area-text-muted">
                {channel.topic}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSummary((v) => !v)}
              className="motion-interactive motion-press p-1.5 rounded surface-hover-md"
              title="AI catch-up summary"
              aria-label={showSummary ? "Hide AI channel summary" : "Show AI channel summary"}
              aria-pressed={showSummary}
            >
              <Sparkles className={`w-4 h-4 ${showSummary ? "chat-area-text-accent" : "text-[var(--theme-text-secondary)]"}`} />
            </button>

            <button
              type="button"
              onClick={toggleWorkspacePanel}
              className="motion-interactive motion-press p-1.5 rounded surface-hover-md"
              title="Workspace"
              aria-label={workspaceOpen ? "Hide Workspace" : "Show Workspace"}
              aria-pressed={workspaceOpen}
            >
              <Briefcase className={`w-4 h-4 ${workspaceOpen ? "chat-area-text-accent" : "text-[var(--theme-text-secondary)]"}`} />
            </button>

            <div
              role="toolbar"
              aria-label="Channel command bar"
              className="flex items-center gap-1 rounded-md px-1 py-0.5 border chat-area-command-toolbar-border"
              onKeyDown={handleCommandBarKeydown}
            >
              {visibleActions.map((action, index) => (
                <button
                  key={action.id}
                  ref={(node) => { commandActionRefs.current[index] = node }}
                  type="button"
                  onClick={() => {
                    action.onSelect()
                    trackCommandEvent("action", { actionId: action.id, group: action.group, source: "toolbar" })
                  }}
                  className="motion-interactive motion-press p-1.5 rounded surface-hover-md"
                  title={`${action.groupLabel}: ${action.label}`}
                  aria-label={action.ariaLabel}
                  tabIndex={index === focusedActionIndex ? 0 : -1}
                >
                  {action.icon}
                </button>
              ))}

              {layout.visibleActionIds.includes("inbox") && <NotificationBell userId={currentUserId} />}

              {overflowActions.length > 0 && (
                <div className="relative" ref={overflowRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setOverflowOpen((v) => !v)
                      trackCommandEvent("discoverability", { actionId: "overflow", source: "toolbar" })
                    }}
                    className="motion-interactive motion-press p-1.5 rounded surface-hover-md"
                    title="More channel actions"
                    aria-label="Show overflow channel actions"
                    aria-expanded={overflowOpen}
                    aria-haspopup="menu"
                  >
                    <MoreHorizontal className="w-4 h-4 text-[var(--theme-text-secondary)]" />
                  </button>
                  {overflowOpen && (
                    <div
                      role="menu"
                      aria-label="Overflow channel actions"
                      className="absolute right-0 top-8 z-20 min-w-48 rounded-md border chat-area-overflow-menu-surface p-1 shadow-xl"
                    >
                      {layout.overflowActionIds.includes("inbox") && (
                        <div className="px-2 py-1">
                          <NotificationBell userId={currentUserId} />
                        </div>
                      )}
                      {overflowActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            action.onSelect()
                            setOverflowOpen(false)
                            trackCommandEvent("action", { actionId: action.id, group: action.group, source: "overflow" })
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm chat-area-text-primary surface-hover"
                          aria-label={action.ariaLabel}
                        >
                          {action.icon}
                          <span>{action.label}</span>
                          <span className="ml-auto text-[10px] uppercase chat-area-text-muted">{action.groupLabel}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>}

        <ConnectionBanner />

        {showSearchModal && (
          <Suspense fallback={null}>
            <SearchModal
              serverId={serverId}
              onClose={() => setShowSearchModal(false)}
              onJumpToMessage={(channelId, messageId) => router.push(`/channels/${serverId}/${channelId}?message=${messageId}`)}
            />
          </Suspense>
        )}

        {showKeyboardShortcuts && (
          <Suspense fallback={null}>
            <KeyboardShortcutsModal
              open={showKeyboardShortcuts}
              onOpenChange={setShowKeyboardShortcuts}
              handlers={{
                onSearch: () => setShowSearchModal(true),
                onSearchInChannel: () => setShowSearchModal(true),
                onToggleMemberList: toggleMemberList,
                onToggleThreadPanel: toggleThreadPanel,
                onToggleWorkspacePanel: toggleWorkspacePanel,
                onOpenShortcutHelp: () => setShowKeyboardShortcuts(true),
              }}
            />
          </Suspense>
        )}

        <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">{typingAnnouncement}</div>

        {showSummary && (
          <ChannelSummaryCard
            serverId={serverId}
            channelId={channel.id}
            lastReadAt={initialLastReadAt}
          />
        )}

        {/* ── column-reverse scroll container ─────────────────────────
             scrollTop 0 = bottom (newest messages).  The browser natively
             anchors scroll when content grows at the start (visual bottom),
             so new messages never cause a jarring jump.                    */}
        <div
          ref={messageScrollerRef}
          className="flex-1 overflow-y-auto relative"
          role="log"
          aria-label="Message history"
          aria-relevant="additions"
          style={{ display: "flex", flexDirection: "column-reverse", overflowAnchor: "none", overscrollBehaviorY: "contain" }}
          {...(isMobile ? pullToRefreshHandlers : {})}
        >
          {/* Pull-to-refresh indicator (mobile only, column-reverse so this renders at visual top) */}
          {isMobile && (pullDistance > 0 || pullRefreshing) && (
            <div
              className="flex items-center justify-center py-2 select-none"
              style={{ minHeight: `${Math.max(pullDistance, pullRefreshing ? 40 : 0)}px` }}
              aria-live="polite"
            >
              <span
                className="text-xs"
                style={{
                  color: "var(--theme-text-muted)",
                  transform: pullRefreshing ? "none" : `rotate(${Math.min(pullDistance * 3, 360)}deg)`,
                  transition: pullRefreshing ? "transform 0s" : "none",
                }}
              >
                {pullRefreshing ? "Refreshing…" : pullDistance >= pullThreshold ? "Release to refresh" : "↓"}
              </span>
            </div>
          )}
          {/* Inner wrapper — rendered in normal (top-to-bottom) order inside
              the column-reverse parent.  Because the parent is reversed, the
              *end* of this div (newest messages) sits at the visual bottom. */}
          <div>
            {/* Channel beginning header */}
            {!hasMoreHistory && (
              <div className="px-4 py-4">
                <h2 className="text-lg font-bold font-display mb-0.5 chat-area-text-bright">
                  Welcome to #{channel.name}!
                </h2>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  This is the start of the #{channel.name} channel.
                  {channel.topic && ` ${channel.topic}`}
                </p>
              </div>
            )}

            {/* Sentinel + skeleton for loading older messages */}
            {hasMoreHistory && (
              <div className="px-4 py-3 space-y-3">
                {isPaginating && (
                  <>
                    <output className="sr-only" aria-live="polite">Loading older messages…</output>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-2.5 w-12 opacity-50" />
                          </div>
                          <Skeleton className={`h-3 ${["w-3/4", "w-full", "w-2/3", "w-5/6"][i % 4]}`} />
                          {i % 2 === 0 && <Skeleton className="h-3 w-1/2" />}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Message list — direct DOM rendering (no virtualizer) */}
            <div className="pb-4">
              {(() => {
                const groupingThresholdMs = messageGrouping === "never" ? 0 : messageGrouping === "10min" ? 10 * 60 * 1000 : 5 * 60 * 1000
                return messages.map((message, index) => {
                const prevMessage = messages[index - 1]
                const isGrouped =
                  messageGrouping !== "never" &&
                  prevMessage &&
                  prevMessage.author_id === message.author_id &&
                  new Date(message.created_at).getTime() -
                    new Date(prevMessage.created_at).getTime() < groupingThresholdMs

                return (
                  <div key={message.id} id={`message-${message.id}`}>
                    {unreadDividerMessageId === message.id && (
                      <div className="px-4 py-2 flex items-center gap-3" role="separator" aria-label="New messages">
                        <div className="h-px flex-1 chat-area-danger-bg opacity-50" />
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full flex-shrink-0 chat-area-new-messages-pill"
                        >
                          NEW MESSAGES
                        </span>
                        <div className="h-px flex-1 chat-area-danger-bg opacity-50" />
                      </div>
                    )}
                    <MessageItem
                      containerId={`message-${message.id}`}
                      highlighted={highlightedMessageId === message.id}
                      message={message}
                      isGrouped={!!isGrouped}
                      currentUserId={currentUserId}
                      canManageMessages={canManageMessages}
                      sendState={outboxStateByMessageId[message.id]}
                      onRetry={outboxStateByMessageId[message.id] === "failed" ? () => handleRetryMessage(message.id) : undefined}
                      recentlyActive={Boolean(message.author_id && recentlyActiveUserIds.has(message.author_id))}
                      animateOnMount={animatedMessageIds.has(message.id)}
                      onMountAnimationComplete={animatedMessageIds.has(message.id)
                        ? () => {
                          const timer = animatedMessageTimersRef.current.get(message.id)
                          if (timer) {
                            clearTimeout(timer)
                            animatedMessageTimersRef.current.delete(message.id)
                          }
                          setAnimatedMessageIds((current) => {
                            if (!current.has(message.id)) return current
                            const next = new Set(current)
                            next.delete(message.id)
                            return next
                          })
                        }
                        : undefined}
                      onReply={() => setReplyTo(message)}
                      onReplyJump={jumpToMessage}
                      onThreadCreated={(thread) => setActiveThread(thread)}
                      onEdit={async (content) => {
                        const res = await fetch(
                          `/api/servers/${serverId}/channels/${channel.id}/messages/${message.id}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ content }),
                          }
                        )
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({ error: "Failed to edit message" }))
                          throw new Error(data.error || "Failed to edit message")
                        }
                        const updated = await res.json().catch(() => null)
                        setMessages((prev) =>
                          prev.map((m) => m.id === message.id
                            ? updated ? { ...m, ...updated } : { ...m, content, edited_at: new Date().toISOString() }
                            : m)
                        )
                      }}
                      onDelete={async () => {
                        const res = await fetch(`/api/servers/${serverId}/channels/${channel.id}/messages/${message.id}`, {
                          method: "DELETE",
                        })
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({ error: "Failed to delete message" }))
                          throw new Error(data.error || "Failed to delete message")
                        }
                        setMessages((prev) => prev.filter((m) => m.id !== message.id))
                        setAndPersistOutbox((current) => removeOutboxEntry(current, message.id))
                      }}
                      onPinToggle={(pinned) => {
                        setMessages((prev) =>
                          prev.map((m) => m.id === message.id ? { ...m, pinned } : m)
                        )
                      }}
                      onReaction={async (emoji) => {
                        const previousMessage = messagesRef.current.find((m) => m.id === message.id)
                        const touched = Boolean(previousMessage)
                        const remove = previousMessage
                          ? previousMessage.reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                          : false

                        if (!touched) return

                        setMessages((prev) =>
                          prev.map((m) => {
                            if (m.id !== message.id) return m
                            return {
                              ...m,
                              reactions: remove
                                ? m.reactions.filter((r) => !(r.user_id === currentUserId && r.emoji === emoji))
                                : [...m.reactions, { message_id: message.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }],
                            }
                          })
                        )

                        try {
                          await sendReactionMutation({ messageId: message.id, emoji, remove, nonce: crypto.randomUUID() })
                        } catch {
                          if (!previousMessage) return
                          setMessages((prev) =>
                            prev.map((m) => (m.id === message.id ? { ...m, ...previousMessage } : m))
                          )
                        }
                      }}
                    />
                  </div>
                )
              })
              })()}
            </div>
            {/* Voice Recap cards — shown after voice sessions end in this channel */}
            {voiceRecaps.map((recap) => (
              <VoiceRecapCard
                key={recap.sessionId}
                sessionId={recap.sessionId}
                channelName={recap.channelName}
                durationSeconds={recap.durationSeconds}
              />
            ))}
            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          {/* Floating overlays — positioned absolutely within the scroll container */}
          {!isAtBottom && (
            <div className="absolute bottom-3 left-0 right-0 px-4 flex justify-center pointer-events-none z-10">
              <button
                onClick={jumpToLatest}
                className="motion-interactive motion-press px-4 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 pointer-events-auto chat-area-jump-latest-button"
                aria-label={pendingNewMessageCount > 0 ? `Jump to latest — ${pendingNewMessageCount} new message${pendingNewMessageCount > 1 ? "s" : ""}` : "Jump to latest message"}
              >
                ↓ {pendingNewMessageCount > 0 ? `${pendingNewMessageCount} new message${pendingNewMessageCount > 1 ? "s" : ""}` : "Jump to latest"}
              </button>
            </div>
          )}

          {showReturnToContext && jumpToMessageId && (
            <div className="absolute bottom-14 left-0 right-0 px-4 flex justify-end z-10">
              <button
                onClick={returnToContext}
                className="motion-interactive motion-press px-3 py-1.5 rounded-full text-xs font-semibold chat-area-return-context-button border"
              >
                Back to where you were
              </button>
            </div>
          )}

        </div>

        <TypingIndicator users={typingUsers.map((user) => user.displayName)} />

        <MessageInput
          channelName={channel.name}
          draft={draft}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSendMessage}
          onDraftChange={handleDraftChange}
          onTyping={onKeystroke}
          onSent={onSent}
          onCreateThread={() => setShowCreateChannelThread(true)}
          serverId={serverId}
        />
      </div>

      {activeThread && threadPanelOpen && (
        <div data-state="open" className="panel-surface-motion" style={{ ["--panel-transform-origin" as string]: "center right" }}>
          <Suspense fallback={null}>
            <ThreadPanel
              thread={activeThread}
              currentUserId={currentUserId}
              onClose={() => setThreadPanelOpen(false)}
              onThreadUpdate={(updated) => setActiveThread(updated)}
              focusMessageId={openThreadId ? jumpToMessageId : null}
            />
          </Suspense>
        </div>
      )}

      {showPinnedPanel && (
        <PinnedMessagesPanel
          channelId={channel.id}
          channelName={channel.name}
          canManageMessages={canManageMessages}
          onClose={() => setShowPinnedPanel(false)}
          onJumpToMessage={(messageId) => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete("thread")
            params.set("message", messageId)
            router.replace(`/channels/${serverId}/${channel.id}?${params.toString()}`)
          }}
        />
      )}

      <WorkspacePanel channelId={channel.id} open={workspaceOpen} onClose={toggleWorkspacePanel} />

      {showCreateChannelThread && (
        <Suspense fallback={null}>
          <CreateThreadModal
            open={showCreateChannelThread}
            onClose={() => setShowCreateChannelThread(false)}
            channelId={channel.id}
            onCreated={(thread) => {
              setActiveThread(thread)
              setThreadPanelOpen(true)
              setShowCreateChannelThread(false)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}