"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Send, Phone, Video, Users, Paperclip, Pencil, Trash2, PhoneOff, Mic, MicOff, VideoOff } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils/cn"
import { MobileMenuButton } from "@/components/layout/mobile-nav"
import { useToast } from "@/components/ui/use-toast"
import { useTyping } from "@/hooks/use-typing"
import { useAppStore } from "@/lib/stores/app-store"

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
  const [loadError, setLoadError] = useState(false)
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [callWithVideo, setCallWithVideo] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const supabase = createClientSupabaseClient()
  const { toast } = useToast()
  const { currentUser } = useAppStore()

  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"
  const { typingUsers, onKeystroke, onSent } = useTyping(channelId, currentUserId, currentDisplayName)

  const loadMessages = useCallback(async (before?: string) => {
    if (!before) setLoadError(false)
    const url = `/api/dm/channels/${channelId}` + (before ? `?before=${encodeURIComponent(before)}` : "")
    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (!before) setLoadError(true)
        return
      }
      const data = await res.json()
      setChannel(data.channel)
      if (before) {
        setMessages((prev) => [...(data.messages ?? []), ...prev])
      } else {
        setMessages(data.messages ?? [])
      }
      setHasMore(data.has_more)
    } catch {
      if (!before) setLoadError(true)
    }
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
    onSent()

    try {
      const res = await fetch(`/api/dm/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
      } else {
        // Restore so user can retry
        setContent(text)
        toast({
          variant: "destructive",
          title: "Failed to send message",
          description: "Your message could not be delivered. Please try again.",
        })
      }
    } catch {
      setContent(text)
      toast({
        variant: "destructive",
        title: "Connection error",
        description: "Check your internet connection and try again.",
      })
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

  async function handleEditSave(messageId: string) {
    if (!editContent.trim()) return
    const res = await fetch(`/api/dm/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim() }),
    })
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: editContent.trim(), edited_at: new Date().toISOString() } : m)
      )
    } else {
      toast({ variant: "destructive", title: "Failed to edit message" })
    }
    setEditingId(null)
  }

  async function handleDelete(messageId: string) {
    const res = await fetch(`/api/dm/channels/${channelId}/messages/${messageId}`, { method: "DELETE" })
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } else {
      toast({ variant: "destructive", title: "Failed to delete message" })
    }
  }

  async function handleFileUpload(file: File) {
    if (!file) return
    setUploadingFile(true)
    try {
      const ext = file.name.split(".").pop()
      const path = `dm-attachments/${channelId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path)
      const fileContent = `[${file.name}](${publicUrl})`
      const res = await fetch(`/api/dm/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
      } else {
        toast({ variant: "destructive", title: "Failed to send file" })
      }
    } catch {
      toast({ variant: "destructive", title: "File upload failed", description: "The file could not be uploaded." })
    } finally {
      setUploadingFile(false)
    }
  }

  function startVoiceCall() {
    setCallWithVideo(false)
    setInCall(true)
  }

  function startVideoCall() {
    setCallWithVideo(true)
    setInCall(true)
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: "#313338" }}>
        <p className="text-sm" style={{ color: "#949ba4" }}>Failed to load conversation.</p>
        <button
          onClick={() => loadMessages()}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "#5865f2", color: "white" }}
        >
          Retry
        </button>
      </div>
    )
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

        {/* Call buttons — voice-only vs video differentiated */}
        {!channel.is_group && (
          <>
            <button
              onClick={startVoiceCall}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: (inCall && !callWithVideo) ? "#23a55a" : "#b5bac1" }}
              title="Start voice call"
              disabled={inCall}
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={startVideoCall}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: (inCall && callWithVideo) ? "#23a55a" : "#b5bac1" }}
              title="Start video call"
              disabled={inCall}
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Call overlay */}
      {inCall && (
        <DMCallView
          channelId={channelId}
          currentUserId={currentUserId}
          partner={channel.partner}
          displayName={displayName}
          withVideo={callWithVideo}
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
          const isEditing = editingId === msg.id

          // Render image attachments inline (markdown-style links to images)
          const imageMatch = msg.content?.match(/^\[(.+)\]\((https?:\/\/.+)\)$/)

          return (
            <div key={msg.id} className={cn("group flex items-start gap-3 hover:bg-white/[0.02] rounded px-1 -mx-1", isGrouped ? "pl-11" : "")}>
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
                {isEditing ? (
                  <div className="flex gap-2 items-center">
                    <input
                      autoFocus
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) handleEditSave(msg.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="flex-1 bg-transparent border-b text-sm focus:outline-none"
                      style={{ color: "#dcddde", borderColor: "#5865f2" }}
                    />
                    <button onClick={() => handleEditSave(msg.id)} className="text-xs px-2 py-0.5 rounded" style={{ background: "#5865f2", color: "white" }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs" style={{ color: "#949ba4" }}>Cancel</button>
                  </div>
                ) : imageMatch ? (
                  <div className="mt-1">
                    <a href={imageMatch[2]} target="_blank" rel="noopener noreferrer">
                      <img
                        src={imageMatch[2]}
                        alt={imageMatch[1]}
                        className="max-w-xs max-h-60 rounded object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                    </a>
                    <span className="text-xs" style={{ color: "#949ba4" }}>{imageMatch[1]}</span>
                  </div>
                ) : (
                  <p className="text-sm break-words" style={{ color: "#dcddde" }}>
                    {msg.content}
                  </p>
                )}
                {msg.edited_at && !isEditing && (
                  <span className="text-xs" style={{ color: "#4e5058" }}> (edited)</span>
                )}
              </div>
              {/* Hover actions — own messages only */}
              {isOwn && !isEditing && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 transition-opacity">
                  <button
                    onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
                    style={{ color: "#949ba4" }}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(msg.id)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20"
                    style={{ color: "#949ba4" }}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
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

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#383a40" }}>
          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="flex-shrink-0 transition-colors hover:text-white"
            style={{ color: "#949ba4" }}
            title="Attach file"
          >
            {uploadingFile
              ? <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
              : <Paperclip className="w-5 h-5" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.zip,.mp4,.webm"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = "" }}
          />

          <input
            type="text"
            value={content}
            onChange={(e) => { setContent(e.target.value); if (e.target.value) onKeystroke() }}
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
  withVideo: boolean
  onHangup: () => void
}

function DMCallView({ channelId, currentUserId, partner, displayName, withVideo, onHangup }: CallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const sigChannelRef = useRef<any>(null)
  const clientId = useRef(crypto.randomUUID())
  const [status, setStatus] = useState<"connecting" | "connected" | "failed">("connecting")
  const [failReason, setFailReason] = useState("")
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const supabase = createClientSupabaseClient()

  function buildIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]
    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL
    const turnsUrl = process.env.NEXT_PUBLIC_TURNS_URL
    const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME
    const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    if (turnUrl && turnUser && turnCred) {
      servers.push({ urls: [turnUrl, ...(turnsUrl ? [turnsUrl] : [])], username: turnUser, credential: turnCred })
    }
    return servers
  }

  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() })
    pcRef.current = pc

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
      setStatus("connected")
    }

    const sigChannel = supabase.channel(`dm-call:${channelId}`)
    sigChannelRef.current = sigChannel

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sigChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "ice-candidate", candidate, from: clientId.current } })
      }
    }

    sigChannel.on("broadcast", { event: "call-signal" }, async ({ payload }: any) => {
      if (payload.from === clientId.current) return
      try {
        if (payload.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer ?? payload.payload))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sigChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "answer", answer, from: clientId.current } })
        } else if (payload.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer ?? payload.payload))
        } else if (payload.type === "ice-candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate ?? payload.payload))
        } else if (payload.type === "hangup") {
          onHangup()
        }
      } catch (err) {
        console.error("WebRTC signal handling failed:", err)
        setStatus("failed")
      }
    })

    sigChannel.subscribe(async () => {
      try {
        // Request audio always; video only for video calls
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: withVideo,
        })
        localStreamRef.current = stream
        if (withVideo && localVideoRef.current) localVideoRef.current.srcObject = stream
        stream.getTracks().forEach((t) => pc.addTrack(t, stream))

        sigChannel.send({ type: "broadcast", event: "call-invite", payload: { callerId: currentUserId, withVideo } })

        pc.onnegotiationneeded = async () => {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          sigChannel.send({ type: "broadcast", event: "call-signal", payload: { type: "offer", offer, from: clientId.current } })
        }
      } catch (err: any) {
        setStatus("failed")
        if (err?.name === "NotAllowedError") {
          setFailReason("Permission denied. Allow microphone" + (withVideo ? " and camera" : "") + " access and retry.")
        } else if (err?.name === "NotFoundError") {
          setFailReason("No " + (withVideo ? "camera or " : "") + "microphone found.")
        } else {
          setFailReason("Could not access media devices.")
        }
      }
    })

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      pc.close()
      supabase.removeChannel(sigChannel)
      sigChannelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, currentUserId, withVideo])

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted })
    setMuted((m) => !m)
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = videoOff })
    setVideoOff((v) => !v)
  }

  async function hangup() {
    if (sigChannelRef.current) {
      await sigChannelRef.current.send({ type: "broadcast", event: "call-signal", payload: { type: "hangup", from: clientId.current } })
      supabase.removeChannel(sigChannelRef.current)
      sigChannelRef.current = null
    }
    pcRef.current?.close()
    onHangup()
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center" style={{ background: "#1e1f22" }}>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Video area (video calls only) */}
      {withVideo ? (
        <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden bg-black">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-32 rounded-lg border-2 object-cover"
            style={{ borderColor: "#5865f2", transform: "scaleX(-1)" }}
          />
          {status === "connecting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(0,0,0,0.6)" }}>
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
              <p className="text-white text-sm">Video calling {displayName}…</p>
            </div>
          )}
          {status === "failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
              <p className="text-white font-medium">Call failed</p>
              <p className="text-sm text-center" style={{ color: "#949ba4" }}>{failReason}</p>
            </div>
          )}
        </div>
      ) : (
        /* Voice-only UI: show avatar */
        <div className="flex flex-col items-center gap-4 pb-8">
          <div
            className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center overflow-hidden",
              status === "connected" ? "ring-4 ring-green-500" : ""
            )}
            style={{ background: "#5865f2" }}
          >
            {partner?.avatar_url ? (
              <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-4xl">{displayName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <p className="text-white font-semibold text-lg">{displayName}</p>
          {status === "connecting" && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "#b5bac1" }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
              Calling…
            </div>
          )}
          {status === "connected" && (
            <p className="text-sm font-medium" style={{ color: "#23a55a" }}>Connected</p>
          )}
          {status === "failed" && (
            <p className="text-sm text-center max-w-xs" style={{ color: "#f23f43" }}>{failReason}</p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={toggleMute}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
          style={{ background: muted ? "#f23f43" : "#4e5058" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
        </button>
        {withVideo && (
          <button
            onClick={toggleVideo}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
            style={{ background: videoOff ? "#f23f43" : "#4e5058" }}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? <VideoOff className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-white" />}
          </button>
        )}
        <button
          onClick={hangup}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "#f23f43" }}
          title="Hang up"
        >
          <PhoneOff className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  )
}
