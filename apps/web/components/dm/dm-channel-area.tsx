"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Send, Phone, Video, Users, Paperclip, Pencil, Trash2, PhoneOff, Mic, MicOff, VideoOff, Search, Pin, SmilePlus, Reply, X } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils/cn"
import { useCallMediaToggles } from "@/lib/webrtc/use-call-media-toggles"
import { MobileMenuButton } from "@/components/layout/mobile-nav"
import { useToast } from "@/components/ui/use-toast"
import { useTyping } from "@/hooks/use-typing"
import { useAppStore } from "@/lib/stores/app-store"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { useShallow } from "zustand/react/shallow"
import { decryptDmContent, encryptDmContent, exportPublicKey, fingerprintFromPublicKey, generateConversationKey, generateDeviceKeyPair, importPublicKey, parseEncryptedEnvelope, unwrapConversationKey, wrapConversationKey } from "@/lib/dm-encryption"
import { useNotificationSound } from "@/hooks/use-notification-sound"

interface User {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
}

interface ReplyToMessage {
  id: string
  content: string | null
  sender_id: string
  sender: User
}

interface Message {
  id: string
  content: string
  created_at: string
  edited_at: string | null
  sender_id: string
  sender: User
  reply_to_id: string | null
  reply_to: ReplyToMessage | null
}

interface Channel {
  id: string
  name: string | null
  is_group: boolean
  owner_id: string | null
  is_encrypted?: boolean
  encryption_key_version?: number
  members: User[]
  partner: User | null
}

interface Props {
  channelId: string
  currentUserId: string
}


const DEVICE_STORAGE_KEY = "dm-device-key-v1"
const DEVICE_KEY_DB = "vortexchat-e2ee"
const DEVICE_KEY_STORE = "device-private-keys"
const CONVERSATION_KEY_STORE = "conversation-keys"
const registeredDeviceKeys = new Set<string>()

function openDeviceKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEVICE_KEY_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        db.createObjectStore(DEVICE_KEY_STORE)
      }
      if (!db.objectStoreNames.contains(CONVERSATION_KEY_STORE)) {
        db.createObjectStore(CONVERSATION_KEY_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putDevicePrivateKey(deviceId: string, privateKey: CryptoKey) {
  const db = await openDeviceKeyDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, "readwrite")
    tx.objectStore(DEVICE_KEY_STORE).put(privateKey, deviceId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getDevicePrivateKey(deviceId: string): Promise<CryptoKey | null> {
  const db = await openDeviceKeyDb()
  const key = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, "readonly")
    const req = tx.objectStore(DEVICE_KEY_STORE).get(deviceId)
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return key
}

async function putConversationKey(cacheKey: string, keyBytes: Uint8Array) {
  const db = await openDeviceKeyDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONVERSATION_KEY_STORE, "readwrite")
    tx.objectStore(CONVERSATION_KEY_STORE).put(keyBytes, cacheKey)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getConversationKey(cacheKey: string): Promise<Uint8Array | null> {
  const db = await openDeviceKeyDb()
  const value = await new Promise<Uint8Array | null>((resolve, reject) => {
    const tx = db.transaction(CONVERSATION_KEY_STORE, "readonly")
    const req = tx.objectStore(CONVERSATION_KEY_STORE).get(cacheKey)
    req.onsuccess = () => {
      const result = req.result
      if (result instanceof Uint8Array) return resolve(result)
      if (result instanceof ArrayBuffer) return resolve(new Uint8Array(result))
      resolve(null)
    }
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

/** Channel-based DM view with message history, file uploads, voice/video calling, typing indicators, and real-time updates. */
export function DMChannelArea({ channelId, currentUserId }: Props) {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [content, setContent] = useState("")
  const [decryptedContent, setDecryptedContent] = useState<Record<string, { text: string; failed: boolean }>>({})
  const decryptedRef = useRef<Record<string, { text: string; failed: boolean }>>({})
  const [conversationKey, setConversationKey] = useState<Uint8Array | null>(null)
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [callWithVideo, setCallWithVideo] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [uploadingFile, setUploadingFile] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const { toast } = useToast()
  const { currentUser } = useAppStore(
    useShallow((s) => ({ currentUser: s.currentUser }))
  )

  const { playNotification } = useNotificationSound()

  const currentDisplayName = currentUser?.display_name || currentUser?.username || "Unknown"

  const sendDmPayload = useCallback(async (payload: { content: string; reply_to_id?: string }) => {
    const res = await fetch(`/api/dm/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return await res.json()
  }, [channelId])

  const syncDeviceRegistration = useCallback(async (deviceId: string, publicKey: string) => {
    const registrationKey = `${currentUserId}:${deviceId}:${publicKey}`
    if (registeredDeviceKeys.has(registrationKey)) return

    const res = await fetch("/api/dm/keys/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, publicKey }),
    })
    if (!res.ok) {
      throw new Error("Failed to register device key")
    }

    registeredDeviceKeys.add(registrationKey)
  }, [currentUserId])

  const ensureDeviceIdentity = useCallback(async () => {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { deviceId?: string; publicKey?: string }
        if (typeof parsed.deviceId === "string" && parsed.deviceId && typeof parsed.publicKey === "string" && parsed.publicKey) {
          const privateKey = await getDevicePrivateKey(parsed.deviceId)
          if (privateKey) {
            await syncDeviceRegistration(parsed.deviceId, parsed.publicKey)
            setDeviceId(parsed.deviceId)
            setDeviceFingerprint(await fingerprintFromPublicKey(parsed.publicKey))
            return { deviceId: parsed.deviceId, publicKey: parsed.publicKey, privateKey }
          }
        }
        localStorage.removeItem(DEVICE_STORAGE_KEY)
      } catch {
        localStorage.removeItem(DEVICE_STORAGE_KEY)
      }
    }

    const pair = await generateDeviceKeyPair()
    const publicKey = await exportPublicKey(pair.publicKey)
    const privateKey = pair.privateKey
    const newDeviceId = crypto.randomUUID()

    await putDevicePrivateKey(newDeviceId, privateKey)
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ deviceId: newDeviceId, publicKey }))

    setDeviceId(newDeviceId)
    setDeviceFingerprint(await fingerprintFromPublicKey(publicKey))

    await syncDeviceRegistration(newDeviceId, publicKey)

    return { deviceId: newDeviceId, publicKey, privateKey }
  }, [syncDeviceRegistration])

  const ensureConversationKey = useCallback(async (channelInfo: Channel) => {
    if (!channelInfo?.is_encrypted) {
      setConversationKey(null)
      return null
    }

    const identity = await ensureDeviceIdentity()
    const version = channelInfo.encryption_key_version ?? 1
    const cacheKey = `dm-conversation-key:${channelInfo.id}:${version}`
    const cached = await getConversationKey(cacheKey)
    if (cached) {
      setConversationKey(cached)
      return cached
    }

    const legacyCached = localStorage.getItem(cacheKey)
    if (legacyCached) localStorage.removeItem(cacheKey)

    const keyRes = await fetch(`/api/dm/channels/${channelInfo.id}/keys`)
    if (!keyRes.ok) return null
    const payload = await keyRes.json()
    const privateKey = identity.privateKey

    const existingWrapped = (payload.wrappedKeys ?? []).find((row: any) => row.key_version === version && row.target_device_id === identity.deviceId)
    if (existingWrapped) {
      const senderPublic = await importPublicKey(existingWrapped.sender_public_key)
      const unwrapped = await unwrapConversationKey(existingWrapped.wrapped_key, privateKey, senderPublic)
      await putConversationKey(cacheKey, unwrapped)
      setConversationKey(unwrapped)
      return unwrapped
    }

    if (channelInfo.owner_id !== currentUserId) return null

    const nextKey = generateConversationKey()
    const wrappedKeys = await Promise.all((payload.memberDeviceKeys ?? []).map(async (row: any) => ({
      targetUserId: row.user_id,
      targetDeviceId: row.device_id,
      wrappedKey: await wrapConversationKey(nextKey, privateKey, await importPublicKey(row.public_key)),
      wrappedByDeviceId: identity.deviceId,
      senderPublicKey: identity.publicKey,
    })))

    const uploadRes = await fetch(`/api/dm/channels/${channelInfo.id}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyVersion: version, wrappedKeys }),
    })

    if (!uploadRes.ok) {
      throw new Error("Failed to upload wrapped conversation keys")
    }

    await putConversationKey(cacheKey, nextKey)
    setConversationKey(nextKey)
    return nextKey
  }, [currentUserId, ensureDeviceIdentity])

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
      if (data.channel?.is_encrypted) await ensureConversationKey(data.channel)
      if (before) {
        setMessages((prev) => [...(data.messages ?? []), ...prev])
      } else {
        setMessages(data.messages ?? [])
      }
      setHasMore(data.has_more)
    } catch {
      if (!before) setLoadError(true)
    }
  }, [channelId, ensureConversationKey])

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
    if (!channel?.is_encrypted || !conversationKey) {
      decryptedRef.current = {}
      setDecryptedContent({})
      return
    }

    let cancelled = false
    ;(async () => {
      const next = { ...decryptedRef.current }
      let changed = false

      for (const msg of messages) {
        const cached = next[msg.id]
        if (cached && !cached.failed) continue

        const envelope = parseEncryptedEnvelope(msg.content)
        if (!envelope) {
          next[msg.id] = { text: "Unable to decrypt this message", failed: true }
          changed = true
          continue
        }

        try {
          const versionKey = await getConversationKey(`dm-conversation-key:${channel.id}:${envelope.keyVersion}`)
          if (!versionKey) {
            next[msg.id] = { text: "Unable to decrypt this message", failed: true }
          } else {
            next[msg.id] = { text: await decryptDmContent(envelope, versionKey), failed: false }
          }
        } catch {
          next[msg.id] = { text: "Unable to decrypt this message", failed: true }
        }
        changed = true
      }

      if (!changed || cancelled) return
      decryptedRef.current = next
      setDecryptedContent(next)
    })()

    return () => { cancelled = true }
  }, [channel?.id, channel?.is_encrypted, conversationKey, messages])

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
            playNotification();
            (supabase as any)
              .from("direct_messages")
              .select("*, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status), reply_to_id")
              .eq("id", msg.id)
              .single()
              .then(async ({ data }: { data: any }) => {
                if (!data) return
                // Resolve reply_to if present
                let replyToMsg = null
                if (data.reply_to_id) {
                  const { data: replyData } = await supabase
                    .from("direct_messages")
                    .select("id, content, sender_id, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
                    .eq("id", data.reply_to_id)
                    .eq("dm_channel_id", channelId)
                    .is("deleted_at", null)
                    .single()
                  replyToMsg = replyData ?? null
                }
                setMessages((prev) => [...prev, { ...data, reply_to: replyToMsg } as Message])
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
    const currentReplyTo = replyTo
    setContent("")
    setReplyTo(null)
    onSent()

    try {
      let outbound = text
      if (channel?.is_encrypted) {
        const key = conversationKey ?? await ensureConversationKey(channel)
        if (!key) throw new Error("Missing encryption key")
        const envelope = await encryptDmContent(text, key, channel.encryption_key_version ?? 1)
        outbound = JSON.stringify(envelope)
      }
      const payload: { content: string; reply_to_id?: string } = { content: outbound }
      if (currentReplyTo) {
        payload.reply_to_id = currentReplyTo.id
      }
      const msg = await sendDmPayload(payload)
      if (msg) {
        setMessages((prev) => [...prev, msg])
      } else {
        // Restore so user can retry
        setContent(text)
        setReplyTo(currentReplyTo)
        toast({
          variant: "destructive",
          title: "Failed to send message",
          description: "Your message could not be delivered. Please try again.",
        })
      }
    } catch {
      setContent(text)
      setReplyTo(currentReplyTo)
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
    if (channel?.is_encrypted) {
      toast({ variant: "destructive", title: "Editing encrypted messages is currently disabled" })
      setEditingId(null)
      return
    }

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
      let outbound = fileContent
      if (channel?.is_encrypted) {
        const key = conversationKey ?? await ensureConversationKey(channel)
        if (!key) throw new Error("Missing encryption key")
        outbound = JSON.stringify(await encryptDmContent(fileContent, key, channel.encryption_key_version ?? 1))
      }
      const msg = await sendDmPayload({ content: outbound })
      if (msg) {
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

  function handleSearchClick() {
    if (!channel?.is_encrypted) {
      toast({ title: "Search is coming soon", description: "Conversation search isn’t wired up yet." })
      return
    }

    const query = window.prompt("Local encrypted search", "")?.trim().toLowerCase()
    if (!query) return
    const hits = Object.values(decryptedContent).filter((entry) => !entry.failed && entry.text.toLowerCase().includes(query)).length
    toast({ title: "Local encrypted search", description: `${hits} matching message${hits === 1 ? "" : "s"} found on this device.` })
  }

  function handlePinClick() {
    toast({ title: "Pinned messages coming soon", description: "Pin browsing will be available in a future update." })
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: "var(--app-bg-primary)" }}>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Failed to load conversation.</p>
        <button
          onClick={() => loadMessages()}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "var(--theme-accent)", color: "white" }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--app-bg-primary)" }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  const displayName = channel.is_group
    ? (channel.name || channel.members.map((m) => m.display_name || m.username).join(", "))
    : (channel.partner?.display_name || channel.partner?.username || "Unknown")
  const partnerInitials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: "var(--app-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--theme-bg-tertiary)" }}>
        <MobileMenuButton />
        {channel.is_group ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--theme-accent)" }}>
            <Users className="w-4 h-4 text-white" />
          </div>
        ) : (
          <Avatar className="w-8 h-8">
            {channel.partner?.avatar_url && <AvatarImage src={channel.partner.avatar_url} />}
            <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "12px" }}>
              {partnerInitials}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{displayName}</div>
          {channel.is_encrypted && (
            <div className="text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
              End-to-end encrypted • Device fingerprint: {deviceFingerprint ?? "verifying…"}
            </div>
          )}
        </div>

        <button
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--theme-text-secondary)" }}
          title="Search in conversation"
          aria-label="Search in conversation"
          type="button"
          onClick={handleSearchClick}
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--theme-text-secondary)" }}
          title="Pinned messages"
          aria-label="Pinned messages"
          type="button"
          onClick={handlePinClick}
        >
          <Pin className="w-4 h-4" />
        </button>

        {/* Call buttons — voice-only vs video differentiated */}
        {!channel.is_group && (
          <>
            <button
              onClick={startVoiceCall}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: (inCall && !callWithVideo) ? "var(--theme-success)" : "var(--theme-text-secondary)" }}
              title="Start voice call"
              disabled={inCall}
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={startVideoCall}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: (inCall && callWithVideo) ? "var(--theme-success)" : "var(--theme-text-secondary)" }}
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
              style={{ color: "var(--theme-text-muted)" }}
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
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--theme-accent)" }}>
                <Users className="w-10 h-10 text-white" />
              </div>
            ) : (
              <Avatar className="w-20 h-20 mx-auto mb-4">
                {channel.partner?.avatar_url && <AvatarImage src={channel.partner.avatar_url} />}
                <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "28px" }}>
                  {partnerInitials}
                </AvatarFallback>
              </Avatar>
            )}
            <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
            <p style={{ color: "var(--theme-text-secondary)" }} className="text-sm">
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
            !msg.reply_to_id &&
            new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
          const isOwn = msg.sender_id === currentUserId
          const senderName = msg.sender?.display_name || msg.sender?.username || "Unknown"
          const senderInitials = senderName.slice(0, 2).toUpperCase()
          const isEditing = editingId === msg.id

          const renderedContent = channel.is_encrypted ? (decryptedContent[msg.id]?.text ?? "Decrypting…") : msg.content
          const decryptFailed = channel.is_encrypted ? Boolean(decryptedContent[msg.id]?.failed) : false

          // Render image attachments inline (markdown-style links to images)
          const imageMatch = renderedContent?.match(/^\[(.+)\]\((https?:\/\/.+)\)$/)

          return (
            <div key={msg.id} className={cn("group hover:bg-white/[0.02] rounded px-1 -mx-1", isGrouped ? "pl-11" : "")}>
              {/* Reply reference */}
              {msg.reply_to_id && msg.reply_to && (
                <div
                  className="flex items-center gap-2 mb-0.5 ml-11 text-xs rounded px-1 py-0.5"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  <Reply className="w-3 h-3 -scale-x-100 flex-shrink-0" />
                  <span className="font-medium" style={{ color: "var(--theme-text-secondary)" }}>
                    {msg.reply_to.sender?.display_name || msg.reply_to.sender?.username || "Unknown"}
                  </span>
                  <span className="truncate">
                    {channel.is_encrypted
                      ? (decryptedContent[msg.reply_to.id]?.text ?? "Encrypted message")
                      : (msg.reply_to.content ?? "Message deleted")}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3">
                {!isGrouped && (
                  <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                    {msg.sender?.avatar_url && <AvatarImage src={msg.sender.avatar_url} />}
                    <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "12px" }}>
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
                      <span className="text-xs" style={{ color: "var(--theme-text-faint)" }}>
                        {format(new Date(msg.created_at), "h:mm a")}
                      </span>
                    </div>
                  )}
                  {isEditing ? (
                    <div className="flex gap-2 items-center">
                      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                      <input
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) handleEditSave(msg.id)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        className="flex-1 bg-transparent border-b text-sm focus:outline-none"
                        style={{ color: "var(--theme-text-normal)", borderColor: "var(--theme-accent)" }}
                      />
                      <button type="button" onClick={() => handleEditSave(msg.id)} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--theme-accent)", color: "white" }}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Cancel</button>
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
                      <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{imageMatch[1]}</span>
                    </div>
                  ) : (
                    <p className="text-sm break-words" style={{ color: decryptFailed ? "var(--theme-warning)" : "var(--theme-text-normal)" }}>
                      {renderedContent}
                    </p>
                  )}
                  {msg.edited_at && !isEditing && (
                    <span className="text-xs" style={{ color: "var(--theme-text-faint)" }}> (edited)</span>
                  )}
                </div>
                {/* Hover actions */}
                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 transition-opacity">
                    {/* Reply button — available for all messages */}
                    <button
                      type="button"
                      onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
                      style={{ color: "var(--theme-text-muted)" }}
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5 -scale-x-100" />
                    </button>
                    {isOwn && !channel.is_encrypted && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingId(msg.id); setEditContent(renderedContent) }}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
                          style={{ color: "var(--theme-text-muted)" }}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(msg.id)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20"
                          style={{ color: "var(--theme-text-muted)" }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <TypingIndicator users={typingUsers.map((user) => user.displayName)} />

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        {/* Reply indicator */}
        {replyTo && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-t text-xs"
            style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-bg-tertiary)" }}
          >
            <Reply className="w-3 h-3 -scale-x-100 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
            <span style={{ color: "var(--theme-text-muted)" }}>Replying to</span>
            <span className="font-semibold text-white">
              {replyTo.sender?.display_name || replyTo.sender?.username || "Unknown"}
            </span>
            <span className="truncate flex-1" style={{ color: "var(--theme-text-muted)" }}>
              {channel.is_encrypted
                ? (decryptedContent[replyTo.id]?.text ?? "Encrypted message")
                : replyTo.content}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} style={{ color: "var(--theme-text-muted)" }}>
              <X className="w-3 h-3 hover:text-white" />
            </button>
          </div>
        )}
        <div className={cn("flex items-center gap-2 px-3 py-2", replyTo ? "rounded-b-lg" : "rounded-lg")} style={{ background: "var(--theme-surface-input)" }}>
          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="flex-shrink-0 transition-colors hover:text-white"
            style={{ color: "var(--theme-text-muted)" }}
            title="Attach file"
          >
            {uploadingFile
              ? <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
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
            ref={inputRef}
            type="text"
            value={content}
            onChange={(e) => { setContent(e.target.value); if (e.target.value) onKeystroke() }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleSend()
              if (e.key === "Escape" && replyTo) { e.preventDefault(); setReplyTo(null) }
            }}
            placeholder={replyTo ? `Reply to ${replyTo.sender?.display_name || replyTo.sender?.username || "Unknown"}` : `Message ${channel.is_group ? displayName : `@${displayName}`}`}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "var(--theme-text-normal)" }}
          />
          <button
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            title="Open emoji picker"
            type="button"
          >
            <SmilePlus className="w-4 h-4" />
          </button>
          {content.trim() && (
            <button onClick={handleSend} disabled={sending} style={{ color: "var(--theme-accent)" }}>
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

  const statusMeta: Record<typeof status, { label: string; detail: string; tone: string; bg: string }> = {
    connecting: {
      label: "Connecting",
      detail: withVideo ? `Setting up video with ${displayName}` : `Reaching ${displayName}`,
      tone: "var(--theme-text-secondary)",
      bg: "rgba(181,186,193,0.18)",
    },
    connected: {
      label: "Live",
      detail: withVideo ? "Video and audio are flowing" : "Voice is stable",
      tone: "#9ae6b4",
      bg: "rgba(35,165,90,0.2)",
    },
    failed: {
      label: "Couldn’t connect",
      detail: failReason || "Try again in a moment.",
      tone: "#ffd58a",
      bg: "rgba(240,177,50,0.2)",
    },
  }
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const supabase = useMemo(() => createClientSupabaseClient(), [])

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

  const { toggleMute, toggleVideo } = useCallMediaToggles({
    muted,
    videoOff,
    setMuted,
    setVideoOff,
    onToggleMute: (isMuted) => {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = isMuted
      })
    },
    onToggleVideo: (isVideoOff) => {
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff
      })
    },
  })

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
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center" style={{ background: "var(--theme-bg-tertiary)" }}>
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
            style={{ borderColor: "var(--theme-accent)", transform: "scaleX(-1)" }}
          />
          {status === "connecting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(0,0,0,0.6)" }}>
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
              <p className="text-white text-sm">{statusMeta.connecting.detail}…</p>
            </div>
          )}
          {status === "failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
              <p className="text-white font-medium">{statusMeta.failed.label}</p>
              <p className="text-sm text-center" style={{ color: "var(--theme-text-secondary)" }}>{statusMeta.failed.detail}</p>
            </div>
          )}
        </div>
      ) : (
        /* Voice-only UI: show avatar */
        <div className="flex flex-col items-center gap-4 pb-8">
          <div
            className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center overflow-hidden",
              status === "connected" ? "ring-4 ring-green-500/80" : "ring-2 ring-[var(--theme-text-faint)]/60"
            )}
            style={{ background: "var(--theme-accent)", transition: "box-shadow 240ms ease" }}
          >
            {partner?.avatar_url ? (
              <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-4xl">{displayName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <p className="text-white font-semibold text-lg">{displayName}</p>
          <div className="text-sm px-3 py-1 rounded-full" style={{ color: statusMeta[status].tone, background: statusMeta[status].bg }}>
            <span className="font-medium">{statusMeta[status].label}</span>
            <span className="ml-2" style={{ color: "#c9ccd1" }}>{statusMeta[status].detail}</span>
          </div>
          {status === "connecting" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--theme-text-muted)" }}>
              <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
              Establishing secure media link…
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={toggleMute}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
          style={{ background: muted ? "var(--theme-danger)" : "var(--theme-text-faint)" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
        </button>
        {withVideo && (
          <button
            onClick={toggleVideo}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
            style={{ background: videoOff ? "var(--theme-danger)" : "var(--theme-text-faint)" }}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? <VideoOff className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-white" />}
          </button>
        )}
        <button
          onClick={hangup}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--theme-danger)" }}
          title="Hang up"
        >
          <PhoneOff className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  )
}
