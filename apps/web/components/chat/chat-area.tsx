"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AtSign, CircleHelp, Filter, Hash, MessageSquareText, MoreHorizontal, Pin, Search, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
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
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SearchModal } from "@/components/modals/search-modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

/** Primary text channel view with message list, outbox queue, real-time updates, thread panel, unread markers, and infinite scroll. */
export function ChatArea({ channel, initialMessages, currentUserId, serverId, initialLastReadAt }: Props) {
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList, currentUser } = useAppStore(
    useShallow((s) => ({ setActiveServer: s.setActiveServer, setActiveChannel: s.setActiveChannel, memberListOpen: s.memberListOpen, toggleMemberList: s.toggleMemberList, currentUser: s.currentUser }))
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
  const [threadPanelOpen, setThreadPanelOpen] = useState(true)
  const [threadFilter, setThreadFilter] = useState<"all" | "active" | "archived">("all")
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageScrollerRef = useRef<HTMLDivElement>(null)
  const previousLastMessageIdRef = useRef<string | null>(initialMessages[initialMessages.length - 1]?.id ?? null)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpedRef = useRef(false)
  const lastJumpMessageIdRef = useRef<string | null>(null)
  const outboxRef = useRef<OutboxEntry[]>([])
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef("")
  const prevChannelIdRef = useRef(channel.id)
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
  const threadPanelStorageKey = useMemo(
    () => `vortexchat:thread-panel-open:${currentUserId}:${channel.id}`,
    [channel.id, currentUserId]
  )

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
      if (existingIndex === -1) return [...prev, incoming]
      const next = [...prev]
      next[existingIndex] = { ...prev[existingIndex], ...incoming }
      return next
    })
  }, [])

  const makeOptimisticMessage = useCallback((entry: OutboxEntry): MessageWithAuthor => ({
    id: entry.id,
    channel_id: entry.channelId,
    author_id: entry.authorId,
    content: entry.content,
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
    reply_to: null,
  }), [optimisticAuthor])

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
        })
        .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
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
    setMessages(initialMessages)
    previousLastMessageIdRef.current = initialMessages[initialMessages.length - 1]?.id ?? null
    setPendingNewMessageCount(0)
  }, [initialMessages])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(threadPanelStorageKey)
      setThreadPanelOpen(stored == null ? true : stored === "true")
    } catch {
      setThreadPanelOpen(true)
    }
  }, [threadPanelStorageKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(threadPanelStorageKey, String(threadPanelOpen))
    } catch {
      // Best effort only. Ignore storage failures.
    }
  }, [threadPanelOpen, threadPanelStorageKey])

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

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return
    const savedScrollTop = typeof window === "undefined" ? null : window.sessionStorage.getItem(scrollStorageKey)
    if (savedScrollTop) {
      container.scrollTop = Number(savedScrollTop)
      return
    }
    bottomRef.current?.scrollIntoView()
  }, [scrollStorageKey])

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return

    const persistScroll = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const onScroll = () => {
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
  }, [scrollStorageKey, unreadAnchorStorageKey])

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
    if (!jumpToMessageId || openThreadId) {
      setShowReturnToContext(false)
      jumpedRef.current = false
      lastJumpMessageIdRef.current = null
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

    const target = document.getElementById(`message-${jumpToMessageId}`)
    if (!target) return
    target.scrollIntoView({ block: "center", behavior: "smooth" })
    setHighlightedMessageId(jumpToMessageId)
    jumpedRef.current = true
    const timer = window.setTimeout(() => setHighlightedMessageId(null), 2200)
    return () => window.clearTimeout(timer)
  }, [jumpToMessageId, messages, openThreadId, returnScrollStorageKey])

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
      })
      .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
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
      <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#313338' }}>
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
          style={{ borderColor: '#1e1f22' }}
        >
          <Hash className="w-5 h-5 flex-shrink-0" style={{ color: '#949ba4' }} />
          <span className="font-semibold text-white">{channel.name}</span>
          {!isOnline && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#f0b23222", color: "#f0b232" }}>
              Offline
            </span>
          )}
          {channel.topic && (
            <>
              <span style={{ color: '#4e5058' }}>|</span>
              <span className="text-sm truncate" style={{ color: '#949ba4' }}>
                {channel.topic}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowSearchModal(true)}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Search messages"
              aria-label="Search messages"
            >
              <Search className="w-4 h-4" style={{ color: "#b5bac1" }} />
            </button>

            <button
              onClick={() => toast({ title: "Pinned view", description: "Pinned message view is queued for a follow-up pass." })}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Pinned messages"
              aria-label="Pinned messages"
            >
              <Pin className="w-4 h-4" style={{ color: "#b5bac1" }} />
            </button>

            <NotificationBell userId={currentUserId} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
                  title="Thread filters"
                  aria-label="Thread filters"
                >
                  <Filter className="w-4 h-4" style={{ color: "#b5bac1" }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]" style={{ background: "#232428", borderColor: "#1e1f22", color: "#dcddde" }}>
                <DropdownMenuLabel>Thread filters</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setThreadFilter("all")}>All threads</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setThreadFilter("active")}>Active only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setThreadFilter("archived")}>Archived only</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={() => toast({ title: "Help", description: "Shortcuts: Ctrl/Cmd+K (Quick Switcher), Ctrl/Cmd+F (Search)." })}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title="Help"
              aria-label="Help"
            >
              <CircleHelp className="w-4 h-4" style={{ color: "#b5bac1" }} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
                  title="More options"
                  aria-label="More options"
                >
                  <MoreHorizontal className="w-4 h-4" style={{ color: "#b5bac1" }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]" style={{ background: "#232428", borderColor: "#1e1f22", color: "#dcddde" }}>
                <DropdownMenuLabel>Channel utilities</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setShowSearchModal(true)}><Search className="w-3.5 h-3.5 mr-2" /> Search</DropdownMenuItem>
                <DropdownMenuItem onClick={toggleMemberList}><Users className="w-3.5 h-3.5 mr-2" /> {memberListOpen ? "Hide" : "Show"} member list</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setThreadPanelOpen((open) => !open)}><MessageSquareText className="w-3.5 h-3.5 mr-2" /> {threadPanelOpen ? "Hide" : "Show"} thread panel</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => toast({ title: "Mentions inbox", description: "Your inbox highlights mentions and replies in real time." })}><AtSign className="w-3.5 h-3.5 mr-2" /> Mentions inbox</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={toggleMemberList}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title={memberListOpen ? "Hide Member List" : "Show Member List"}
            >
              <Users className="w-5 h-5" style={{ color: memberListOpen ? '#f2f3f5' : '#949ba4' }} />
            </button>

            <button
              onClick={() => setThreadPanelOpen((open) => !open)}
              className="motion-interactive motion-press p-1.5 rounded hover:bg-white/10"
              title={threadPanelOpen ? "Hide Thread Panel" : "Show Thread Panel"}
            >
              <MessageSquareText className="w-5 h-5" style={{ color: threadPanelOpen ? '#f2f3f5' : '#949ba4' }} />
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
                style={{ background: '#4e5058' }}
              >
                <Hash className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Welcome to #{channel.name}!
              </h2>
              <p style={{ color: '#b5bac1' }}>
                This is the start of the #{channel.name} channel.
                {channel.topic && ` ${channel.topic}`}
              </p>
            </div>
          )}

          <div className="pb-4">
            {messages.map((message, i) => {
              const prevMessage = messages[i - 1]
              const isGrouped =
                prevMessage &&
                prevMessage.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(prevMessage.created_at).getTime() < 5 * 60 * 1000

              return (
                <div key={message.id}>
                {unreadAnchorMessageId === message.id && (
                  <div className="px-4 py-2 flex items-center gap-2" role="separator" aria-label="New messages">
                    <div className="h-px flex-1" style={{ background: "#f23f43" }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#f23f43" }}>
                      New messages
                    </span>
                    <div className="h-px flex-1" style={{ background: "#f23f43" }} />
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
                    const { error } = await supabase
                      .from("messages")
                      .delete()
                      .eq("id", message.id)
                    if (error) throw error
                    setMessages((prev) => prev.filter((m) => m.id !== message.id))
                    setAndPersistOutbox((current) => removeOutboxEntry(current, message.id))
                  }}
                  onReaction={async (emoji) => {
                    const existing = message.reactions.find(
                      (r) => r.emoji === emoji && r.user_id === currentUserId
                    )
                    if (existing) {
                      await supabase
                        .from("reactions")
                        .delete()
                        .eq("message_id", message.id)
                        .eq("user_id", currentUserId)
                        .eq("emoji", emoji)
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === message.id
                            ? { ...m, reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.user_id === currentUserId)) }
                            : m
                        )
                      )
                    } else {
                      await supabase.from("reactions").insert({
                        message_id: message.id,
                        user_id: currentUserId,
                        emoji,
                      })
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === message.id
                            ? { ...m, reactions: [...m.reactions, { message_id: message.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }] }
                            : m
                        )
                      )
                    }
                  }}
                />
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {!isAtBottom && pendingNewMessageCount > 0 && (
            <div className="sticky bottom-3 px-4 flex justify-end">
              <button
                onClick={jumpToLatest}
                className="motion-interactive motion-press px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg"
                style={{ background: "#5865f2", color: "white" }}
              >
                Jump to latest {pendingNewMessageCount > 1 ? `(${pendingNewMessageCount})` : ""}
              </button>
            </div>
          )}

          {showReturnToContext && jumpToMessageId && (
            <div className="sticky bottom-14 px-4 flex justify-end">
              <button
                onClick={returnToContext}
                className="motion-interactive motion-press px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: "#2b2d31", color: "#f2f3f5", border: "1px solid #1e1f22" }}
              >
                Back to where you were
              </button>
            </div>
          )}

          <ThreadList
            channelId={channel.id}
            activeThreadId={activeThread?.id ?? null}
            filter={threadFilter}
            onSelectThread={(thread) => {
              setActiveThread(thread)
              setThreadPanelOpen(true)
            }}
          />
        </div>

        {typingUsers.length > 0 && (
          <div className="px-4 py-1 flex items-center gap-1.5 flex-shrink-0" style={{ minHeight: "24px" }}>
            <span className="flex gap-0.5 items-end">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
            <span className="text-xs" style={{ color: "#949ba4" }}>
              {typingUsers.length === 1
                ? `${typingUsers[0].displayName} is typing…`
                : typingUsers.length === 2
                ? `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing…`
                : "Several people are typing…"}
            </span>
          </div>
        )}

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
    </div>
  )
}
