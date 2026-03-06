"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleHelp, Hash, MessageSquareText, Pin, Search, Users, Briefcase, Sparkles, Volume2, MoreHorizontal } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { sendReactionMutation } from "@/lib/reactions-client"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import type { AttachmentRow, ChannelRow, MessageWithAuthor, ThreadRow } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeMessages } from "@/hooks/use-realtime-messages"
import { useTyping } from "@/hooks/use-typing"
import { useToast } from "@/components/ui/use-toast"
import { ThreadPanel } from "@/components/chat/thread-panel"
import { SearchModal } from "@/components/modals/search-modal"
import { CreateThreadModal } from "@/components/modals/create-thread-modal"
import { KeyboardShortcutsModal } from "@/components/modals/keyboard-shortcuts-modal"
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
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList, currentUser, workspaceOpen, toggleWorkspacePanel, threadPanelOpen, toggleThreadPanel, setThreadPanelOpen } = useAppStore(
    useShallow((s) => ({ setActiveServer: s.setActiveServer, setActiveChannel: s.setActiveChannel, memberListOpen: s.memberListOpen, toggleMemberList: s.toggleMemberList, currentUser: s.currentUser, workspaceOpen: s.workspaceOpen, toggleWorkspacePanel: s.toggleWorkspacePanel, threadPanelOpen: s.threadPanelOpen, toggleThreadPanel: s.toggleThreadPanel, setThreadPanelOpen: s.setThreadPanelOpen }))
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

  // ── Virtual list ──────────────────────────────────────────────────────────
  // O(1) lookup of message index by ID for virtualizer scrollToIndex
  const messageIndexMap = useMemo(
    () => new Map(messages.map((m, i) => [m.id, i])),
    [messages]
  )

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messageScrollerRef.current,
    estimateSize: () => 72,
    overscan: 8,
    // Measure actual rendered heights for accurate positioning
    measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
  })

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

      return sortMessagesChronologically(next)
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

  useEffect(() => {
    messagesRef.current = initialMessages
    setMessages(initialMessages)
    previousLastMessageIdRef.current = initialMessages[initialMessages.length - 1]?.id ?? null
    setPendingNewMessageCount(0)
    setHasMoreHistory(initialMessages.length >= 50)
    for (const timer of animatedMessageTimersRef.current.values()) {
      clearTimeout(timer)
    }
    animatedMessageTimersRef.current.clear()
    setAnimatedMessageIds(new Set())
    setIsPaginating(false)
    paginationRequestRef.current = null
    shouldAutoScrollToLatestRef.current = true
  }, [initialMessages])

  const scrollToLatest = useCallback((behavior: "auto" | "smooth" = "auto") => {
    const container = messageScrollerRef.current
    if (!container) return

    const lastIndex = messagesRef.current.length - 1
    if (lastIndex >= 0) {
      virtualizer.scrollToIndex(lastIndex, { align: "end", behavior })
    } else {
      bottomRef.current?.scrollIntoView({ behavior })
    }

    requestAnimationFrame(() => {
      const scroller = messageScrollerRef.current
      if (!scroller) return
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      if (maxScrollTop - scroller.scrollTop > 2) {
        scroller.scrollTop = maxScrollTop
      }
    })
  }, [virtualizer])

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
    // Capture the ID of the top-most currently visible message so we can
    // restore scroll position after prepending older messages.
    const firstVisibleRange = virtualizer.range
    const anchorIndex = firstVisibleRange?.startIndex ?? 0
    const anchorId = currentMessages[anchorIndex]?.id ?? null

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

      // Capture scroll height before state update for the fallback path
      const prevScrollHeight = messageScrollerRef.current?.scrollHeight ?? 0
      const prevScrollTop = messageScrollerRef.current?.scrollTop ?? 0

      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id))
        const newItems = older.filter((message) => !known.has(message.id))
        const merged = [...newItems, ...prev]
        return sortMessagesChronologically(merged)
      })

      if (older.length < 50) {
        setHasMoreHistory(false)
      }

      // Restore scroll: jump to where the anchor message ended up in the
      // updated list (its index has shifted by the number of prepended messages).
      requestAnimationFrame(() => {
        if (!anchorId) return
        const updatedMessages = messagesRef.current
        const newAnchorIndex = updatedMessages.findIndex((m) => m.id === anchorId)
        if (newAnchorIndex !== -1) {
          virtualizer.scrollToIndex(newAnchorIndex, { align: "start", behavior: "auto" })
        } else if (messageScrollerRef.current) {
          // Fallback: shift by the measured scrollHeight delta
          const scroller = messageScrollerRef.current
          scroller.scrollTop = prevScrollTop + (scroller.scrollHeight - prevScrollHeight)
        }
      })
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

  const { isAtBottom } = useChatScroll({
    hasMoreHistory,
    loadOlderMessages,
    messageScrollerRef,
    paginationRequestRef,
    scrollStorageKey,
    unreadAnchorStorageKey,
    onReachedBottom,
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

  useEffect(() => {
    if (!isOnline) return
    flushOutbox()
  }, [isOnline, channel.id, flushOutbox])

  useEffect(() => {
    if (!shouldAutoScrollToLatestRef.current) return
    if (jumpToMessageId || openThreadId) return
    if (messages.length === 0) return
    shouldAutoScrollToLatestRef.current = false
    scrollToLatest("auto")
  }, [jumpToMessageId, messages.length, openThreadId, scrollToLatest])

  useEffect(() => {
    const newestMessage = messages[messages.length - 1]
    const newestMessageId = newestMessage?.id ?? null
    const hasNewMessages = !!newestMessageId && newestMessageId !== previousLastMessageIdRef.current
    previousLastMessageIdRef.current = newestMessageId
    if (!hasNewMessages || !newestMessage) return

    if (isAtBottom || newestMessage.author_id === currentUserId) {
      scrollToLatest("smooth")
      return
    }

    const authorName = newestMessage.author?.display_name || newestMessage.author?.username || "Unknown"
    liveAnnouncementCounterRef.current += 1
    setLiveAnnouncement("")
    queueMicrotask(() => {
      setLiveAnnouncement(`New message from ${authorName}`)
    })

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
  }, [currentUserId, isAtBottom, messages, unreadAnchorStorageKey])

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
        // Use the virtualizer index for scroll (works even if item is off-screen)
        const targetIndex = messageIndexMap.get(jumpToMessageId)
        if (targetIndex !== undefined) {
          virtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "auto" })
        } else {
          // Fallback to DOM for edge cases (e.g. outbox messages not yet in virtualizer)
          const target = document.getElementById(`message-${jumpToMessageId}`)
          if (target) target.scrollIntoView({ block: "center", behavior: "auto" })
        }
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
  }, [ensureMessageLoaded, jumpToMessageId, loadMessageContextWindow, messageIndexMap, openThreadId, returnScrollStorageKey, toast, virtualizer])

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
    }
  )

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
    const apiResponse = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel.id,
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
      try {
        const body = await apiResponse.json()
        if (typeof body.error === "string") errorMsg = body.error
      } catch {}
      if (attachments.length > 0) {
        await supabase.storage.from("attachments").remove(attachments.map((attachment) => attachment.storage_path))
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
        label: memberListOpen ? "Members" : "Voice & Members",
        group: "voice",
        groupLabel: "Voice",
        priority: 5,
        ariaLabel: memberListOpen ? "Hide members and voice status" : "Show members and voice status",
        icon: memberListOpen
          ? <Users className="w-4 h-4 chat-area-text-primary" />
          : <Volume2 className="w-4 h-4 chat-area-text-muted" />,
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

  const visibleActions = commandActions.filter((action) => layout.visibleActionIds.includes(action.id))
  const overflowActions = commandActions.filter((action) => layout.overflowActionIds.includes(action.id))

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
        <div
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
        </div>

        {showSearchModal && (
          <SearchModal
            serverId={serverId}
            onClose={() => setShowSearchModal(false)}
            onJumpToMessage={(channelId, messageId) => router.push(`/channels/${serverId}/${channelId}?message=${messageId}`)}
          />
        )}

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

        <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">{typingAnnouncement}</div>

        {showSummary && (
          <ChannelSummaryCard
            serverId={serverId}
            channelId={channel.id}
            lastReadAt={initialLastReadAt}
          />
        )}

        <div ref={messageScrollerRef} className="flex-1 overflow-y-auto relative">
          {messages.length === 0 && (
            <div className="px-4 py-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4 chat-area-empty-state-icon-bg"
              >
                <Hash className="w-8 h-8 chat-area-text-accent" />
              </div>
              <h2 className="text-2xl font-bold font-display mb-2 chat-area-text-bright">
                Welcome to #{channel.name}!
              </h2>
              <p className="text-[var(--theme-text-secondary)]">
                This is the start of the #{channel.name} channel.
                {channel.topic && ` ${channel.topic}`}
              </p>
            </div>
          )}

          <div className="pb-4">
            {isPaginating && (
              <div className="px-4 py-3 space-y-3">
                <span className="sr-only" role="status" aria-live="polite">Loading older messages…</span>
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
              </div>
            )}

            {/* Virtualized message list — only renders items near the viewport */}
            <div
              style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const message = messages[virtualItem.index]
                if (!message) return null
                const prevMessage = messages[virtualItem.index - 1]
                const isGrouped =
                  prevMessage &&
                  prevMessage.author_id === message.author_id &&
                  new Date(message.created_at).getTime() -
                    new Date(prevMessage.created_at).getTime() < 5 * 60 * 1000

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
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
                        const { data, error } = await supabase
                          .from("messages")
                          .update({ deleted_at: new Date().toISOString() })
                          .eq("id", message.id)
                          .eq("author_id", currentUserId)
                          .select("id")
                        if (error) throw error
                        if (!data || data.length === 0) {
                          throw new Error("Message could not be deleted. It may have already been removed.")
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
              })}
            </div>
            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          {!isAtBottom && (
            <div className="sticky bottom-3 px-4 flex justify-center pointer-events-none">
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
            <div className="sticky bottom-14 px-4 flex justify-end">
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
        />
      </div>

      {activeThread && threadPanelOpen && (
        <div data-state="open" className="panel-surface-motion" style={{ ["--panel-transform-origin" as string]: "center right" }}>
          <ThreadPanel
            thread={activeThread}
            currentUserId={currentUserId}
            onClose={() => setThreadPanelOpen(false)}
            onThreadUpdate={(updated) => setActiveThread(updated)}
            focusMessageId={openThreadId ? jumpToMessageId : null}
          />
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

      <WorkspacePanel channelId={channel.id} open={workspaceOpen} />

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
    </div>
  )
}