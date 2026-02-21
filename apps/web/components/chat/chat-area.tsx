"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Hash, Pin, ChevronDown } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { ChannelRow, MessageWithAuthor } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRealtimeMessages } from "@/hooks/use-realtime-messages"
import { useTyping } from "@/hooks/use-typing"

interface Props {
  channel: ChannelRow
  initialMessages: MessageWithAuthor[]
  currentUserId: string
  serverId: string
}

// Parse @username mentions and resolve to user IDs
function parseMentions(content: string, members: Array<{ user_id: string; username: string }>) {
  const mentionEveryone = /@everyone|@here/.test(content)
  const mentions: string[] = []
  for (const match of content.matchAll(/@(\w+)/g)) {
    const uname = match[1].toLowerCase()
    if (uname === "everyone" || uname === "here") continue
    const member = members.find((m) => m.username.toLowerCase() === uname)
    if (member && !mentions.includes(member.user_id)) mentions.push(member.user_id)
  }
  return { mentions, mentionEveryone }
}

export function ChatArea({ channel, initialMessages, currentUserId, serverId }: Props) {
  const { setActiveChannel, currentUser } = useAppStore()
  const [messages, setMessages] = useState<MessageWithAuthor[]>(initialMessages)
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const [serverMembers, setServerMembers] = useState<Array<{ user_id: string; username: string }>>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialMessages.length === 50)
  const [showPinned, setShowPinned] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<MessageWithAuthor[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const supabase = createClientSupabaseClient()

  const currentDisplayName = currentUser?.display_name || currentUser?.username || "User"
  const { typingUsers, onKeystroke, onSent } = useTyping(channel.id, currentUserId, currentDisplayName)

  // Load older messages when scrolled to top
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]
    const { data } = await supabase
      .from("messages")
      .select(`*, author:users(*), attachments(*), reactions(*)`)
      .eq("channel_id", channel.id)
      .is("deleted_at", null)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50)
    const older = ((data ?? []) as MessageWithAuthor[]).reverse()
    if (older.length < 50) setHasMore(false)
    if (older.length > 0) {
      // Preserve scroll position
      const container = scrollContainerRef.current
      const prevHeight = container?.scrollHeight ?? 0
      setMessages((prev) => [...older, ...prev])
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight
        }
      })
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, messages, channel.id, supabase])

  // IntersectionObserver to trigger load more when top sentinel is visible
  useEffect(() => {
    const sentinel = topSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreMessages()
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMoreMessages])

  // Fetch pinned messages
  const fetchPinnedMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select(`*, author:users(*), attachments(*), reactions(*)`)
      .eq("channel_id", channel.id)
      .eq("pinned", true)
      .is("deleted_at", null)
      .order("pinned_at", { ascending: false })
    setPinnedMessages((data ?? []) as MessageWithAuthor[])
  }, [channel.id, supabase])

  useEffect(() => {
    if (showPinned) fetchPinnedMessages()
  }, [showPinned, fetchPinnedMessages])

  async function handlePin(message: MessageWithAuthor) {
    const isPinned = (message as any).pinned
    const method = isPinned ? "DELETE" : "PUT"
    const res = await fetch(`/api/messages/${message.id}/pin`, { method })
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, pinned: !isPinned, pinned_at: isPinned ? null : new Date().toISOString(), pinned_by: isPinned ? null : currentUserId } as any
            : m
        )
      )
      if (showPinned) fetchPinnedMessages()
    }
  }

  // Fetch server members for @mention resolution
  useEffect(() => {
    supabase
      .from("server_members")
      .select("user_id, users(username)")
      .eq("server_id", serverId)
      .then(({ data }) => {
        if (data) {
          setServerMembers(
            data.map((m: any) => ({ user_id: m.user_id, username: m.users?.username ?? "" }))
          )
        }
      })
  }, [serverId])

  useEffect(() => {
    setActiveChannel(channel.id)
    return () => setActiveChannel(null)
  }, [channel.id, setActiveChannel])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

  // Realtime subscription (messages + reactions)
  useRealtimeMessages(
    channel.id,
    (newMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev
        return [...prev, newMessage]
      })
    },
    (updatedMessage) => {
      setMessages((prev) =>
        prev.map((m) => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m)
      )
    },
    (reaction, eventType) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.message_id) return m
          if (eventType === "INSERT") {
            // Avoid duplicate
            if (m.reactions.some((r) => r.message_id === reaction.message_id && r.user_id === reaction.user_id && r.emoji === reaction.emoji)) return m
            return { ...m, reactions: [...m.reactions, reaction] }
          } else {
            return { ...m, reactions: m.reactions.filter((r) => !(r.user_id === reaction.user_id && r.emoji === reaction.emoji)) }
          }
        })
      )
    }
  )

  async function handleSendMessage(content: string, attachmentFiles?: File[]) {
    if (!content.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

    // Parse @mention tags from the message content
    const { mentions, mentionEveryone } = parseMentions(content, serverMembers)

    // Upload attachments first
    const attachments: { url: string; filename: string; size: number; content_type: string }[] = []

    if (attachmentFiles?.length) {
      for (const file of attachmentFiles) {
        const path = `${channel.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage
          .from("attachments")
          .upload(path, file)
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

    // Send message via API route (enforces rate limiting + slowmode server-side)
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel.id,
        content: content.trim() || null,
        replyToId: replyTo?.id || null,
        mentions,
        mentionEveryone,
        attachments,
      }),
    })

    if (!res.ok) {
      const { error: errMsg } = await res.json().catch(() => ({ error: "Failed to send" }))
      console.error("Failed to send message:", errMsg)
      // Surface slowmode / rate limit errors to user
      if (res.status === 429) {
        alert(errMsg)
      }
      return
    }

    setReplyTo(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#313338' }}>
      {/* Channel header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: '#1e1f22' }}
      >
        <Hash className="w-5 h-5 flex-shrink-0" style={{ color: '#949ba4' }} />
        <span className="font-semibold text-white">{channel.name}</span>
        {channel.topic && (
          <>
            <span style={{ color: '#4e5058' }}>|</span>
            <span className="text-sm truncate" style={{ color: '#949ba4' }}>
              {channel.topic}
            </span>
          </>
        )}
        <button
          onClick={() => setShowPinned((v) => !v)}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-white/5"
          style={{ color: showPinned ? "#f0b232" : "#949ba4" }}
          title="Pinned Messages"
        >
          <Pin className="w-4 h-4" />
          Pins
        </button>
      </div>

      {/* Pinned messages panel */}
      {showPinned && (
        <div
          className="border-b flex-shrink-0 max-h-64 overflow-y-auto"
          style={{ borderColor: "#1e1f22", background: "#2b2d31" }}
        >
          <div className="px-4 py-2 text-xs font-semibold uppercase flex items-center gap-2" style={{ color: "#f0b232" }}>
            <Pin className="w-3 h-3" />
            Pinned Messages — {pinnedMessages.length}
          </div>
          {pinnedMessages.length === 0 ? (
            <p className="px-4 pb-3 text-sm" style={{ color: "#949ba4" }}>No pinned messages yet</p>
          ) : (
            pinnedMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-2 px-4 py-2 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-white mr-2">
                    {msg.author?.display_name || msg.author?.username}
                  </span>
                  <span className="text-sm truncate" style={{ color: "#b5bac1" }}>{msg.content}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Channel welcome message */}
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

        {/* Top sentinel for infinite scroll */}
        <div ref={topSentinelRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
          </div>
        )}

        {/* Message list */}
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
                canManage={true}
                onReply={() => setReplyTo(message)}
                onPin={() => handlePin(message)}
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
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 pb-1 flex items-center gap-1 text-xs" style={{ color: '#b5bac1', minHeight: '20px' }}>
          <span className="flex gap-0.5 mr-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-current inline-block animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <span className="font-semibold text-white">
            {typingUsers.map((u) => u.displayName).join(", ")}
          </span>
          <span>{typingUsers.length === 1 ? " is" : " are"} typing...</span>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        channelName={channel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSendMessage}
        onTyping={onKeystroke}
        onSent={onSent}
      />
    </div>
  )
}
