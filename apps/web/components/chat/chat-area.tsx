"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleHelp, Hash, MessageSquareText, Pin, Search, Users, Briefcase } from "lucide-react"
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
import { ThreadList } from "@/components/chat/thread-list"
import { SearchModal } from "@/components/modals/search-modal"
import { WorkspacePanel } from "@/components/chat/workspace-panel"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { useChatOutbox } from "@/components/chat/hooks/use-chat-outbox"
import { useChatScroll } from "@/components/chat/hooks/use-chat-scroll"
import {
  type OutboxEntry,
  removeOutboxEntry,
  resolveReplayOrder,
  setDraft,
  updateOutboxStatus,
  upsertOutboxEntry,
} from "@/lib/chat-outbox"

interface Props {
  channel: ChannelRow
  initialMessages: MessageWithAuthor[]
  currentUserId: string
  serverId: string
  initialLastReadAt: string | null
}

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === "23505"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MESSAGE_SELECT = `*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`
const REPLY_SELECT   = `*, author:users!messages_author_id_fkey(*)`
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
export function ChatArea({ channel, initialMessages, currentUserId, serverId, initialLastReadAt }: Props) {
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
  const [isPaginating, setIsPaginating] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(() => initialMessages.length >= 50)
  const [recentlyActiveTimestamps, setRecentlyActiveTimestamps] = useState<Record<string, number>>({})
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageScrollerRef = useRef<HTMLDivElement>(null)
  const previousLastMessageIdRef = useRef<string | null>(initialMessages[initialMessages.length - 1]?.id ?? null)
  const jumpedRef = useRef(false)
  const lastJumpMessageIdRef = useRef<string | null>(null)
  const jumpSignatureRef = useRef<string | null>(null)
  const paginationRequestRef = useRef<Promise<unknown> | null>(null)
  const messagesRef = useRef<MessageWithAuthor[]>(initialMessages)
  const reconnectCycleRef = useRef(0)
  const liveAnnouncementCounterRef = useRef(0)
  const unreadAnchorCycleRef = useRef<number | null>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"
  const { typingUsers, onKeystroke, onSent } = useTyping(channel.id, currentUserId, currentDisplayName)
  const jumpToMessageId = searchParams.get("message")
  const openThreadId = searchParams.get("thread")

  const jumpToMessage = useCallback((messageId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("message", messageId)
    params.delete("thread")
    router.replace(`/channels/${serverId}/${channel.id}?${params.toString()}`)
  }, [channel.id, router, searchParams, serverId])

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

  const persistOutboxAttachments = useCallback(async (messageId: string, entry: OutboxEntry) => {
    if (!entry.attachments?.length) return

    const { data: existingAttachments } = await supabase
      .from("attachments")
      .select("url, filename, size")
      .eq("message_id", messageId)

    const existing = new Set(
      (existingAttachments ?? []).map((attachment) => `${attachment.url}::${attachment.filename}::${attachment.size}`)
    )
    const toInsert = entry.attachments.filter(
      (attachment) => !existing.has(`${attachment.url}::${attachment.filename}::${attachment.size}`)
    )
    if (toInsert.length === 0) return

    const { error: attachmentsError } = await supabase
      .from("attachments")
      .insert(toInsert.map((attachment) => ({
        message_id: messageId,
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
        content_type: attachment.content_type,
      })))

    if (attachmentsError) {
      const uploadedPaths = entry.attachments
        .map((attachment) => attachment.storage_path)
        .filter((path): path is string => typeof path === "string")

      await supabase.from("messages").delete().eq("id", messageId)
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("attachments").remove(uploadedPaths)
      }
      throw new Error(attachmentsError.message || "Failed to persist message attachments")
    }
  }, [supabase])

  const sendOutboxEntry = useCallback(async (entry: OutboxEntry) => {
    setAndPersistOutbox((current) => updateOutboxStatus(current, entry.id, { status: "sending", lastError: null }))

    let data: unknown = null
    let error: { code?: string; message?: string } | null = null
    try {
      const result = await supabase
        .from("messages")
        .insert({
          id: entry.id,
          channel_id: entry.channelId,
          author_id: entry.authorId,
          content: entry.content.trim() || null,
          reply_to_id: entry.replyToId,
          client_nonce: entry.id,
        })
        .select(MESSAGE_SELECT)
        .single()
      data = result.data
      error = result.error

      if (!error || isDuplicateInsertError(error)) {
        await persistOutboxAttachments(entry.id, entry)
      }
    } catch (caughtError) {
      error = { message: caughtError instanceof Error ? caughtError.message : "Failed to replay outbox entry" }
    }

    if (error && !isDuplicateInsertError(error)) {
      const nextStatus = navigator.onLine ? "failed" : "queued"
      setAndPersistOutbox((current) => updateOutboxStatus(current, entry.id, {
        status: nextStatus,
        retryCount: entry.retryCount + 1,
        lastError: error.message || "Failed to replay outbox entry",
      }))
      return
    }

    setAndPersistOutbox((current) => removeOutboxEntry(current, entry.id))

    if (data) {
      const msg = data as any
      let replyTo = null
      if (msg.reply_to_id) {
        const { data: parent } = await supabase.from("messages").select(REPLY_SELECT).eq("id", msg.reply_to_id).single()
        replyTo = parent ?? null
      }
      upsertMessage({ ...msg, reply_to: replyTo } as MessageWithAuthor)
    }
  }, [persistOutboxAttachments, setAndPersistOutbox, supabase, upsertMessage])

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
    setAnimatedMessageIds(new Set())
    setIsPaginating(false)
    paginationRequestRef.current = null
  }, [initialMessages])

  const loadOlderMessages = useCallback(async () => {
    const container = messageScrollerRef.current
    const currentMessages = messagesRef.current
    if (!container || !hasMoreHistory || currentMessages.length === 0) return

    if (paginationRequestRef.current) {
      await paginationRequestRef.current.catch(() => undefined)
      return
    }

    setIsPaginating(true)
    const previousHeight = container.scrollHeight
    const previousTop = container.scrollTop
    const firstVisible = Array.from(container.querySelectorAll<HTMLElement>("[id^='message-']")).find((el) => el.offsetTop >= previousTop)
    const firstVisibleId = firstVisible?.id ?? null
    const firstVisibleOffset = firstVisible ? firstVisible.offsetTop - previousTop : null

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

      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id))
        const merged = [...older.filter((message) => !known.has(message.id)), ...prev]
        return sortMessagesChronologically(merged)
      })

      if (older.length < 50) {
        setHasMoreHistory(false)
      }

      requestAnimationFrame(() => {
        if (!messageScrollerRef.current) return
        const scroller = messageScrollerRef.current
        if (firstVisibleId && firstVisibleOffset !== null) {
          const anchor = document.getElementById(firstVisibleId)
          if (anchor) {
            scroller.scrollTop = anchor.offsetTop - firstVisibleOffset
            return
          }
        }
        const nextHeight = scroller.scrollHeight
        scroller.scrollTop = previousTop + (nextHeight - previousHeight)
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (jumpToMessageId || openThreadId) return
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "auto" })
    })
  }, [channel.id])

  useEffect(() => {
    const newestMessage = messages[messages.length - 1]
    const newestMessageId = newestMessage?.id ?? null
    const hasNewMessages = !!newestMessageId && newestMessageId !== previousLastMessageIdRef.current
    previousLastMessageIdRef.current = newestMessageId
    if (!hasNewMessages || !newestMessage) return

    if (isAtBottom || newestMessage.author_id === currentUserId) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
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
      if (!loaded || cancelled) return

      rafId = window.requestAnimationFrame(() => {
        if (cancelled) return
        const target = document.getElementById(`message-${jumpToMessageId}`)
        if (!target) return
        target.scrollIntoView({ block: "center", behavior: "auto" })
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
  }, [ensureMessageLoaded, jumpToMessageId, loadMessageContextWindow, openThreadId, returnScrollStorageKey])

  const jumpToLatest = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    setPendingNewMessageCount(0)
    setUnreadAnchorMessageId(null)
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(unreadAnchorStorageKey)
    }
  }, [unreadAnchorStorageKey])

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

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        id: messageId,
        channel_id: channel.id,
        author_id: currentUserId,
        content: content.trim() || null,
        reply_to_id: replyTo?.id || null,
        client_nonce: messageId,
      })
      .select(MESSAGE_SELECT)
      .single()

    if (error && !isDuplicateInsertError(error)) {
      if (attachments.length > 0) {
        await supabase.storage.from("attachments").remove(attachments.map((attachment) => attachment.storage_path))
      }
      setAndPersistOutbox((current) => updateOutboxStatus(current, messageId, {
        status: "failed",
        retryCount: 1,
        lastError: error.message || "send failed",
      }))
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: error.message || "Your message could not be sent. Please try again.",
      })
      throw new Error("Your message could not be sent. Please try again.")
    }

    if (attachments.length > 0) {
      const { error: attachmentInsertError } = await supabase
        .from("attachments")
        .insert(attachments.map((attachment) => ({
          message_id: messageId,
          url: attachment.url,
          filename: attachment.filename,
          size: attachment.size,
          content_type: attachment.content_type,
        })))

      if (attachmentInsertError) {
        await supabase.from("messages").delete().eq("id", messageId)
        await supabase.storage.from("attachments").remove(attachments.map((attachment) => attachment.storage_path))
        setAndPersistOutbox((current) => updateOutboxStatus(current, messageId, {
          status: "failed",
          retryCount: 1,
          lastError: attachmentInsertError.message || "Failed to store attachments",
        }))
        toast({
          variant: "destructive",
          title: "Failed to attach files",
          description: attachmentInsertError.message || "Message send was rolled back due to attachment failure.",
        })
        throw new Error("Failed to store attachments")
      }
    }

    setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
    if (message) {
      upsertMessage({ ...message, reply_to: replyTo ?? null } as unknown as MessageWithAuthor)
    }

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

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--theme-bg-primary)' }}>
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
          style={{ borderColor: 'var(--theme-bg-tertiary)' }}
        >
          <Hash className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }} />
          <span className="font-semibold text-white">{channel.name}</span>
          {!isOnline && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--theme-warning) 13%, transparent)", color: "var(--theme-warning)" }}>
              Offline
            </span>
          )}
          {channel.topic && (
            <>
              <span style={{ color: 'var(--theme-text-faint)' }}>|</span>
              <span className="text-sm truncate" style={{ color: 'var(--theme-text-muted)' }}>
                {channel.topic}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell userId={currentUserId} />

            <button
              onClick={toggleWorkspacePanel}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Workspace"
              aria-label="Workspace"
            >
              <Briefcase className="w-4 h-4" style={{ color: workspaceOpen ? "var(--theme-accent)" : "var(--theme-text-secondary)" }} />
            </button>

            <button
              onClick={() => setShowSearchModal(true)}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Search messages"
              aria-label="Search messages"
            >
              <Search className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
            </button>

            <button
              onClick={() => toast({ title: "Pinned view", description: "Pinned message view is queued for a follow-up pass." })}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Pinned messages"
              aria-label="Pinned messages"
            >
              <Pin className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
            </button>

            <button
              onClick={() => toast({ title: "Help", description: "Shortcuts: Ctrl/Cmd+K (Quick Switcher), Ctrl/Cmd+F (Search)." })}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Help"
              aria-label="Help"
            >
              <CircleHelp className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
            </button>

            <button
              onClick={toggleMemberList}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title={memberListOpen ? "Hide Member List" : "Show Member List"}
            >
              <Users className="w-4 h-4" style={{ color: memberListOpen ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} />
            </button>

            <button
              onClick={toggleThreadPanel}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title={threadPanelOpen ? "Hide Thread Panel" : "Show Thread Panel"}
            >
              <MessageSquareText className="w-4 h-4" style={{ color: threadPanelOpen ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} />
            </button>
          </div>
        </div>

        {showSearchModal && (
          <SearchModal
            serverId={serverId}
            onClose={() => setShowSearchModal(false)}
            onJumpToMessage={(channelId, messageId) => router.push(`/channels/${serverId}/${channelId}?message=${messageId}`)}
          />
        )}

        <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">{typingAnnouncement}</div>
        <div ref={messageScrollerRef} className="flex-1 overflow-y-auto relative">
          {messages.length === 0 && (
            <div className="px-4 py-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'var(--theme-text-faint)' }}
              >
                <Hash className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Welcome to #{channel.name}!
              </h2>
              <p style={{ color: 'var(--theme-text-secondary)' }}>
                This is the start of the #{channel.name} channel.
                {channel.topic && ` ${channel.topic}`}
              </p>
            </div>
          )}

          <div className="pb-4">
            {isPaginating && (
              <div className="px-4 py-2 text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
                Loading earlier messages…
              </div>
            )}
            {messages.map((message, i) => {
              const prevMessage = messages[i - 1]
              const isGrouped =
                prevMessage &&
                prevMessage.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(prevMessage.created_at).getTime() < 5 * 60 * 1000

              return (
                <div key={message.id} style={{ overflowAnchor: "none" }}>
                {unreadDividerMessageId === message.id && (
                  <div className="px-4 py-2 flex items-center gap-3" role="separator" aria-label="New messages">
                    <div className="h-px flex-1" style={{ background: "var(--theme-danger)", opacity: 0.5 }} />
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: "var(--theme-danger)", background: "color-mix(in srgb, var(--theme-danger) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--theme-danger) 40%, transparent)" }}
                    >
                      NEW MESSAGES
                    </span>
                    <div className="h-px flex-1" style={{ background: "var(--theme-danger)", opacity: 0.5 }} />
                  </div>
                )}
                <MessageItem
                  containerId={`message-${message.id}`}
                  highlighted={highlightedMessageId === message.id}
                  message={message}
                  isGrouped={!!isGrouped}
                  currentUserId={currentUserId}
                  sendState={outboxStateByMessageId[message.id]}
                  onRetry={outboxStateByMessageId[message.id] === "failed" ? () => handleRetryMessage(message.id) : undefined}
                  recentlyActive={Boolean(message.author_id && recentlyActiveUserIds.has(message.author_id))}
                  animateOnMount={animatedMessageIds.has(message.id)}
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
            <div ref={bottomRef} style={{ overflowAnchor: "auto", height: 1 }} />
          </div>

          {!isAtBottom && (
            <div className="sticky bottom-3 px-4 flex justify-center pointer-events-none">
              <button
                onClick={jumpToLatest}
                className="motion-interactive motion-press px-4 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 pointer-events-auto"
                style={{ background: "var(--theme-accent)", color: "var(--theme-bg-primary)" }}
              >
                ↓ {pendingNewMessageCount > 0 ? `${pendingNewMessageCount} new message${pendingNewMessageCount > 1 ? "s" : ""}` : "Jump to latest"}
              </button>
            </div>
          )}

          {showReturnToContext && jumpToMessageId && (
            <div className="sticky bottom-14 px-4 flex justify-end">
              <button
                onClick={returnToContext}
                className="motion-interactive motion-press px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: "var(--theme-bg-secondary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
              >
                Back to where you were
              </button>
            </div>
          )}

          <ThreadList
            channelId={channel.id}
            activeThreadId={activeThread?.id ?? null}
            filter="all"
            onSelectThread={(thread) => {
              setActiveThread(thread)
              setThreadPanelOpen(true)
            }}
          />
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

      <WorkspacePanel channelId={channel.id} open={workspaceOpen} />
    </div>
  )
}
