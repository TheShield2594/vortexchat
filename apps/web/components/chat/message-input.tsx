"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, X, Smile, Reply, Keyboard, FileUp, BarChart3, Sticker, Plus, MessageSquare } from "lucide-react"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useMentionAutocomplete } from "@/hooks/use-mention-autocomplete"
import { useEmojiAutocomplete } from "@/hooks/use-emoji-autocomplete"
import { useSlashCommandAutocomplete, type SlashCommand } from "@/hooks/use-slash-command-autocomplete"
import { MentionSuggestions } from "@/components/chat/mention-suggestions"
import { EmojiSuggestions } from "@/components/chat/emoji-suggestions"
import { SlashCommandSuggestions } from "@/components/chat/slash-command-suggestions"
import { resolveComposerKeybinding } from "@/lib/composer-keybindings"
import { useServerEmojis } from "@/components/chat/server-emoji-context"
import { EmojiPicker } from "frimousse"

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

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs"

/** Composable message input with file attachments, emoji picker, @mention autocomplete, and reply-to indicator. */
export function MessageInput({ channelName, draft, replyTo, onCancelReply, onSend, onDraftChange, onTyping, onSent, onCreateThread, serverId }: Props) {
  const [content, setContent] = useState(draft)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiGridRef = useRef<HTMLDivElement>(null)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif">("emoji")
  const [gifQuery, setGifQuery] = useState("")
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; previewUrl: string; gifUrl: string; url: string | null }>>([])
  const [gifLoading, setGifLoading] = useState(false)
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
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  useEffect(() => {
    if (!serverId) return
    fetch(`/api/servers/${serverId}/apps/commands`)
      .then((res) => res.ok ? res.json() : [])
      .then((data: SlashCommand[]) => setSlashCommands(Array.isArray(data) ? data : []))
      .catch(() => {/* non-fatal */})
  }, [serverId])
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
    if (!showEmojiPicker) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const clickedInsidePicker = emojiPickerRef.current?.contains(target)
      const clickedToggleButton = emojiButtonRef.current?.contains(target)
      if (!clickedInsidePicker && !clickedToggleButton) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [showEmojiPicker])

  useEffect(() => {
    if (!showPollCreator) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const clickedInsidePollCreator = pollCreatorRef.current?.contains(target)
      if (!clickedInsidePollCreator) {
        setShowPollCreator(false)
        resetPollDraftToBlank()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [showPollCreator])

  useEffect(() => {
    if (!showPlusMenu) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const clickedInsideMenu = plusMenuRef.current?.contains(target)
      const clickedButton = plusButtonRef.current?.contains(target)
      if (!clickedInsideMenu && !clickedButton) {
        setShowPlusMenu(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [showPlusMenu])

  useEffect(() => {
    if (!showEmojiPicker || pickerTab !== "gif") return
    const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY
    if (!apiKey) {
      setGifResults([])
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setGifLoading(true)
      try {
        const endpoint = gifQuery.trim()
          ? `${GIPHY_API_BASE}/search?api_key=${apiKey}&q=${encodeURIComponent(gifQuery)}&limit=12&rating=pg-13`
          : `${GIPHY_API_BASE}/trending?api_key=${apiKey}&limit=12&rating=pg-13`
        const res = await fetch(endpoint, { signal: controller.signal, keepalive: true })
        const json = await res.json()
        setGifResults((json.data ?? []).map((gif: any) => ({
          id: gif.id,
          title: gif.title || "GIF",
          previewUrl: gif.images?.fixed_width_small?.url ?? gif.images?.preview_gif?.url ?? gif.images?.fixed_width_small_still?.url ?? gif.images?.original_still?.url ?? gif.images?.original?.url ?? "",
          gifUrl: gif.images?.original?.url ?? gif.images?.downsized?.url ?? "",
          url: gif.url || null,
        })).filter((gif: { previewUrl: string; gifUrl: string; url: string | null }) => Boolean(gif.previewUrl && (gif.url || gif.gifUrl))))
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

  async function handleSend() {
    if ((!content.trim() && files.length === 0) || sending) return

    // Detect slash command invocation: `/commandName [args]`
    if (serverId && content.startsWith("/")) {
      const [commandToken, ...argParts] = content.trim().split(/\s+/)
      const commandName = commandToken.slice(1).toLowerCase()
      const matchedCommand = slashCommands.find((cmd) => cmd.commandName.toLowerCase() === commandName)
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
            body: JSON.stringify({ commandId: matchedCommand.id, appId: matchedCommand.appId, args: argParts.join(" ") }),
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setFiles((prev) => [...prev, ...selected])
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...dropped])
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith("image/"))
    if (imageItems.length > 0) {
      const imageFiles = imageItems
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[]
      setFiles((prev) => [...prev, ...imageFiles])
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
    const cols = 3
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
    <div className="px-4 pb-4 flex-shrink-0" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
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
                className="motion-interactive absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"
                style={{ background: "var(--theme-danger)" }}
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-3 h-3" style={{ color: "var(--theme-text-bright)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(uploadProgress !== null || sendError) && (
        <div className={cn("px-3 py-2", files.length > 0 ? "rounded-none" : "rounded-t")} style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-bg-tertiary)" }}>
          {uploadProgress !== null && (
            <div>
              <div className="h-1.5 rounded" style={{ background: "var(--theme-bg-tertiary)" }}>
                <div className="h-1.5 rounded" style={{ width: `${uploadProgress}%`, background: "var(--theme-accent)", transition: "width 120ms linear" }} />
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
          replyTo || files.length > 0 || uploadProgress !== null || Boolean(sendError) ? "rounded-t-none" : ""
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
              : slashCommands.length > 0
                ? `Message #${channelName} — @ mention, : emoji, / command`
                : `Message #${channelName} — @ to mention, : for emoji`
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
            className="panel-surface-motion fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t p-2 shadow-xl md:absolute md:inset-x-auto md:bottom-14 md:right-4 md:w-[320px] md:rounded-lg md:border"
            style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-bg-tertiary)", maxHeight: "min(70vh, 520px)" }}
          >
              <div className="mb-2 flex items-center gap-2" role="tablist" aria-label="Picker type">
                <button
                  role="tab"
                  aria-selected={pickerTab === "emoji"}
                  aria-controls="emoji-tab-panel"
                  onClick={() => setPickerTab("emoji")}
                  className="px-2 py-1 rounded text-xs font-medium focus-ring"
                  style={{ background: pickerTab === "emoji" ? "var(--theme-accent)" : "transparent", color: "var(--theme-text-primary)" }}
                >
                  Emoji
                </button>
                <button
                  role="tab"
                  aria-selected={pickerTab === "gif"}
                  aria-controls="gif-tab-panel"
                  onClick={() => setPickerTab("gif")}
                  className="px-2 py-1 rounded text-xs font-medium focus-ring"
                  style={{ background: pickerTab === "gif" ? "var(--theme-accent)" : "transparent", color: "var(--theme-text-primary)" }}
                >
                  GIFs
                </button>
              </div>

              {pickerTab === "emoji" ? (
                <div
                  id="emoji-tab-panel"
                  role="tabpanel"
                  ref={emojiGridRef}
                  onKeyDown={handleEmojiGridKeyDown}
                  style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
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
              ) : (
                <div id="gif-tab-panel" role="tabpanel" className="space-y-2">
                  <input
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    placeholder="Search GIFs"
                    aria-label="Search GIFs"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--theme-accent)]"
                    style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                  />
                  {!process.env.NEXT_PUBLIC_GIPHY_API_KEY ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                      Add NEXT_PUBLIC_GIPHY_API_KEY to enable GIF search.
                    </p>
                  ) : gifLoading ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Loading GIFs…</p>
                  ) : (
                    <div
                      className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto"
                      onKeyDown={handleGifGridKeyDown}
                    >
                      {gifResults.map((gif) => (
                        <button
                          key={gif.id}
                          onClick={() => {
                            const spacer = content.trim() ? " " : ""
                            const next = `${content}${spacer}${gif.url || gif.gifUrl}`
                            setContent(next)
                            setCursorPosition(next.length)
                            onDraftChange(next)
                            setShowEmojiPicker(false)
                            textareaRef.current?.focus()
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
          </div>
        )}

        {/* GIF & Emoji buttons (right side, Discord style) */}
        <button
          type="button"
          onClick={() => {
            setPickerTab("gif")
            setShowEmojiPicker((prev) => !prev || pickerTab !== "gif")
          }}
          className="motion-interactive motion-press flex-shrink-0 focus-ring rounded"
          style={{ color: pickerTab === "gif" && showEmojiPicker ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
          title="GIF"
          aria-label="Insert GIF"
          aria-pressed={pickerTab === "gif" && showEmojiPicker}
        >
          <Sticker className="w-5 h-5" />
        </button>
        <button
          type="button"
          ref={emojiButtonRef}
          onClick={() => {
            setPickerTab("emoji")
            setShowEmojiPicker((prev) => !prev || pickerTab !== "emoji")
          }}
          className="motion-interactive motion-press flex-shrink-0 focus-ring rounded"
          style={{ color: pickerTab === "emoji" && showEmojiPicker ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
          title="Emoji"
          aria-label="Insert emoji"
          aria-pressed={pickerTab === "emoji" && showEmojiPicker}
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
