"use client"

import { useState } from "react"
import { Megaphone, Users } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { ChannelRow, MessageWithAuthor } from "@/types/database"
import { MessageItem } from "@/components/chat/message-item"
import { MessageInput } from "@/components/chat/message-input"
import { useRealtimeMessages } from "@/hooks/use-realtime-messages"
import { useEffect, useRef } from "react"

interface Props {
  channel: ChannelRow
  initialMessages: MessageWithAuthor[]
  currentUserId: string
  serverId: string
}

export function AnnouncementChannel({ channel, initialMessages, currentUserId, serverId }: Props) {
  const { setActiveServer, setActiveChannel, memberListOpen, toggleMemberList } = useAppStore()
  const [messages, setMessages] = useState<MessageWithAuthor[]>(initialMessages)
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

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

  async function handleSendMessage(content: string, attachmentFiles?: File[]) {
    if (!content.trim() && (!attachmentFiles || attachmentFiles.length === 0)) return

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
        content: content.trim() || null,
        reply_to_id: replyTo?.id || null,
      })
      .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
      .single()

    if (error) { console.error("Failed to send announcement:", error); return }

    if (attachments.length > 0 && message) {
      await supabase.from("attachments").insert(attachments.map((a) => ({ ...a, message_id: message.id })))
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
        <Megaphone className="w-5 h-5 flex-shrink-0" style={{ color: '#f0b132' }} />
        <span className="font-semibold text-white">{channel.name}</span>
        {channel.topic && (
          <>
            <span style={{ color: '#4e5058' }}>|</span>
            <span className="text-sm truncate" style={{ color: '#949ba4' }}>{channel.topic}</span>
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

      {/* Announcement banner */}
      <div
        className="mx-4 mt-3 px-3 py-2 rounded text-sm flex items-center gap-2"
        style={{ background: 'rgba(240,177,50,0.1)', border: '1px solid rgba(240,177,50,0.3)', color: '#f0b132' }}
      >
        <Megaphone className="w-4 h-4 flex-shrink-0" />
        <span>This is an Announcement channel. Members can follow it to receive updates in their own servers.</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="px-4 py-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(240,177,50,0.2)' }}
            >
              <Megaphone className="w-8 h-8" style={{ color: '#f0b132' }} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to #{channel.name}!</h2>
            <p style={{ color: '#b5bac1' }}>
              This is the beginning of the #{channel.name} announcement channel.
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
              new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() < 5 * 60 * 1000

            return (
              <MessageItem
                key={message.id}
                message={message}
                isGrouped={!!isGrouped}
                currentUserId={currentUserId}
                onReply={() => setReplyTo(message)}
                onEdit={async (content) => {
                  const { error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", message.id)
                  if (!error) setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, content, edited_at: new Date().toISOString() } : m))
                }}
                onDelete={async () => {
                  const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", message.id)
                  if (!error) setMessages((prev) => prev.filter((m) => m.id !== message.id))
                }}
                onReaction={async (emoji) => {
                  const existing = message.reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId)
                  if (existing) {
                    await supabase.from("reactions").delete().eq("message_id", message.id).eq("user_id", currentUserId).eq("emoji", emoji)
                    setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.user_id === currentUserId)) } : m))
                  } else {
                    await supabase.from("reactions").insert({ message_id: message.id, user_id: currentUserId, emoji })
                    setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, reactions: [...m.reactions, { message_id: message.id, user_id: currentUserId, emoji, created_at: new Date().toISOString() }] } : m))
                  }
                }}
              />
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Message input */}
      <MessageInput
        channelName={channel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSendMessage}
      />
    </div>
  )
}
