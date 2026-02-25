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
import {
  type OutboxEntry,
  getDraft,
  loadOutbox,
  removeOutboxEntry,
  resolveReplayOrder,
  saveOutbox,
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

const MESSAGE_SELECT = `*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*), reply_to:messages!messages_reply_to_id_fkey(*, author:users!messages_author_id_fkey(*))`

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
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])
  const [draft, setDraftState] = useState("")
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0)
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [showReturnToContext, setShowReturnToContext] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [isPaginating, setIsPaginating] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(() => initialMessages.length >= 50)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageScrollerRef = useRef<HTMLDivElement>(null)
  const previousLastMessageIdRef = useRef<string | null>(initialMessages[initialMessages.length - 1]?.id ?? null)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpedRef = useRef(false)
  const lastJumpMessageIdRef = useRef<string | null>(null)
  const jumpSignatureRef = useRef<string | null>(null)
  const outboxRef = useRef<OutboxEntry[]>([])
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef("")
  const prevChannelIdRef = useRef(channel.id)
  const paginationRequestRef = useRef<Promise<unknown> | null>(null)
  const messagesRef = useRef<MessageWithAuthor[]>(initialMessages)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"
  const { typingUsers, onKeystroke, onSent } = useTyping(channel.id, currentUserId, currentDisplayName)
  const jumpToMessageId = searchParams.get("message")
  const openThreadId = searchParams.get("thread")

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
      appearance_settings: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }, [currentUser, currentUserId])

  const setAndPersistOutbox = useCallback((next: OutboxEntry[] | ((current: OutboxEntry[]) => OutboxEntry[])) => {
    const resolved = typeof next === "function" ? next(outboxRef.current) : next
    setOutbox(resolved)
    outboxRef.current = resolved
    saveOutbox(resolved)
  }, [])

  const upsertMessage = useCallback((incoming: MessageWithAuthor) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((m) => m.id === incoming.id)
      const next = existingIndex === -1
        ? [...prev, incoming]
        : prev.map((message, idx) => (idx === existingIndex ? { ...prev[existingIndex], ...incoming } : message))

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
      upsertMessage(data as unknown as MessageWithAuthor)
    }
  }, [persistOutboxAttachments, setAndPersistOutbox, supabase, upsertMessage])

  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine) return
    const toReplay = resolveReplayOrder(outboxRef.current).filter((entry) => entry.channelId === channel.id)
    for (const entry of toReplay) {
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
        const nextHeight = messageScrollerRef.current.scrollHeight
        messageScrollerRef.current.scrollTop = previousTop + (nextHeight - previousHeight)
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
    const persisted = loadOutbox()
    outboxRef.current = persisted
    setOutbox(persisted)
    setDraftState(getDraft(channel.id))

    const channelOutbox = persisted.filter((entry) => entry.channelId === channel.id)
    if (channelOutbox.length > 0) {
      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id))
        const optimistic = channelOutbox
          .filter((entry) => !known.has(entry.id))
          .map(makeOptimisticMessage)
        return [...prev, ...optimistic]
      })
    }
  }, [channel.id, makeOptimisticMessage])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])


  useEffect(() => {
    outboxRef.current = outbox
  }, [outbox])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const flushDraftNow = useCallback((channelId: string) => {
    setDraft(channelId, draftRef.current)
  }, [])

  useEffect(() => {
    const channelIdAtEffect = channel.id
    prevChannelIdRef.current = channelIdAtEffect

    return () => {
      if (draftPersistTimerRef.current) {
        flushDraftNow(channelIdAtEffect)
        clearTimeout(draftPersistTimerRef.current)
        draftPersistTimerRef.current = null
      }
    }
  }, [channel.id, flushDraftNow])

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
    const container = messageScrollerRef.current
    if (!container) return

    const persistScroll = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const onScroll = () => {
      if (container.scrollTop < 120 && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const nextIsAtBottom = distanceFromBottom < 120
      setIsAtBottom(nextIsAtBottom)

      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
      }
      scrollSaveTimerRef.current = setTimeout(() => {
        persistScroll()
        scrollSaveTimerRef.current = null
      }, 250)

      if (nextIsAtBottom) {
        setPendingNewMessageCount(0)
        setUnreadAnchorMessageId(null)
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(unreadAnchorStorageKey)
        }
      }
    }

    onScroll()
    container.addEventListener("scroll", onScroll)
    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      persistScroll()
      container.removeEventListener("scroll", onScroll)
    }
  }, [hasMoreHistory, loadOlderMessages, scrollStorageKey, unreadAnchorStorageKey])

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

    setPendingNewMessageCount((count) => count + 1)
    setUnreadAnchorMessageId((current) => {
      if (current) return current
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
      setMessages((prev) =>
        prev.map((m) => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m)
      )
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

  async function handleSendMessage(content: string, attachmentFiles?: File[]) {
    if (!content.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    if (!currentUserId) return

    if (!navigator.onLine && attachmentFiles?.length) {
      toast({
        variant: "destructive",
        title: "Attachments require a connection",
        description: "Files can't be queued offline yet. Reconnect and retry.",
      })
      return
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
      setReplyTo(null)
      setDraftState("")
      if (draftPersistTimerRef.current) { clearTimeout(draftPersistTimerRef.current); draftPersistTimerRef.current = null }
      setDraft(channel.id, "")
      onSent()
      toast({ title: "Queued for send", description: "Message will send when your connection returns." })
      return
    }

    const attachments: Array<{ url: string; filename: string; size: number; content_type: string; storage_path: string }> = []
    if (attachmentFiles?.length) {
      for (const file of attachmentFiles) {
        const path = `${channel.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from("attachments").upload(path, file)
        if (error) {
          toast({
            variant: "destructive",
            title: "Upload failed",
            description: `Failed to upload ${file.name}: ${error.message}`,
          })
          continue
        }
        const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 3600 * 24 * 7)
        if (signed) {
          attachments.push({
            url: signed.signedUrl,
            filename: file.name,
            size: file.size,
            content_type: file.type,
            storage_path: path,
          })
        }
      }
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
      return
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
        return
      }
    }

    setAndPersistOutbox((current) => removeOutboxEntry(current, messageId))
    if (message) {
      upsertMessage(message as unknown as MessageWithAuthor)
    }

    setReplyTo(null)
    setDraftState("")
    if (draftPersistTimerRef.current) { clearTimeout(draftPersistTimerRef.current); draftPersistTimerRef.current = null }
    setDraft(channel.id, "")
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
                <div key={message.id}>
                {unreadDividerMessageId === message.id && (
                  <div className="px-4 py-2.5 flex items-center gap-2" role="separator" aria-label="New since last read">
                    <div className="h-0.5 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--theme-danger) 0%, #f87171 100%)" }} />
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-full"
                      style={{ color: "#ffe3e3", background: "color-mix(in srgb, var(--theme-danger) 20%, transparent)", border: "1px solid color-mix(in srgb, var(--theme-danger) 60%, transparent)" }}
                    >
                      New since last read
                    </span>
                    <div className="h-0.5 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, #f87171 0%, var(--theme-danger) 100%)" }} />
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
                  onReply={() => setReplyTo(message)}
                  onThreadCreated={(thread) => setActiveThread(thread)}
                  onEdit={async (content) => {
                    const { error } = await supabase
                      .from("messages")
                      .update({ content, edited_at: new Date().toISOString() })
                      .eq("id", message.id)
                    if (!error) {
                      setMessages((prev) =>
                        prev.map((m) => m.id === message.id ? { ...m, content, edited_at: new Date().toISOString() } : m)
                      )
                    }
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
            <div ref={bottomRef} />
          </div>

          {!isAtBottom && (
            <div className="sticky bottom-3 px-4 flex justify-end">
              <button
                onClick={jumpToLatest}
                className="motion-interactive motion-press px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg"
                style={{ background: "var(--theme-accent)", color: "white" }}
              >
                Jump to present {pendingNewMessageCount > 0 ? `(${pendingNewMessageCount})` : ""}
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
