"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Send, Phone, Video, Users, X } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils/cn"
import { MobileMenuButton } from "@/components/layout/mobile-nav"

interface User {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
}

interface Message {
  id: string
  content: string
  created_at: string
  edited_at: string | null
  sender_id: string
  sender: User
}

interface Channel {
  id: string
  name: string | null
  is_group: boolean
  owner_id: string | null
  members: User[]
  partner: User | null
}

interface Props {
  channelId: string
  currentUserId: string
}

export function DMChannelArea({ channelId, currentUserId }: Props) {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const [inCall, setInCall] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const supabase = createClientSupabaseClient()

  const loadMessages = useCallback(async (before?: string) => {
    const url = `/api/dm/channels/${channelId}` + (before ? `?before=${encodeURIComponent(before)}` : "")
    const res = await fetch(url)
    if (!res.ok) return
    const data = await res.json()
    setChannel(data.channel)
    if (before) {
      setMessages((prev) => [...(data.messages ?? []), ...prev])
    } else {
      setMessages(data.messages ?? [])
    }
    setHasMore(data.has_more)
  }, [channelId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Scroll to bottom on initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" })
  }, [channelId])

  // Scroll to bottom on new messages (if near bottom)
  useEffect(() => {
    const container = bottomRef.current?.parentElement
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
    if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel(`dm-channel:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `dm_channel_id=eq.${channelId}`,
        },
        (payload) => {
          const msg = payload.new as any
          // Only add if it's from someone else (we already added our own optimistically)
          if (msg.sender_id !== currentUserId) {
            // Fetch with sender info
            supabase
              .from("direct_messages")
              .select("*, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
              .eq("id", msg.id)
              .single()
              .then(({ data }) => {
                if (data) setMessages((prev) => [...prev, data as Message])
              })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [channelId, currentUserId, supabase])

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)
    const text = content.trim()
    setContent("")

    try {
      const res = await fetch(`/api/dm/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
      }
    } catch (e) {
      console.error("Failed to send:", e)
    } finally {
      setSending(false)
    }
  }

  async function loadMore() {
    if (!messages.length || loadingMore) return
    setLoadingMore(true)
    await loadMessages(messages[0].created_at)
    setLoadingMore(false)
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#313338" }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
      </div>
    )
  }

  const displayName = channel.is_group
    ? (channel.name || channel.members.map((m) => m.display_name || m.username).join(", "))
    : (channel.partner?.display_name || channel.partner?.username || "Unknown")
  const partnerInitials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: "#313338" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#1e1f22" }}>
        <MobileMenuButton />
        {channel.is_group ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#5865f2" }}>
            <Users className="w-4 h-4 text-white" />
          </div>
        ) : (
          <Avatar className="w-8 h-8">
            {channel.partner?.avatar_url && <AvatarImage src={channel.partner.avatar_url} />}
            <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "12px" }}>
              {partnerInitials}
            </AvatarFallback>
          </Avatar>
        )}
        <span className="font-semibold text-white flex-1">{displayName}</span>

        {/* Call buttons */}
        <button
          onClick={() => setInCall(true)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "#b5bac1" }}
          title="Start voice call"
        >
          <Phone className="w-4 h-4" />
        </button>
        <button
          onClick={() => setInCall(true)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "#b5bac1" }}
          title="Start video call"
        >
          <Video className="w-4 h-4" />
        </button>
      </div>

      {/* Call overlay */}
      {inCall && (
        <DMCallView
          channelId={channelId}
          currentUserId={currentUserId}
          partner={channel.partner}
          displayName={displayName}
          onHangup={() => setInCall(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs px-3 py-1 rounded transition-colors hover:bg-white/10"
              style={{ color: "#949ba4" }}
            >
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        <div ref={topRef} />

        {/* Welcome message */}
        {!hasMore && messages.length === 0 && (
          <div className="text-center py-16">
            {channel.is_group ? (
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#5865f2" }}>
                <Users className="w-10 h-10 text-white" />
              </div>
            ) : (
              <Avatar className="w-20 h-20 mx-auto mb-4">
                {channel.partner?.avatar_url && <AvatarImage src={channel.partner.avatar_url} />}
                <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "28px" }}>
                  {partnerInitials}
                </AvatarFallback>
              </Avatar>
            )}
            <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
            <p style={{ color: "#b5bac1" }} className="text-sm">
              {channel.is_group
                ? `Welcome to your group DM with ${channel.members.length} members.`
                : `This is the beginning of your DM with ${displayName}.`}
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const isGrouped = prev &&
            prev.sender_id === msg.sender_id &&
            new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
          const isOwn = msg.sender_id === currentUserId
          const senderName = msg.sender?.display_name || msg.sender?.username || "Unknown"
          const senderInitials = senderName.slice(0, 2).toUpperCase()

          return (
            <div key={msg.id} className={cn("flex items-start gap-3", isGrouped ? "pl-11" : "")}>
              {!isGrouped && (
                <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                  {msg.sender?.avatar_url && <AvatarImage src={msg.sender.avatar_url} />}
                  <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "12px" }}>
                    {senderInitials}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                {!isGrouped && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: isOwn ? "#00b0f4" : "white" }}>
                      {isOwn ? "You" : senderName}
                    </span>
                    <span className="text-xs" style={{ color: "#4e5058" }}>
                      {format(new Date(msg.created_at), "h:mm a")}
                    </span>
                  </div>
                )}
                <p className="text-sm break-words" style={{ color: "#dcddde" }}>
                  {msg.content}
                </p>
                {msg.edited_at && (
                  <span className="text-xs" style={{ color: "#4e5058" }}> (edited)</span>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#383a40" }}>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Message ${channel.is_group ? displayName : `@${displayName}`}`}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "#dcddde" }}
          />
          {content.trim() && (
            <button onClick={handleSend} disabled={sending} style={{ color: "#5865f2" }}>
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── DM Call View ───────────────────────────────────────────────────────────

interface CallProps {
  channelId: string
  currentUserId: string
  partner: User | null
  displayName: string
  onHangup: () => void
}

function DMCallView({ channelId, currentUserId, partner, displayName, onHangup }: CallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [status, setStatus] = useState<"connecting" | "connected" | "failed">("connecting")
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    })
    pcRef.current = pc

    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0]
        setStatus("connected")
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        fetch(`/api/dm/channels/${channelId}/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-candidate", payload: e.candidate }),
        })
      }
    }

    // Subscribe to signaling
    const sigChannel = supabase.channel(`dm-call:${channelId}`)
    sigChannel.on("broadcast", { event: "call-signal" }, async ({ payload }: any) => {
      if (payload.fromUserId === currentUserId) return
      if (payload.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.payload))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        fetch(`/api/dm/channels/${channelId}/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", payload: answer }),
        })
      } else if (payload.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.payload))
      } else if (payload.type === "ice-candidate") {
        await pc.addIceCandidate(new RTCIceCandidate(payload.payload))
      } else if (payload.type === "hangup") {
        onHangup()
      }
    }).subscribe()

    // Get local media and create offer
    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(async (stream) => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      fetch(`/api/dm/channels/${channelId}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "offer", payload: offer }),
      })
    }).catch(() => setStatus("failed"))

    return () => {
      pc.close()
      supabase.removeChannel(sigChannel)
    }
  }, [channelId, currentUserId, onHangup, supabase])

  async function hangup() {
    await fetch(`/api/dm/channels/${channelId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hangup" }),
    })
    pcRef.current?.close()
    onHangup()
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center" style={{ background: "#1e1f22" }}>
      <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden bg-black">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 right-3 w-32 rounded-lg border-2 object-cover"
          style={{ borderColor: "#5865f2" }}
        />
        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
            <p className="text-white text-sm">Calling {displayName}…</p>
          </div>
        )}
      </div>
      <button
        onClick={hangup}
        className="mt-6 w-14 h-14 rounded-full flex items-center justify-center transition-colors"
        style={{ background: "#f23f43" }}
        title="Hang up"
      >
        <X className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}
