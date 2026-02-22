"use client"

import { useState, useEffect, useRef } from "react"
import { MessageSquare, Plus, ArrowLeft, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { ChannelRow, MessageWithAuthor } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeMessages } from "@/hooks/use-realtime-messages"

interface Props {
  channel: ChannelRow
  initialMessages: MessageWithAuthor[]
  currentUserId: string
  serverId: string
}

type ForumView = "list" | "thread"

export function ForumChannel({ channel, initialMessages, currentUserId, serverId }: Props) {
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList } = useAppStore()
  const [messages, setMessages] = useState<MessageWithAuthor[]>(initialMessages)
  const [view, setView] = useState<ForumView>("list")
  const [activeThread, setActiveThread] = useState<MessageWithAuthor | null>(null)
  const [newPostTitle, setNewPostTitle] = useState("")
  const [showNewPost, setShowNewPost] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithAuthor | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    setActiveServer(serverId)
    setActiveChannel(channel.id)
    return () => {
      setActiveServer(null)
      setActiveChannel(null)
    }
  }, [serverId, channel.id, setActiveServer, setActiveChannel])

  useEffect(() => {
    if (view === "thread") bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, view])

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

  async function handleCreatePost(content: string, attachmentFiles?: File[]) {
    if (!content.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const attachments: { url: string; filename: string; size: number; content_type: string }[] = []
    if (attachmentFiles?.length) {
      for (const file of attachmentFiles) {
        const path = `${channel.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from("attachments").upload(path, file)
        if (!error) {
          const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 3600 * 24 * 7)
          if (signed) {
            attachments.push({ url: signed.signedUrl, filename: file.name, size: file.size, content_type: file.type })
          }
        }
      }
    }

    const postContent = newPostTitle.trim()
      ? `**${newPostTitle.trim()}**\n\n${content.trim()}`
      : content.trim()

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channel.id,
        author_id: user.id,
        content: postContent,
        reply_to_id: replyTo?.id || null,
      })
      .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
      .single()

    if (error) { console.error("Failed to create forum post:", error); return }

    if (attachments.length > 0 && message) {
      await supabase.from("attachments").insert(attachments.map((a) => ({ ...a, message_id: message.id })))
    }

    setNewPostTitle("")
    setShowNewPost(false)
    setReplyTo(null)

    // Update last_post_at for the forum channel
    await supabase.from("channels").update({ last_post_at: new Date().toISOString() }).eq("id", channel.id)
  }

  async function handleThreadReply(content: string, attachmentFiles?: File[]) {
    if (!content.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const attachments: { url: string; filename: string; size: number; content_type: string }[] = []
    if (attachmentFiles?.length) {
      for (const file of attachmentFiles) {
        const path = `${channel.id}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from("attachments").upload(path, file)
        if (!error) {
          const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 3600 * 24 * 7)
          if (signed) {
            attachments.push({ url: signed.signedUrl, filename: file.name, size: file.size, content_type: file.type })
          }
        }
      }
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channel.id,
        author_id: user.id,
        content: content.trim(),
        reply_to_id: activeThread?.id || null,
      })
      .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
      .single()

    if (error) { console.error("Failed to reply:", error); return }

    if (attachments.length > 0 && message) {
      await supabase.from("attachments").insert(attachments.map((a) => ({ ...a, message_id: message.id })))
    }

    setReplyTo(null)

    // Update last_post_at
    await supabase.from("channels").update({ last_post_at: new Date().toISOString() }).eq("id", channel.id)
  }

  // Top-level posts: messages not replying to another message
  const topLevelPosts = messages.filter((m) => !m.reply_to_id)

  // Replies to the active thread post
  const threadReplies = activeThread
    ? messages.filter((m) => m.reply_to_id === activeThread.id)
    : []

  if (view === "thread" && activeThread) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#313338' }}>
        {/* Thread header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: '#1e1f22' }}
        >
          <button
            onClick={() => { setView("list"); setActiveThread(null) }}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <MessageSquare className="w-5 h-5 flex-shrink-0" style={{ color: '#949ba4' }} />
          <span className="font-semibold text-white truncate">
            {activeThread.content?.split("\n")[0].replace(/\*\*/g, "") ?? "Thread"}
          </span>
          <div className="ml-auto flex items-center">
            <button onClick={toggleMemberList} className="p-1.5 rounded hover:bg-white/10 transition-colors">
              <Users className="w-5 h-5" style={{ color: memberListOpen ? '#f2f3f5' : '#949ba4' }} />
            </button>
          </div>
        </div>

        {/* Original post */}
        <div className="overflow-y-auto flex-1">
          <div className="border-b pb-2" style={{ borderColor: '#1e1f22' }}>
            <MessageItem
              message={activeThread}
              isGrouped={false}
              currentUserId={currentUserId}
              onReply={() => {}}
              onEdit={async (content) => {
                const { error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", activeThread.id)
                if (!error) setMessages((prev) => prev.map((m) => m.id === activeThread.id ? { ...m, content, edited_at: new Date().toISOString() } : m))
              }}
              onDelete={async () => {
                const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", activeThread.id)
                if (!error) { setMessages((prev) => prev.filter((m) => m.id !== activeThread.id)); setView("list"); setActiveThread(null) }
              }}
              onReaction={async (emoji) => {
                const existing = activeThread.reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId)
                if (existing) {
                  await supabase.from("reactions").delete().eq("message_id", activeThread.id).eq("user_id", currentUserId).eq("emoji", emoji)
                  setMessages((prev) => prev.map((m) => m.id === activeThread.id ? { ...m, reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.user_id === currentUserId)) } : m))
                } else {
                  await supabase.from("reactions").insert({ message_id: activeThread.id, user_id: currentUserId, emoji })
                  setMessages((prev) => prev.map((m) => m.id === activeThread.id ? { ...m, reactions: [...m.reactions, { message_id: activeThread.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }] } : m))
                }
              }}
            />
          </div>

          {/* Thread replies */}
          <div className="pb-4">
            {threadReplies.length === 0 && (
              <p className="px-4 py-4 text-sm" style={{ color: '#949ba4' }}>No replies yet. Be the first to reply!</p>
            )}
            {threadReplies.map((reply, i) => {
              const prev = threadReplies[i - 1]
              const isGrouped = prev && prev.author_id === reply.author_id &&
                new Date(reply.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
              return (
                <MessageItem
                  key={reply.id}
                  message={reply}
                  isGrouped={!!isGrouped}
                  currentUserId={currentUserId}
                  onReply={() => setReplyTo(reply)}
                  onEdit={async (content) => {
                    const { error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", reply.id)
                    if (!error) setMessages((prev) => prev.map((m) => m.id === reply.id ? { ...m, content, edited_at: new Date().toISOString() } : m))
                  }}
                  onDelete={async () => {
                    const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", reply.id)
                    if (!error) setMessages((prev) => prev.filter((m) => m.id !== reply.id))
                  }}
                  onReaction={async (emoji) => {
                    const existing = reply.reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId)
                    if (existing) {
                      await supabase.from("reactions").delete().eq("message_id", reply.id).eq("user_id", currentUserId).eq("emoji", emoji)
                      setMessages((prev) => prev.map((m) => m.id === reply.id ? { ...m, reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.user_id === currentUserId)) } : m))
                    } else {
                      await supabase.from("reactions").insert({ message_id: reply.id, user_id: currentUserId, emoji })
                      setMessages((prev) => prev.map((m) => m.id === reply.id ? { ...m, reactions: [...m.reactions, { message_id: reply.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }] } : m))
                    }
                  }}
                />
              )
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Reply input */}
        <MessageInput
          channelName={`Reply in thread`}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleThreadReply}
        />
      </div>
    )
  }

  // Forum post list view
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#313338' }}>
      {/* Forum header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: '#1e1f22' }}
      >
        <MessageSquare className="w-5 h-5 flex-shrink-0" style={{ color: '#949ba4' }} />
        <span className="font-semibold text-white">{channel.name}</span>
        {channel.topic && (
          <>
            <span style={{ color: '#4e5058' }}>|</span>
            <span className="text-sm truncate" style={{ color: '#949ba4' }}>{channel.topic}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowNewPost(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={{ background: '#5865f2', color: 'white' }}
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
          <button onClick={toggleMemberList} className="p-1.5 rounded hover:bg-white/10 transition-colors">
            <Users className="w-5 h-5" style={{ color: memberListOpen ? '#f2f3f5' : '#949ba4' }} />
          </button>
        </div>
      </div>

      {/* Guidelines banner */}
      {channel.forum_guidelines && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded text-sm"
          style={{ background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.3)', color: '#b5bac1' }}
        >
          <strong className="text-white">Guidelines: </strong>{channel.forum_guidelines}
        </div>
      )}

      {/* New post form */}
      {showNewPost && (
        <div
          className="mx-4 mt-3 p-3 rounded border"
          style={{ background: '#2b2d31', borderColor: '#1e1f22' }}
        >
          <input
            value={newPostTitle}
            onChange={(e) => setNewPostTitle(e.target.value)}
            placeholder="Post title (optional)"
            className="w-full px-3 py-2 mb-2 rounded text-sm text-white focus:outline-none"
            style={{ background: '#1e1f22' }}
          />
          <MessageInput
            channelName="new post content"
            replyTo={null}
            onCancelReply={() => {}}
            onSend={handleCreatePost}
          />
          <button
            onClick={() => { setShowNewPost(false); setNewPostTitle("") }}
            className="mt-1 text-xs"
            style={{ color: '#949ba4' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Post list */}
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-2">
        {topLevelPosts.length === 0 && !showNewPost && (
          <div className="text-center py-12">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto"
              style={{ background: '#4e5058' }}
            >
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No posts yet</h2>
            <p className="mb-4" style={{ color: '#b5bac1' }}>
              {channel.forum_guidelines || "Be the first to start a discussion!"}
            </p>
            <button
              onClick={() => setShowNewPost(true)}
              className="px-4 py-2 rounded font-medium transition-colors"
              style={{ background: '#5865f2', color: 'white' }}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Create First Post
            </button>
          </div>
        )}

        {topLevelPosts.map((post) => {
          const replyCount = messages.filter((m) => m.reply_to_id === post.id).length
          const firstLine = post.content?.split("\n")[0] ?? ""
          const isTitle = firstLine.startsWith("**") && firstLine.endsWith("**")
          const title = isTitle ? firstLine.replace(/\*\*/g, "") : null
          const body = isTitle ? post.content?.slice(firstLine.length).trim() : post.content

          return (
            <button
              key={post.id}
              onClick={() => { setActiveThread(post); setView("thread") }}
              className="w-full text-left p-3 rounded border transition-colors hover:bg-white/5"
              style={{ background: '#2b2d31', borderColor: '#1e1f22' }}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#949ba4' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white text-sm truncate">
                      {title ?? (post.content?.slice(0, 80) ?? "Untitled post")}
                      {!title && (post.content?.length ?? 0) > 80 ? "…" : ""}
                    </span>
                  </div>
                  {title && body && (
                    <p className="text-xs truncate" style={{ color: '#949ba4' }}>
                      {body.slice(0, 120)}{body.length > 120 ? "…" : ""}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: '#6d6f78' }}>
                    <span>{post.author.display_name ?? post.author.username}</span>
                    <span>·</span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
