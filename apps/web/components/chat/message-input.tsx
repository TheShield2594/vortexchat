"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Send, X, Smile, Reply, Keyboard, FileUp, BarChart3, Plus, MessageSquare } from "lucide-react"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useMentionAutocomplete } from "@/hooks/use-mention-autocomplete"
import { useEmojiAutocomplete } from "@/hooks/use-emoji-autocomplete"
import { useSlashCommandAutocomplete, type SlashCommand } from "@/hooks/use-slash-command-autocomplete"
import { BUILT_IN_SLASH_COMMANDS, getAvailableBuiltInCommands, getTextInsertionForBuiltIn, type BuiltInSlashCommand } from "@/lib/built-in-slash-commands"
import { MentionSuggestions } from "@/components/chat/mention-suggestions"
import { EmojiSuggestions } from "@/components/chat/emoji-suggestions"
import { SlashCommandSuggestions } from "@/components/chat/slash-command-suggestions"
import { resolveComposerKeybinding } from "@/lib/composer-keybindings"
import { useServerEmojis } from "@/components/chat/server-emoji-context"
import { CustomEmojiGrid } from "@/components/chat/custom-emoji-grid"
import { EmojiPicker } from "frimousse"
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachment-validation"

interface Props {
  channelName: string
  draft: string
  replyTo: MessageWithAuthor | null
  onCancelReply: () => void
  onSend: (content: string, files?: File[], onUploadProgress?: (percent: number) => void, abortSignal?: AbortSignal) => Promise<void>
  onDraftChange: (value: string) => void
  onTyping?: () => void
  onSent?: () => void
  onCreateThread?: () => void
  /** When provided, slash command autocomplete is enabled for apps installed on this server. */
  serverId?: string
}

// GIF/sticker requests go through the server-side proxy (caching + no client-side API key exposure)
const GIF_TRENDING_URL = "/api/gif/trending"
const GIF_SEARCH_URL = "/api/gif/search"
const MEME_TRENDING_URL = "/api/meme/trending"
const MEME_SEARCH_URL = "/api/meme/search"
const STICKER_TRENDING_URL = "/api/sticker/trending"
const STICKER_SEARCH_URL = "/api/sticker/search"

