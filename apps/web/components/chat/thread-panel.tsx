"use client"

import { useEffect, useRef, useState } from "react"
import { X, Hash, Lock, Archive, ArchiveRestore, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { ThreadRow, ThreadWithDetails, MessageWithAuthor, MessageRow } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeThreadMessages } from "@/hooks/use-realtime-threads"
import { cn } from "@/lib/utils/cn"
import { useToast } from "@/components/ui/use-toast"

interface Props {
  thread: ThreadRow
  currentUserId: string
  onClose: () => void
  onThreadUpdate: (thread: ThreadRow) => void
}

export function ThreadPanel({ thread, currentUserId, onClose, onThreadUpdate }: Props) {
  const [messages, setMessages] = useState<MessageWithAuthor[]>([])
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMember, setIsMember] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClientSupabaseClient()
  const { toast } = useToast()

  // Load messages
  useEffect(() => {
    setLoading(true)
    fetch(`/api/threads/${thread.id}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
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
          <div className="px-4 py-6 text-sm text-center" style={{ color: "#949ba4" }}>
            Loading messages…
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
                      .update({ deleted_at: new Date().toISOString() })
                      .eq("id", message.id)
                    if (!error) {
                      setMessages((prev) => prev.filter((m) => m.id !== message.id))
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
                            ? {
                                ...m,
                                reactions: m.reactions.filter(
                                  (r) => !(r.emoji === emoji && r.user_id === currentUserId)
                                ),
                              }
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
                            ? {
                                ...m,
                                reactions: [
                                  ...m.reactions,
                                  {
                                    message_id: message.id,
                                    user_id: currentUserId,
                                    emoji,
                                    created_at: new Date().toISOString(),
                                  },
                                ],
                              }
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
        )}
      </div>

      {/* Input */}
      {canSend ? (
        <MessageInput
          channelName={thread.name}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSendMessage}
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
