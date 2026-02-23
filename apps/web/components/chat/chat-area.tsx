"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Hash, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { AttachmentRow, ChannelRow, MessageWithAuthor, ThreadRow } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeMessages } from "@/hooks/use-realtime-messages"
import { useTyping } from "@/hooks/use-typing"
import { useToast } from "@/components/ui/use-toast"
import { ThreadPanel } from "@/components/chat/thread-panel"
import { ThreadList } from "@/components/chat/thread-list"
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
}

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === "23505"
}

export function ChatArea({ channel, initialMessages, currentUserId, serverId }: Props) {
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList, currentUser } = useAppStore()
  const [messages, setMessages] = useState<MessageWithAuthor[]>(initialMessages)
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const [activeThread, setActiveThread] = useState<ThreadRow | null>(null)
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])
  const [draft, setDraftState] = useState("")
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine)
  const bottomRef = useRef<HTMLDivElement>(null)
  const outboxRef = useRef<OutboxEntry[]>([])
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef("")
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const { toast } = useToast()
  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"
  const { typingUsers, onKeystroke, onSent } = useTyping(channel.id, currentUserId, currentDisplayName)

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
    setOutbox((current) => {
      const resolved = typeof next === "function" ? next(current) : next
      outboxRef.current = resolved
      saveOutbox(resolved)
      return resolved
    })
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

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

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
    if (draftPersistTimerRef.current) {
      flushDraftNow(channel.id)
      clearTimeout(draftPersistTimerRef.current)
      draftPersistTimerRef.current = null
    }
    return () => {
      if (draftPersistTimerRef.current) {
        flushDraftNow(channel.id)
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

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
      authorId: user.id,
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
        author_id: user.id,
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
          className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
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
          <div className="ml-auto flex items-center">
            <button
              onClick={toggleMemberList}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title={memberListOpen ? "Hide Member List" : "Show Member List"}
            >
              <Users className="w-5 h-5" style={{ color: memberListOpen ? '#f2f3f5' : '#949ba4' }} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
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
                <MessageItem
                  key={message.id}
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
                      .update({ deleted_at: new Date().toISOString() })
                      .eq("id", message.id)
                    if (!error) {
                      setMessages((prev) => prev.filter((m) => m.id !== message.id))
                      setAndPersistOutbox((current) => removeOutboxEntry(current, message.id))
                    }
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
              )
            })}
            <div ref={bottomRef} />
          </div>

          <ThreadList
            channelId={channel.id}
            activeThreadId={activeThread?.id ?? null}
            onSelectThread={(thread) => setActiveThread(thread)}
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

      {activeThread && (
        <ThreadPanel
          thread={activeThread}
          currentUserId={currentUserId}
          onClose={() => setActiveThread(null)}
          onThreadUpdate={(updated) => setActiveThread(updated)}
        />
      )}
    </div>
  )
}