/** Composable message input with file attachments, emoji picker, @mention autocomplete, and reply-to indicator. */
export function MessageInput({ channelName, draft, replyTo, onCancelReply, onSend, onDraftChange, onTyping, onSent, onCreateThread, serverId }: Props) {
  const [content, setContent] = useState(draft)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState("")
  const emojiGridRef = useRef<HTMLDivElement>(null)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif" | "meme" | "sticker">("emoji")
  const [gifQuery, setGifQuery] = useState("")
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; previewUrl: string; gifUrl: string; url: string | null }>>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifSuggestions, setGifSuggestions] = useState<string[]>([])
  const [memeQuery, setMemeQuery] = useState("")
  const [memeResults, setMemeResults] = useState<Array<{ id: string; title: string; previewUrl: string; gifUrl: string; url: string | null }>>([])
  const [memeLoading, setMemeLoading] = useState(false)
  const [memesAvailable, setMemesAvailable] = useState<boolean | null>(null) // null = unknown yet
  const [stickerQuery, setStickerQuery] = useState("")
  const [stickerResults, setStickerResults] = useState<Array<{ id: string; title: string; previewUrl: string; gifUrl: string; url: string | null }>>([])
  const [stickerLoading, setStickerLoading] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const pollCreatorRef = useRef<HTMLDivElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const fileUrlCache = useRef(new Map<File, string>())
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced draft sync — keeps typing snappy, persists after 150ms idle
  const debouncedDraftChange = useCallback((value: string) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => onDraftChange(value), 150)
  }, [onDraftChange])

  useEffect(() => {
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [])

  // Mention autocomplete
  const { activeServerId, members: membersByServer } = useAppStore(
    useShallow((s) => ({ activeServerId: s.activeServerId, members: s.members }))
  )
  const members = activeServerId ? membersByServer[activeServerId] ?? [] : []
  const mention = useMentionAutocomplete({ content, cursorPosition, members })

  // Emoji autocomplete (`:shortcode` trigger)
  const { emojis: serverEmojis } = useServerEmojis()
  const emoji = useEmojiAutocomplete({ content, cursorPosition, serverEmojis })

  // Slash command autocomplete (`/command` prefix trigger)
  const [appCommands, setAppCommands] = useState<SlashCommand[]>([])
  const [userPermissions, setUserPermissions] = useState(0)
  const [isServerOwner, setIsServerOwner] = useState(false)
  useEffect(() => {
    if (!serverId) return
    fetch(`/api/servers/${serverId}/apps/commands`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return
        // New format: { commands, permissions, isOwner }
        if (data.commands) {
          setAppCommands(Array.isArray(data.commands) ? data.commands : [])
          setUserPermissions(data.permissions ?? 0)
          setIsServerOwner(data.isOwner ?? false)
        } else if (Array.isArray(data)) {
          // Backwards compat with old format
          setAppCommands(data)
        }
      })
      .catch(() => {/* non-fatal */})
  }, [serverId])
  // Merge permission-filtered built-in commands with app commands
  const slashCommands = useMemo(() => {
    const builtIns = getAvailableBuiltInCommands(userPermissions, isServerOwner, !!onCreateThread)
    return [...builtIns, ...appCommands]
  }, [appCommands, userPermissions, isServerOwner, onCreateThread])
  const slash = useSlashCommandAutocomplete({ content, cursorPosition, commands: slashCommands })

  function getPreviewUrl(file: File): string {
    let url = fileUrlCache.current.get(file)
    if (!url) {
      url = URL.createObjectURL(file)
      fileUrlCache.current.set(file, url)
    }
    return url
  }

  useEffect(() => {
    return () => {
      for (const url of fileUrlCache.current.values()) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    if (!replyTo) return
    textareaRef.current?.focus()
  }, [replyTo?.id])

  // Only sync from external draft changes (e.g. channel switch), not our own edits
  useEffect(() => {
    if (draft === content) return
    setContent(draft)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = "28px"
      el.style.height = Math.min(el.scrollHeight, 200) + "px"
    })
  }, [draft])

  useEffect(() => {
    if (!showEmojiPicker) {
      setEmojiSearch("")
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const clickedInsidePicker = emojiPickerRef.current?.contains(target)
      const clickedToggleButton = emojiButtonRef.current?.contains(target)
      if (!clickedInsidePicker && !clickedToggleButton) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [showEmojiPicker])

  useEffect(() => {
    if (!showPollCreator) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const clickedInsidePollCreator = pollCreatorRef.current?.contains(target)
      if (!clickedInsidePollCreator) {
        setShowPollCreator(false)
        resetPollDraftToBlank()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [showPollCreator])

  useEffect(() => {
    if (!showPlusMenu) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const clickedInsideMenu = plusMenuRef.current?.contains(target)
      const clickedButton = plusButtonRef.current?.contains(target)
      if (!clickedInsideMenu && !clickedButton) {
        setShowPlusMenu(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [showPlusMenu])

  useEffect(() => {
    if (!showEmojiPicker || pickerTab !== "gif") return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setGifLoading(true)
      try {
        const endpoint = gifQuery.trim()
          ? `${GIF_SEARCH_URL}?q=${encodeURIComponent(gifQuery.trim())}`
          : GIF_TRENDING_URL
        const res = await fetch(endpoint, { signal: controller.signal })
        const json = await res.json()
        setGifResults(Array.isArray(json) ? json : [])
      } catch {
        setGifResults([])
      } finally {
        setGifLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [showEmojiPicker, pickerTab, gifQuery])

  // Fetch GIF search autocomplete suggestions as user types
  useEffect(() => {
    if (!showEmojiPicker || pickerTab !== "gif" || gifQuery.trim().length < 2) {
      setGifSuggestions([])
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/gif/suggestions?q=${encodeURIComponent(gifQuery.trim())}`, { signal: controller.signal })
        const json = await res.json()
        setGifSuggestions(Array.isArray(json) ? json : [])
      } catch {
        // ignore abort / network errors
      }
    }, 300)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [showEmojiPicker, pickerTab, gifQuery])

  // Fetch sticker results (trending or search)
  useEffect(() => {
    if (!showEmojiPicker || pickerTab !== "sticker") return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setStickerLoading(true)
      try {
        const endpoint = stickerQuery.trim()
          ? `${STICKER_SEARCH_URL}?q=${encodeURIComponent(stickerQuery.trim())}`
          : STICKER_TRENDING_URL
        const res = await fetch(endpoint, { signal: controller.signal })
        const json = await res.json()
        setStickerResults(Array.isArray(json) ? json : [])
      } catch {
        setStickerResults([])
      } finally {
        setStickerLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [showEmojiPicker, pickerTab, stickerQuery])

  // Fetch meme results (trending or search)
  useEffect(() => {
    if (!showEmojiPicker || pickerTab !== "meme") return

    // If we already know memes are unavailable, skip fetching
    if (memesAvailable === false) return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setMemeLoading(true)
      try {
        const endpoint = memeQuery.trim()
          ? `${MEME_SEARCH_URL}?q=${encodeURIComponent(memeQuery.trim())}`
          : MEME_TRENDING_URL
        const res = await fetch(endpoint, { signal: controller.signal })
        const json = await res.json()
        const results = Array.isArray(json) ? json : []
        setMemeResults(results)
        // Trending returned empty with no query → memes aren't available (Giphy fallback)
        if (!memeQuery.trim() && results.length === 0) {
          setMemesAvailable(false)
          // Switch away from meme tab since it's unavailable
          setPickerTab("gif")
        } else if (results.length > 0) {
          setMemesAvailable(true)
        }
      } catch {
        setMemeResults([])
      } finally {
        setMemeLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [showEmojiPicker, pickerTab, memeQuery, memesAvailable])

  async function handleSend() {
    if ((!content.trim() && files.length === 0) || sending) return

    // Detect slash command invocation: `/commandName [args]`
    if (content.startsWith("/")) {
      const [commandToken, ...argParts] = content.trim().split(/\s+/)
      const commandName = commandToken.slice(1).toLowerCase()
      const args = argParts.join(" ")

      // Check built-in commands first
      const matchedBuiltIn = BUILT_IN_SLASH_COMMANDS.find((cmd) => cmd.commandName.toLowerCase() === commandName)
      if (matchedBuiltIn) {
        // Text-insertion commands (shrug, tableflip, etc.) — send as regular message
        const textInsert = getTextInsertionForBuiltIn(commandName, args)
        if (textInsert !== null) {
          if (!textInsert.trim() && files.length === 0) return // e.g. /spoiler with no args
          setContent(textInsert)
          // Fall through to normal send below with replaced content
          const savedContent = textInsert
          setSending(true)
          setSendError(null)
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          onSent?.()
          try {
            await onSend(savedContent, files.length > 0 ? files : undefined)
            setFiles([])
            for (const url of fileUrlCache.current.values()) URL.revokeObjectURL(url)
            fileUrlCache.current.clear()
          } catch (error: any) {
            setContent(savedContent)
            onDraftChange(savedContent)
            setSendError(error?.message ?? "Message send failed. Try again.")
          } finally {
            setSending(false)
            textareaRef.current?.focus()
          }
          return
        }

        // UI-trigger commands — open the relevant picker/creator
        if (commandName === "giphy" || commandName === "gif") {
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          setPickerTab("gif")
          setGifQuery(args)
          setShowEmojiPicker(true)
          return
        }
        if (commandName === "meme") {
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          setPickerTab("meme")
          setMemeQuery(args)
          setShowEmojiPicker(true)
          return
        }
        if (commandName === "sticker") {
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          setPickerTab("sticker")
          setStickerQuery(args)
          setShowEmojiPicker(true)
          return
        }
        if (commandName === "poll") {
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          if (pollOptions.length === 0) setPollOptions(["", ""])
          if (args) setPollQuestion(args)
          setShowPollCreator(true)
          return
        }
        if (commandName === "thread") {
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          onCreateThread?.()
          return
        }
        if (commandName === "nick") {
          if (!serverId || !args.trim()) {
            setSendError("/nick requires a nickname. Usage: /nick YourNewNick")
            return
          }
          setSending(true)
          setSendError(null)
          setSendSuccess(null)
          const savedContent = content
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            const res = await fetch(`/api/servers/${serverId}/members/me/nickname`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nickname: args.trim() }),
            })
            if (!res.ok) {
              const payload = await res.json().catch(() => ({}))
              throw new Error(payload?.error ?? `Failed to update nickname (${res.status})`)
            }
            setSendError(null)
            setSendSuccess(`Nickname updated to "${args.trim()}"`)
            setTimeout(() => setSendSuccess(null), 3000)
          } catch (error: any) {
            setContent(savedContent)
            onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to update nickname.")
          } finally {
            setSending(false)
            textareaRef.current?.focus()
          }
          return
        }

        // --- Moderation commands ---
        if (commandName === "kick") {
          if (!serverId) return
          const targetUsername = args.split(/\s+/)[0]
          const reason = args.slice(targetUsername.length).trim()
          if (!targetUsername) { setSendError("Usage: /kick @username [reason]"); return }
          const target = members.find((m) => m.username === targetUsername.replace(/^@/, ""))
          if (!target) { setSendError(`User "${targetUsername}" not found in this server.`); return }
          setSending(true); setSendError(null)
          const savedContent = content
          setContent(""); onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            const url = `/api/servers/${serverId}/members/${target.user_id}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`
            const res = await fetch(url, { method: "DELETE" })
            if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p?.error ?? `Kick failed (${res.status})`) }
          } catch (error: any) {
            setContent(savedContent); onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to kick member.")
          } finally { setSending(false); textareaRef.current?.focus() }
          return
        }

        if (commandName === "ban") {
          if (!serverId) return
          const targetUsername = args.split(/\s+/)[0]
          const reason = args.slice(targetUsername.length).trim()
          if (!targetUsername) { setSendError("Usage: /ban @username [reason]"); return }
          const target = members.find((m) => m.username === targetUsername.replace(/^@/, ""))
          if (!target) { setSendError(`User "${targetUsername}" not found in this server.`); return }
          setSending(true); setSendError(null)
          const savedContent = content
          setContent(""); onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            const res = await fetch(`/api/servers/${serverId}/bans`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: target.user_id, reason: reason || undefined }),
            })
            if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p?.error ?? `Ban failed (${res.status})`) }
          } catch (error: any) {
            setContent(savedContent); onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to ban member.")
          } finally { setSending(false); textareaRef.current?.focus() }
          return
        }

        if (commandName === "unban") {
          if (!serverId) return
          const targetInput = args.split(/\s+/)[0]
          if (!targetInput) { setSendError("Usage: /unban @username or /unban <userId>"); return }
          setSending(true); setSendError(null)
          const savedContent = content
          setContent(""); onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            // Banned users aren't in the members list, so resolve from the ban list
            const strippedName = targetInput.replace(/^@/, "")
            // If it looks like a UUID, use it directly; otherwise fetch the ban list
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            let targetUserId: string | null = uuidPattern.test(strippedName) ? strippedName : null
            if (!targetUserId) {
              const bansRes = await fetch(`/api/servers/${serverId}/bans`)
              if (!bansRes.ok) throw new Error("Failed to fetch ban list")
              const bans: Array<{ user_id: string; username?: string; display_name?: string }> = await bansRes.json()
              const match = bans.find((b) => b.username === strippedName || b.display_name === strippedName || b.user_id === strippedName)
              if (!match) { throw new Error(`User "${targetInput}" not found in the ban list.`) }
              targetUserId = match.user_id
            }
            const res = await fetch(`/api/servers/${serverId}/bans?userId=${targetUserId}`, { method: "DELETE" })
            if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p?.error ?? `Unban failed (${res.status})`) }
          } catch (error: any) {
            setContent(savedContent); onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to unban member.")
          } finally { setSending(false); textareaRef.current?.focus() }
          return
        }

        if (commandName === "timeout") {
          if (!serverId) return
          // /timeout @username duration [reason]  — duration in minutes
          const parts = args.split(/\s+/)
          const targetUsername = parts[0]
          const durationStr = parts[1]
          const reason = parts.slice(2).join(" ")
          if (!targetUsername || !durationStr) { setSendError("Usage: /timeout @username <minutes> [reason]"); return }
          const durationMinutes = parseInt(durationStr, 10)
          if (isNaN(durationMinutes) || durationMinutes <= 0) { setSendError("Duration must be a positive number of minutes."); return }
          const target = members.find((m) => m.username === targetUsername.replace(/^@/, ""))
          if (!target) { setSendError(`User "${targetUsername}" not found in this server.`); return }
          setSending(true); setSendError(null)
          const savedContent = content
          setContent(""); onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            const res = await fetch(`/api/servers/${serverId}/members/${target.user_id}/timeout`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ duration_seconds: durationMinutes * 60, reason: reason || undefined }),
            })
            if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p?.error ?? `Timeout failed (${res.status})`) }
          } catch (error: any) {
            setContent(savedContent); onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to timeout member.")
          } finally { setSending(false); textareaRef.current?.focus() }
          return
        }

        if (commandName === "mute") {
          if (!serverId) return
          const targetUsername = args.split(/\s+/)[0]
          if (!targetUsername) { setSendError("Usage: /mute @username"); return }
          const target = members.find((m) => m.username === targetUsername.replace(/^@/, ""))
          if (!target) { setSendError(`User "${targetUsername}" not found in this server.`); return }
          // Mute uses the timeout endpoint with a short reason identifier
          setSending(true); setSendError(null)
          const savedContent = content
          setContent(""); onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          try {
            const res = await fetch(`/api/servers/${serverId}/members/${target.user_id}/timeout`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ duration_seconds: 600, reason: "Muted via /mute command" }),
            })
            if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p?.error ?? `Mute failed (${res.status})`) }
          } catch (error: any) {
            setContent(savedContent); onDraftChange(savedContent)
            setSendError(error?.message ?? "Failed to mute member.")
          } finally { setSending(false); textareaRef.current?.focus() }
          return
        }
      }

      // App-installed commands (require serverId)
      if (serverId) {
        const matchedCommand = appCommands.find((cmd) => cmd.commandName.toLowerCase() === commandName)
        if (matchedCommand) {
          setSending(true)
          setSendError(null)
          const savedContent = content
          setContent("")
          onDraftChange("")
          if (textareaRef.current) textareaRef.current.style.height = "28px"
          onSent?.()
          try {
            const res = await fetch(`/api/servers/${serverId}/apps/commands/execute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ commandId: matchedCommand.id, appId: matchedCommand.appId, args }),
            })
            if (!res.ok) {
              const payload = await res.json().catch(() => ({}))
              throw new Error(payload?.error ?? `Command failed (${res.status})`)
            }
          } catch (error: any) {
            setContent(savedContent)
            onDraftChange(savedContent)
            setSendError(error?.message ?? "Command failed. Try again.")
          } finally {
            setSending(false)
            textareaRef.current?.focus()
          }
          return
        }
      }
    }

    setSending(true)
    setSendError(null)
    setUploadProgress(files.length > 0 ? 0 : null)
    const abortController = new AbortController()
    uploadAbortRef.current = abortController
    onSent?.()

    // Cancel any pending debounced draft sync before clearing
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)

    // Clear input immediately for a snappy feel — restore on failure
    const savedContent = content
    const savedFiles = [...files]
    setContent("")
    onDraftChange("")
    setFiles([])
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "28px"

    try {
      await onSend(savedContent, savedFiles, (percent) => setUploadProgress(percent), abortController.signal)
      for (const url of fileUrlCache.current.values()) URL.revokeObjectURL(url)
      fileUrlCache.current.clear()
    } catch (error: any) {
      if (error?.name === "AbortError" || abortController.signal.aborted) {
        setSendError(null)
      } else {
        // Restore content so the user can retry
        setContent(savedContent)
        onDraftChange(savedContent)
        setFiles(savedFiles)
        setSendError(error?.message ?? "Message send failed. Try again.")
      }
    } finally {
      setSending(false)
      setUploadProgress(null)
      uploadAbortRef.current = null
      textareaRef.current?.focus()
    }
  }

  function handleCancelUpload() {
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mentionHandledNavigation = mention.handleKeyDown(e)
    const emojiHandledNavigation = emoji.handleKeyDown(e)
    const slashHandledNavigation = slash.handleKeyDown(e)
    const selectedMention = mention.filteredMembers[mention.selectedIndex]
    const selectedEmoji = emoji.matches[emoji.selectedIndex]
    const selectedSlash = slash.matches[slash.selectedIndex]
    const action = resolveComposerKeybinding(e.key, e.shiftKey, {
      isMentionOpen: mention.isOpen,
      hasMentionSelection: Boolean(selectedMention),
      isEmojiOpen: emoji.isOpen,
      hasEmojiSelection: Boolean(selectedEmoji),
      isSlashOpen: slash.isOpen,
      hasSlashSelection: Boolean(selectedSlash),
      hasDraftContent: content.length > 0,
      mentionHandledNavigation,
      emojiHandledNavigation,
      slashHandledNavigation,
    })

    if (action.preventDefault) {
      e.preventDefault()
    }

    if (action.acceptMention && selectedMention) {
      insertMention(selectedMention)
      return
    }

    if (action.closeMention) {
      mention.close()
      return
    }

    if (action.acceptEmoji && selectedEmoji) {
      insertEmoji(selectedEmoji)
      return
    }

    if (action.closeEmoji) {
      emoji.close()
      return
    }

    if (action.acceptSlash && selectedSlash) {
      insertSlashCommand(selectedSlash)
      return
    }

    if (action.closeSlash) {
      slash.close()
      return
    }

    if (action.clearDraft) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      setContent("")
      onDraftChange("")
      setCursorPosition(0)
      return
    }

    if (action.sendMessage) {
      handleSend()
    }
  }

  function insertMention(member: typeof members[number]) {
    const { newContent, newCursorPosition } = mention.selectMember(member)
    setContent(newContent)
    onDraftChange(newContent)
    setCursorPosition(newCursorPosition)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPosition
        textareaRef.current.selectionEnd = newCursorPosition
      }
    })
  }

  function insertSlashCommand(command: Parameters<typeof slash.selectCommand>[0]) {
    const { newContent, newCursorPosition } = slash.selectCommand(command)
    setContent(newContent)
    onDraftChange(newContent)
    setCursorPosition(newCursorPosition)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPosition
        textareaRef.current.selectionEnd = newCursorPosition
      }
    })
  }

  function insertEmoji(match: Parameters<typeof emoji.selectEmoji>[0]) {
    const { newContent, newCursorPosition } = emoji.selectEmoji(match)
    setContent(newContent)
    onDraftChange(newContent)
    setCursorPosition(newCursorPosition)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPosition
        textareaRef.current.selectionEnd = newCursorPosition
      }
    })
  }

  function filterOversizedFiles(incoming: File[]): File[] {
    const maxMB = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))
    const oversized = incoming.filter((f) => f.size > MAX_ATTACHMENT_BYTES)
    if (oversized.length > 0) {
      const names = oversized.map((f) => f.name).join(", ")
      setSendError(`File${oversized.length > 1 ? "s" : ""} too large (max ${maxMB} MB): ${names}`)
    }
    return incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = filterOversizedFiles(Array.from(e.target.files ?? []))
    if (selected.length > 0) setFiles((prev) => [...prev, ...selected])
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingOver(false)
    const dropped = filterOversizedFiles(Array.from(e.dataTransfer.files))
    if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped])
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith("image/"))
    if (imageItems.length > 0) {
      const imageFiles = filterOversizedFiles(
        imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[]
      )
      if (imageFiles.length > 0) setFiles((prev) => [...prev, ...imageFiles])
    }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value)
    debouncedDraftChange(e.target.value)
    setCursorPosition(e.target.selectionStart)
    const el = e.target
    el.style.height = "28px"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
    if (e.target.value) onTyping?.()
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCursorPosition(e.currentTarget.selectionStart)
  }

  function handleEmojiGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
    if (!arrows.includes(e.key)) return
    const gridEl = emojiGridRef.current
    if (!gridEl) return
    const buttons = Array.from(gridEl.querySelectorAll<HTMLButtonElement>("[data-emoji-btn]"))
    if (buttons.length === 0) return
    const activeEl = document.activeElement as HTMLButtonElement
    let currentIdx = buttons.indexOf(activeEl)
    if (currentIdx === -1) {
      e.preventDefault()
      buttons[0].focus()
      return
    }
    e.preventDefault()
    let cols = 9
    if (buttons.length >= 2) {
      const r0 = buttons[0].getBoundingClientRect()
      let c = 1
      for (let i = 1; i < buttons.length; i++) {
        if (buttons[i].getBoundingClientRect().top > r0.bottom) break
        c++
      }
      if (c > 0) cols = c
    }
    let nextIdx = currentIdx
    if (e.key === "ArrowRight") nextIdx = Math.min(buttons.length - 1, currentIdx + 1)
    else if (e.key === "ArrowLeft") nextIdx = Math.max(0, currentIdx - 1)
    else if (e.key === "ArrowDown") nextIdx = Math.min(buttons.length - 1, currentIdx + cols)
    else if (e.key === "ArrowUp") nextIdx = Math.max(0, currentIdx - cols)
    if (nextIdx !== currentIdx) {
      buttons[nextIdx].focus()
      buttons[nextIdx].scrollIntoView({ block: "nearest" })
    }
  }

  function handleGifGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
    if (!arrows.includes(e.key)) return
    e.preventDefault()
    const grid = e.currentTarget
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>("button"))
    if (buttons.length === 0) return
    const activeEl = document.activeElement as HTMLButtonElement
    const currentIdx = buttons.indexOf(activeEl)
    if (currentIdx === -1) return
    // Derive column count from CSS grid rather than hardcoding
    const colsParsed = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length
    const cols = colsParsed > 0 ? colsParsed : 3
    let nextIdx = currentIdx
    if (e.key === "ArrowRight") nextIdx = Math.min(buttons.length - 1, currentIdx + 1)
    else if (e.key === "ArrowLeft") nextIdx = Math.max(0, currentIdx - 1)
    else if (e.key === "ArrowDown") nextIdx = Math.min(buttons.length - 1, currentIdx + cols)
    else if (e.key === "ArrowUp") nextIdx = Math.max(0, currentIdx - cols)
    if (nextIdx !== currentIdx) {
      buttons[nextIdx].focus()
      buttons[nextIdx].scrollIntoView({ block: "nearest" })
    }
  }

  const canInsertPoll = pollQuestion.trim().length > 0 && pollOptions.filter((option) => option.trim().length > 0).length >= 2

  function resetPollDraftToBlank() {
    setPollQuestion("")
    setPollOptions([])
  }

  function handlePollInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey) return
    if (!canInsertPoll) return
    event.preventDefault()
    handleCreatePoll()
  }

  function removePollOption(index: number) {
    if (pollOptions.length <= 2) return
    setPollOptions((prev) => prev.filter((_, optionIndex) => optionIndex !== index))
  }

  function handleCreatePoll() {
    const question = pollQuestion.trim()
    const options = pollOptions.map((option) => option.trim()).filter(Boolean)
    if (!question || options.length < 2) return

    const pollBlock = ["[POLL]", question, ...options.map((option) => `- ${option}`), "[/POLL]"].join("\n")
    const spacer = content.trim() ? "\n\n" : ""
    const next = `${content}${spacer}${pollBlock}`
    setContent(next)
    onDraftChange(next)
    setCursorPosition(next.length)
    setShowPollCreator(false)
    setPollQuestion("")
    setPollOptions(["", ""])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      if (textareaRef.current) {
        textareaRef.current.selectionStart = next.length
        textareaRef.current.selectionEnd = next.length
      }
    })
  }

  return (
    <div
      className="px-4 pb-4 flex-shrink-0 relative"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current += 1; setIsDraggingOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDraggingOver(false) } }}
    >
      {/* Drag-and-drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg pointer-events-none" style={{ background: "color-mix(in srgb, var(--theme-accent) 10%, transparent)", border: "2px dashed var(--theme-accent)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--theme-accent)" }}>Drop files here</span>
        </div>
      )}

      {/* Reply indicator */}
      {replyTo && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t text-xs"
          style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-bg-tertiary)" }}
        >
          <Reply className="w-3 h-3 -scale-x-100" style={{ color: "var(--theme-text-muted)" }} />
          <span style={{ color: "var(--theme-text-muted)" }}>Replying to</span>
          <span className="font-semibold" style={{ color: "var(--theme-text-bright)" }}>
            {replyTo.author?.display_name || replyTo.author?.username}
          </span>
          <span className="truncate flex-1" style={{ color: "var(--theme-text-muted)" }}>
            {replyTo.content}
          </span>
          <button onClick={onCancelReply} aria-label="Cancel reply" className="focus-ring rounded" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div
          className="flex gap-2 p-2 flex-wrap rounded-t"
          style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-bg-tertiary)" }}
        >
          {files.map((file, i) => (
            <div key={i} className="relative group w-24">
              {file.type.startsWith("image/") ? (
                <img
                  src={getPreviewUrl(file)}
                  alt={file.name}
                  className="w-24 h-24 object-cover rounded-md border"
                  style={{ borderColor: "var(--theme-bg-tertiary)" }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-md border flex items-center justify-center text-xs text-center p-2"
                  style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-bg-tertiary)" }}
                >
                  {file.name}
                </div>
              )}
              <div className="mt-1 text-[10px] truncate" style={{ color: "var(--theme-text-muted)" }} title={file.name}>
                {file.name}
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = fileUrlCache.current.get(files[i])
                  if (url) { URL.revokeObjectURL(url); fileUrlCache.current.delete(files[i]) }
                  setFiles((prev) => prev.filter((_, j) => j !== i))
                }}
                className="motion-interactive absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                style={{ background: "var(--theme-danger)" }}
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-3 h-3" style={{ color: "var(--theme-text-bright)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(uploadProgress !== null || sendError || sendSuccess) && (
        <div className={cn("px-3 py-2", files.length > 0 ? "rounded-none" : "rounded-t")} style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-bg-tertiary)" }}>
          {uploadProgress !== null && (
            <div>
              <div className="h-1.5 rounded" style={{ background: "var(--theme-bg-tertiary)" }}>
                <div className="h-1.5 rounded upload-progress-bar" style={{ width: `${uploadProgress}%`, background: "var(--theme-accent)" }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Uploading attachments… {Math.round(uploadProgress)}%</p>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] surface-hover-md"
                  style={{ color: "var(--theme-danger)" }}
                  title="Cancel upload"
                  aria-label="Cancel upload"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          )}
          {sendSuccess && (
            <p className="text-[11px]" style={{ color: "var(--theme-success, #43b581)" }}>{sendSuccess}</p>
          )}
          {sendError && (
            <p className="text-[11px]" style={{ color: "var(--theme-danger)" }}>{sendError}</p>
          )}
        </div>
      )}

      {showPollCreator && (
        <div
          ref={pollCreatorRef}
          className="mb-2 rounded-lg p-3 space-y-2"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "var(--theme-text-primary)" }}>Create poll</p>
            <button type="button" aria-label="Close poll creator" className="focus-ring rounded" onClick={() => {
              setShowPollCreator(false)
              resetPollDraftToBlank()
            }} style={{ color: "var(--theme-text-muted)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            value={pollQuestion}
            onChange={(event) => setPollQuestion(event.target.value)}
            onKeyDown={handlePollInputKeyDown}
            placeholder="Poll question"
            className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
          />
          <div className="space-y-1.5">
            {pollOptions.map((option, index) => (
              <div key={`poll-option-${index}`} className="flex items-center gap-1.5">
                <input
                  value={option}
                  onChange={(event) => {
                    const next = [...pollOptions]
                    next[index] = event.target.value
                    setPollOptions(next)
                  }}
                  onKeyDown={handlePollInputKeyDown}
                  placeholder={`Option ${index + 1}`}
                  className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
                  style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                />
                <button
                  type="button"
                  onClick={() => removePollOption(index)}
                  disabled={pollOptions.length <= 2}
                  className="px-2 py-1 rounded text-xs disabled:opacity-50 focus-ring"
                  style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-bg-tertiary)" }}
                  aria-label={`Remove option ${index + 1}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPollOptions((prev) => prev.length >= 8 ? prev : [...prev, ""])}
              disabled={pollOptions.length >= 8}
              className="text-xs disabled:opacity-50"
              style={{ color: "var(--theme-link)" }}
            >
              Add option
            </button>
            <button
              type="button"
              onClick={handleCreatePoll}
              disabled={!canInsertPoll}
              className="px-2 py-1 rounded text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--theme-accent)", color: "white" }}
            >
              Insert poll
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-lg px-3 py-2",
          replyTo || files.length > 0 || uploadProgress !== null || Boolean(sendError) || Boolean(sendSuccess) ? "rounded-t-none" : ""
        )}
        style={{
          background: "var(--theme-surface-input)",
          boxShadow: inputFocused ? '0 0 0 2px color-mix(in srgb, var(--theme-accent) 55%, transparent)' : '0 0 0 2px transparent',
          transition: 'box-shadow var(--motion-duration-fast) var(--motion-ease-standard)',
        }}
      >
        {/* + button with dropdown menu (left side) */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            ref={plusButtonRef}
            onClick={() => setShowPlusMenu((v) => !v)}
            className="motion-interactive motion-press flex-shrink-0 w-7 h-7 flex items-center justify-center focus-ring rounded-full"
            style={{
              background: showPlusMenu ? "var(--theme-accent)" : "var(--theme-bg-tertiary)",
              color: showPlusMenu ? "white" : "var(--theme-text-secondary)",
            }}
            title="More options"
            aria-label="More options"
            aria-expanded={showPlusMenu}
          >
            <Plus className="w-4 h-4" />
          </button>

          {showPlusMenu && (
            <div
              ref={plusMenuRef}
              className="absolute bottom-full mb-2 left-0 z-50 rounded-lg shadow-xl overflow-hidden"
              style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)", minWidth: "200px" }}
            >
              <button
                type="button"
                onClick={() => { setShowPlusMenu(false); fileRef.current?.click() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left surface-hover motion-interactive"
                style={{ color: "var(--theme-text-primary)" }}
              >
                <FileUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--theme-accent)" }} />
                Upload a File
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPlusMenu(false)
                  if (pollOptions.length === 0) setPollOptions(["", ""])
                  setShowPollCreator(true)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left surface-hover motion-interactive"
                style={{ color: "var(--theme-text-primary)" }}
              >
                <BarChart3 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--theme-accent)" }} />
                Create Poll
              </button>
              {onCreateThread && (
                <button
                  type="button"
                  onClick={() => { setShowPlusMenu(false); onCreateThread() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left surface-hover motion-interactive"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: "var(--theme-accent)" }} />
                  Create Thread
                </button>
              )}
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Text input */}
        <div className="flex-1 relative">
          {/* Emoji autocomplete dropdown */}
          {emoji.isOpen && !mention.isOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
              <EmojiSuggestions
                matches={emoji.matches}
                selectedIndex={emoji.selectedIndex}
                onSelect={(match) => {
                  insertEmoji(match)
                  textareaRef.current?.focus()
                }}
              />
            </div>
          )}

          {/* Mention autocomplete dropdown */}
          {mention.isOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
              <MentionSuggestions
                members={mention.filteredMembers}
                selectedIndex={mention.selectedIndex}
                query={mention.query ?? ""}
                onSelect={(member) => {
                  insertMention(member)
                  textareaRef.current?.focus()
                }}
              />
            </div>
          )}

          {/* Slash command autocomplete dropdown */}
          {slash.isOpen && !mention.isOpen && !emoji.isOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
              <SlashCommandSuggestions
                commands={slash.matches}
                selectedIndex={slash.selectedIndex}
                onSelect={(command) => {
                  insertSlashCommand(command)
                  textareaRef.current?.focus()
                }}
              />
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={handleSelect}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={replyTo
              ? `Reply in #${channelName} — press Enter to send, Shift+Enter for newline`
              : `Message #${channelName} — @ mention, : emoji, / command`
            }
            rows={1}
            className="w-full resize-none bg-transparent text-sm focus:outline-none block"
            style={{ color: "var(--theme-text-normal)", maxHeight: "200px", lineHeight: "28px", height: "28px", padding: 0, margin: 0, border: "none" }}
          />
        </div>

        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            data-state="open"
            className="panel-surface-motion fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t p-2 shadow-xl md:absolute md:inset-x-auto md:bottom-14 md:right-4 md:w-[380px] md:rounded-lg md:border"
            style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-bg-tertiary)", maxHeight: "min(70vh, 520px)", overflow: "hidden" }}
          >
              <div className="mb-2 flex items-center gap-1 shrink-0" role="tablist" aria-label="Picker type">
                {([
                  { key: "emoji" as const, label: "Emoji", panel: "emoji-tab-panel" },
                  { key: "gif" as const, label: "GIFs", panel: "gif-tab-panel" },
                  ...(memesAvailable !== false ? [{ key: "meme" as const, label: "Memes", panel: "meme-tab-panel" }] : []),
                  { key: "sticker" as const, label: "Stickers", panel: "sticker-tab-panel" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={pickerTab === tab.key}
                    aria-controls={tab.panel}
                    onClick={() => setPickerTab(tab.key)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold focus-ring transition-colors"
                    style={{ background: pickerTab === tab.key ? "var(--theme-accent)" : "transparent", color: pickerTab === tab.key ? "#fff" : "var(--theme-text-secondary)" }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {pickerTab === "emoji" && (
                <div
                  id="emoji-tab-panel"
                  role="tabpanel"
                  ref={emojiGridRef}
                  onKeyDown={handleEmojiGridKeyDown}
                  style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}
                >
                  <EmojiPicker.Root
                    onEmojiSelect={({ emoji }) => {
                      const textarea = textareaRef.current
                      const start = textarea ? textarea.selectionStart ?? content.length : content.length
                      const end = textarea ? textarea.selectionEnd ?? start : start
                      const next = content.slice(0, start) + emoji + content.slice(end)
                      setContent(next)
                      setCursorPosition(start + emoji.length)
                      onDraftChange(next)
                      setShowEmojiPicker(false)
                      requestAnimationFrame(() => {
                        if (textarea) {
                          textarea.focus()
                          textarea.setSelectionRange(start + emoji.length, start + emoji.length)
                        }
                      })
                    }}
                    style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
                  >
                    <div style={{ padding: "6px 6px 4px" }}>
                      <EmojiPicker.Search
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-accent)]"
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          boxSizing: "border-box",
                          background: "var(--theme-bg-tertiary)",
                          color: "var(--theme-text-normal)",
                          border: "none",
                          outline: "none",
                        }}
                        placeholder="Search emoji…"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmojiSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.key === "Tab" && !e.shiftKey) || e.key === "ArrowDown") {
                            const firstBtn = emojiGridRef.current?.querySelector<HTMLButtonElement>("[data-emoji-btn]")
                            if (firstBtn) {
                              e.preventDefault()
                              firstBtn.focus()
                            }
                          }
                        }}
                      />
                    </div>
                    <EmojiPicker.Viewport style={{ flex: 1, overflow: "hidden auto" }}>
                      {serverEmojis.length > 0 && (
                        <CustomEmojiGrid
                          emojis={serverEmojis}
                          search={emojiSearch}
                          onSelect={(emoji) => {
                            const textarea = textareaRef.current
                            const start = textarea ? textarea.selectionStart ?? content.length : content.length
                            const end = textarea ? textarea.selectionEnd ?? start : start
                            const insertion = `:${emoji.name}: `
                            const next = content.slice(0, start) + insertion + content.slice(end)
                            setContent(next)
                            setCursorPosition(start + insertion.length)
                            onDraftChange(next)
                            setShowEmojiPicker(false)
                            requestAnimationFrame(() => {
                              if (textarea) {
                                textarea.focus()
                                textarea.setSelectionRange(start + insertion.length, start + insertion.length)
                              }
                            })
                          }}
                        />
                      )}
                      <EmojiPicker.Loading>
                        <div style={{ padding: "12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>Loading…</div>
                      </EmojiPicker.Loading>
                      <EmojiPicker.Empty>
                        {({ search }) => (
                          <div style={{ padding: "12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>
                            No emoji found for &ldquo;{search}&rdquo;
                          </div>
                        )}
                      </EmojiPicker.Empty>
                      <EmojiPicker.List
                        components={{
                          CategoryHeader: ({ category, ...props }) => (
                            <div
                              {...props}
                              style={{
                                padding: "3px 8px",
                                fontSize: "10px",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "var(--theme-text-muted)",
                                background: "var(--theme-bg-secondary)",
                                position: "sticky",
                                top: 0,
                              }}
                            >
                              {category.label}
                            </div>
                          ),
                          Emoji: ({ emoji, ...props }) => (
                            <button
                              type="button"
                              {...props}
                              data-emoji-btn=""
                              tabIndex={-1}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "18px",
                                width: "100%",
                                aspectRatio: "1",
                                borderRadius: "4px",
                                cursor: "pointer",
                                border: "none",
                                background: emoji.isActive ? "var(--theme-surface-elevated)" : "transparent",
                                fontFamily: "var(--frimousse-emoji-font)",
                              }}
                            >
                              {emoji.emoji}
                            </button>
                          ),
                        }}
                      />
                    </EmojiPicker.Viewport>
                    <div style={{ padding: "4px 8px 6px", display: "flex", alignItems: "center", justifyContent: "flex-end", borderTop: "1px solid var(--theme-bg-tertiary)" }}>
                      <EmojiPicker.SkinToneSelector
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          fontSize: "16px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--theme-bg-tertiary)",
                          background: "var(--theme-bg-tertiary)",
                        }}
                        aria-label="Change skin tone"
                      />
                    </div>
                  </EmojiPicker.Root>
                </div>
              )}
              {pickerTab === "gif" && (
                <div id="gif-tab-panel" role="tabpanel" className="flex flex-col gap-2 min-h-0 flex-1 overflow-hidden">
                  <input
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    placeholder="Search GIFs"
                    aria-label="Search GIFs"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-accent)] shrink-0"
                    style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                  />
                  {/* Search autocomplete suggestions */}
                  {gifSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {gifSuggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => setGifQuery(s)}
                          className="px-2 py-0.5 rounded-full text-[11px] hover:opacity-80 transition-opacity"
                          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Section header */}
                  {!gifQuery.trim() && !gifLoading && gifResults.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                      Trending
                    </p>
                  )}
                  {gifLoading ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Loading GIFs…</p>
                  ) : (
                    <div
                      className="grid grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0"
                      onKeyDown={handleGifGridKeyDown}
                    >
                      {gifResults.map((gif) => (
                        <button
                          key={gif.id}
                          onClick={async () => {
                            if (sending) return
                            const gifUrl = gif.url || gif.gifUrl
                            if (!gifUrl?.trim()) {
                              setSendError("Cannot send empty GIF.")
                              return
                            }
                            setShowEmojiPicker(false)
                            setSending(true)
                            setSendError(null)
                            onSent?.()
                            try {
                              await onSend(gifUrl)
                            } catch (error: any) {
                              setSendError(error?.message ?? "Failed to send GIF. Try again.")
                            } finally {
                              setSending(false)
                              textareaRef.current?.focus()
                            }
                          }}
                          className="rounded overflow-hidden hover:opacity-90 focus-ring"
                          title={gif.title}
                          aria-label={gif.title}
                        >
                          <img src={gif.previewUrl} alt={gif.title} className="w-full h-16 object-cover" />
                          <span className="block px-1 py-0.5 text-[10px] truncate text-left" style={{ color: "var(--theme-text-secondary)", background: "var(--theme-bg-tertiary)" }}>{gif.title || "GIF"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {pickerTab === "meme" && (
                <div id="meme-tab-panel" role="tabpanel" className="flex flex-col gap-2 min-h-0 flex-1 overflow-hidden">
                  {memesAvailable === false ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Memes are not available with the current provider.</p>
                    </div>
                  ) : (
                  <>
                  <input
                    value={memeQuery}
                    onChange={(e) => setMemeQuery(e.target.value)}
                    placeholder="Search memes"
                    aria-label="Search memes"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-accent)] shrink-0"
                    style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                  />
                  {!memeQuery.trim() && !memeLoading && memeResults.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                      Trending
                    </p>
                  )}
                  {memeLoading ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Loading memes…</p>
                  ) : (
                    <div
                      className="grid grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0"
                      onKeyDown={handleGifGridKeyDown}
                    >
                      {memeResults.map((meme) => (
                        <button
                          key={meme.id}
                          onClick={async () => {
                            if (sending) return
                            const memeUrl = meme.url || meme.gifUrl
                            if (!memeUrl?.trim()) {
                              setSendError("Cannot send empty meme.")
                              return
                            }
                            setShowEmojiPicker(false)
                            setSending(true)
                            setSendError(null)
                            onSent?.()
                            try {
                              await onSend(memeUrl)
                            } catch (error: any) {
                              setSendError(error?.message ?? "Failed to send meme. Try again.")
                            } finally {
                              setSending(false)
                              textareaRef.current?.focus()
                            }
                          }}
                          className="rounded overflow-hidden hover:opacity-90 focus-ring"
                          title={meme.title}
                          aria-label={meme.title}
                        >
                          <img src={meme.previewUrl} alt={meme.title} className="w-full h-16 object-cover" />
                          <span className="block px-1 py-0.5 text-[10px] truncate text-left" style={{ color: "var(--theme-text-secondary)", background: "var(--theme-bg-tertiary)" }}>{meme.title || "Meme"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}
              {pickerTab === "sticker" && (
                <div id="sticker-tab-panel" role="tabpanel" className="flex flex-col gap-2 min-h-0 flex-1 overflow-hidden">
                  <input
                    value={stickerQuery}
                    onChange={(e) => setStickerQuery(e.target.value)}
                    placeholder="Search stickers"
                    aria-label="Search stickers"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-accent)] shrink-0"
                    style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                  />
                  {!stickerQuery.trim() && !stickerLoading && stickerResults.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                      Trending
                    </p>
                  )}
                  {stickerLoading ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Loading stickers…</p>
                  ) : (
                    <div
                      className="grid grid-cols-4 gap-2 overflow-y-auto flex-1 min-h-0"
                      onKeyDown={handleGifGridKeyDown}
                    >
                      {stickerResults.map((sticker) => (
                        <button
                          key={sticker.id}
                          onClick={async () => {
                            if (sending) return
                            const stickerUrl = sticker.url || sticker.gifUrl
                            if (!stickerUrl?.trim()) {
                              setSendError("Cannot send empty sticker.")
                              return
                            }
                            setShowEmojiPicker(false)
                            setSending(true)
                            setSendError(null)
                            onSent?.()
                            try {
                              await onSend(stickerUrl)
                            } catch (error: any) {
                              setSendError(error?.message ?? "Failed to send sticker. Try again.")
                            } finally {
                              setSending(false)
                              textareaRef.current?.focus()
                            }
                          }}
                          className="rounded-lg overflow-hidden hover:scale-105 transition-transform focus-ring aspect-square"
                          style={{ background: "transparent" }}
                          title={sticker.title}
                          aria-label={sticker.title}
                        >
                          <img src={sticker.previewUrl} alt={sticker.title} className="w-full h-full object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

        {/* Emoji picker button (opens tabbed Emoji/GIF/Sticker picker) */}
        <button
          type="button"
          ref={emojiButtonRef}
          onClick={() => {
            setShowEmojiPicker((prev) => !prev)
          }}
          className="motion-interactive motion-press flex-shrink-0 focus-ring rounded"
          style={{ color: showEmojiPicker ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
          title="Emoji, GIFs & Stickers"
          aria-label="Open emoji, GIF and sticker picker"
          aria-pressed={showEmojiPicker}
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Send button */}
        {(content.trim() || files.length > 0) && (
          <button
            onClick={handleSend}
            disabled={sending}
            aria-label="Send message"
            className="motion-interactive motion-press flex-shrink-0 focus-ring rounded"
            style={{ color: "var(--theme-accent)" }}
            title="Send Message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
      <div
        className="mt-1 px-1 flex items-center justify-between text-[11px]"
        style={{ color: "var(--theme-text-muted)" }}
      >
        <div className="flex items-center gap-1.5">
          <Keyboard className="w-3 h-3" />
          <span>Enter send · Shift+Enter newline</span>
        </div>
        {mention.isOpen && <span>↑↓ navigate · Tab/Enter accept · Esc dismiss</span>}
      </div>
    </div>
  )
}
