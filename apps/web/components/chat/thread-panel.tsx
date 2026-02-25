"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Hash, Lock, Archive, ArchiveRestore, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { sendReactionMutation } from "@/lib/reactions-client"
import type { ThreadRow, ThreadWithDetails, MessageWithAuthor, MessageRow } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeThreadMessages } from "@/hooks/use-realtime-threads"
import { cn } from "@/lib/utils/cn"
import { useToast } from "@/components/ui/use-toast"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  thread: ThreadRow
  currentUserId: string
  onClose: () => void
  onThreadUpdate: (thread: ThreadRow) => void
  focusMessageId?: string | null
}

/** Slide-out panel displaying a thread's messages with real-time updates, archive/lock controls, and member management. */
export function ThreadPanel({ thread, currentUserId, onClose, onThreadUpdate, focusMessageId }: Props) {
  const [messages, setMessages] = useState<MessageWithAuthor[]>([])
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const [draft, setDraftContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [isMember, setIsMember] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const handledFocusRef = useRef<string | null>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const { toast } = useToast()

  // Load messages
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/threads/${thread.id}/messages`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (Array.isArray(data)) setMessages(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [thread.id])

  // Check membership
  useEffect(() => {
    supabase
      .from("thread_members")
      .select("user_id")
      .eq("thread_id", thread.id)
      .eq("user_id", currentUserId)
      .single()
      .then(({ data }) => setIsMember(!!data))
  }, [thread.id, currentUserId])

  // Scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Initial scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [loading])

  useEffect(() => {
    if (!focusMessageId) {
      handledFocusRef.current = null
      return
    }
    if (handledFocusRef.current === focusMessageId || loading) return

    const target = document.getElementById(`message-${focusMessageId}`)
    if (!target) return

    target.scrollIntoView({ block: "center", behavior: "smooth" })
    target.classList.add("ring-2", "ring-indigo-400/70", "rounded-md")
    handledFocusRef.current = focusMessageId

    const timer = window.setTimeout(() => {
      target.classList.remove("ring-2", "ring-indigo-400/70", "rounded-md")
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [focusMessageId, loading])

  useEffect(() => {
    setDraftContent("")
    handledFocusRef.current = null
  }, [thread.id])

  // Realtime
  useRealtimeThreadMessages(
    thread.id,
    (newMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev
        return [...prev, newMessage]
      })
    },
    (updatedMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m))
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

  async function handleJoin() {
    const res = await fetch(`/api/threads/${thread.id}/members`, { method: "POST" })
    if (res.ok) {
      setIsMember(true)
      toast({ title: "Joined thread" })
    }
  }

  async function handleLeave() {
    const res = await fetch(`/api/threads/${thread.id}/members`, { method: "DELETE" })
    if (res.ok) {
      setIsMember(false)
      toast({ title: "Left thread" })
    }
  }

  async function handleArchive() {
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !thread.archived }),
    })
    if (res.ok) {
      const updated = await res.json()
      onThreadUpdate(updated)
      toast({ title: thread.archived ? "Thread unarchived" : "Thread archived" })
    }
  }

  async function handleLock() {
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !thread.locked }),
    })
    if (res.ok) {
      const updated = await res.json()
      onThreadUpdate(updated)
      toast({ title: thread.locked ? "Thread unlocked" : "Thread locked" })
    }
  }

  async function handleSendMessage(content: string, attachmentFiles?: File[]) {
    if (!content.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    const attachments: { url: string; filename: string; size: number; content_type: string }[] = []

    if (attachmentFiles?.length) {
      for (const file of attachmentFiles) {
        const path = `threads/${thread.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from("attachments").upload(path, file)
        if (!error) {
          const { data: signed } = await supabase.storage
            .from("attachments")
            .createSignedUrl(path, 3600 * 24 * 7)
          if (signed) {
            attachments.push({
              url: signed.signedUrl,
              filename: file.name,
              size: file.size,
              content_type: file.type,
            })
          }
        }
      }
    }

    const res = await fetch(`/api/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.trim() || undefined,
        replyToId: replyTo?.id,
        attachments,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      toast({ variant: "destructive", title: "Failed to send", description: error })
      return
    }

    const message = await res.json()
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message]
    })
    setReplyTo(null)
    setDraftContent("")

    if (!isMember) setIsMember(true)
  }

  const canSend = !thread.locked && !thread.archived

  return (
    <div
      className="flex flex-col w-80 flex-shrink-0 border-l"
      style={{ background: "#313338", borderColor: "#1e1f22" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-3 border-b flex-shrink-0"
        style={{ borderColor: "#1e1f22" }}
      >
        <Hash className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} />
        <span className="font-semibold text-white text-sm truncate flex-1">{thread.name}</span>
        <div className="flex items-center gap-1 ml-auto">
          {thread.owner_id === currentUserId && (
            <>
              <button
                onClick={handleArchive}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: "#949ba4" }}
                title={thread.archived ? "Unarchive thread" : "Archive thread"}
              >
                {thread.archived ? (
                  <ArchiveRestore className="w-4 h-4" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleLock}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: thread.locked ? "#f23f43" : "#949ba4" }}
                title={thread.locked ? "Unlock thread" : "Lock thread"}
              >
                <Lock className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={isMember ? handleLeave : handleJoin}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: isMember ? "#5865f2" : "#949ba4" }}
            title={isMember ? "Leave thread" : "Join thread"}
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: "#949ba4" }}
            title="Close thread"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status badges */}
      {(thread.archived || thread.locked) && (
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#2b2d31" }}>
          {thread.archived && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: "#ed9c28", color: "#fff" }}
            >
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
          {thread.locked && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: "#f23f43", color: "#fff" }}
            >
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-4 px-3 py-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: "#949ba4" }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="pb-4">
            {messages.map((message, i) => {
              const prevMessage = messages[i - 1]
              const isGrouped =
                prevMessage &&
                prevMessage.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(prevMessage.created_at).getTime() <
                  5 * 60 * 1000

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isGrouped={!!isGrouped}
                  currentUserId={currentUserId}
                  onReply={() => setReplyTo(message)}
                  onEdit={async (content) => {
                    const { error } = await supabase
                      .from("messages")
                      .update({ content, edited_at: new Date().toISOString() })
                      .eq("id", message.id)
                    if (!error) {
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === message.id
                            ? { ...m, content, edited_at: new Date().toISOString() }
                            : m
                        )
                      )
                    }
                  }}
                  onDelete={async () => {
                    const { error } = await supabase
                      .from("messages")
                      .delete()
                      .eq("id", message.id)
                    if (!error) {
                      setMessages((prev) => prev.filter((m) => m.id !== message.id))
                    }
                  }}
                  onReaction={async (emoji) => {
                    const previousReactions = message.reactions
                    const existing = message.reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId)
                    const remove = Boolean(existing)
                    setMessages((prev) =>
                      prev.map((m) => {
                        if (m.id !== message.id) return m
                        const hasOwnReaction = m.reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                        return {
                          ...m,
                          reactions: remove
                            ? m.reactions.filter((r) => !(r.user_id === currentUserId && r.emoji === emoji))
                            : hasOwnReaction
                              ? m.reactions
                              : [...m.reactions, { message_id: message.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }],
                        }
                      })
                    )
                    try {
                      await sendReactionMutation({ messageId: message.id, emoji, remove, nonce: crypto.randomUUID() })
                    } catch {
                      setMessages((prev) =>
                        prev.map((m) => (m.id === message.id ? { ...m, reactions: previousReactions } : m))
                      )
                    }
                  }}                />
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {canSend ? (
        <MessageInput
          channelName={thread.name}
          draft={draft}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSendMessage}
          onDraftChange={setDraftContent}
        />
      ) : (
        <div
          className="px-4 py-3 text-sm text-center flex-shrink-0"
          style={{ color: "#949ba4", background: "#2b2d31", borderTop: "1px solid #1e1f22" }}
        >
          {thread.locked ? "This thread is locked." : "This thread is archived."}
        </div>
      )}
    </div>
  )
}
