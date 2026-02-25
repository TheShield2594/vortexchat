"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, Send, X, Smile, Reply, Keyboard, FileUp, BarChart3 } from "lucide-react"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useMentionAutocomplete } from "@/hooks/use-mention-autocomplete"
import { MentionSuggestions } from "@/components/chat/mention-suggestions"
import { resolveComposerKeybinding } from "@/lib/composer-keybindings"

interface Props {
  channelName: string
  draft: string
  replyTo: MessageWithAuthor | null
  onCancelReply: () => void
  onSend: (content: string, files?: File[], onUploadProgress?: (percent: number) => void) => Promise<void>
  onDraftChange: (value: string) => void
  onTyping?: () => void
  onSent?: () => void
}

const EMOJI_CATEGORIES = {
  People: ["😀", "😂", "😍", "🤔", "😭", "😎", "🥳", "😴", "🤯", "🫶", "👍", "👎"],
  Nature: ["🌱", "🌸", "🌳", "🍀", "🌊", "🔥", "☀️", "🌙", "⚡", "❄️", "🐶", "🦊"],
  Food: ["🍕", "🍔", "🌮", "🍣", "🍜", "🍩", "🍪", "🍎", "🍉", "☕", "🍺", "🍿"],
  Activities: ["⚽", "🏀", "🎮", "🎯", "🎸", "🎤", "🎨", "🧩", "♟️", "🏓", "🏆", "🎉"],
  Travel: ["🚗", "🚕", "✈️", "🚆", "🛳️", "🚀", "🗺️", "🏝️", "🏔️", "🏕️", "🏙️", "🧳"],
  Objects: ["📱", "💻", "⌚", "🎧", "📷", "💡", "🔑", "🧠", "💎", "🛠️", "📌", "📦"],
  Symbols: ["❤️", "✅", "❌", "⚠️", "🔔", "⭐", "💯", "♻️", "☮️", "☑️", "➕", "➖"],
  Flags: ["🏳️", "🏴", "🏁", "🇺🇸", "🇬🇧", "🇨🇦", "🇫🇷", "🇩🇪", "🇯🇵", "🇰🇷", "🇮🇳", "🇧🇷"],
} as const

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs"

/** Composable message input with file attachments, emoji picker, @mention autocomplete, and reply-to indicator. */
export function MessageInput({ channelName, draft, replyTo, onCancelReply, onSend, onDraftChange, onTyping, onSent }: Props) {
  const [content, setContent] = useState(draft)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showComposerMenu, setShowComposerMenu] = useState(false)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif">("emoji")
  const [gifQuery, setGifQuery] = useState("")
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; previewUrl: string; gifUrl: string; url: string | null }>>([])
  const [gifLoading, setGifLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const composerMenuRef = useRef<HTMLDivElement>(null)
  const pollCreatorRef = useRef<HTMLDivElement>(null)
  const composerMenuButtonRef = useRef<HTMLButtonElement>(null)
  const fileUrlCache = useRef(new Map<File, string>())

  // Mention autocomplete
  const { activeServerId, members: membersByServer } = useAppStore(
    useShallow((s) => ({ activeServerId: s.activeServerId, members: s.members }))
  )
  const members = activeServerId ? membersByServer[activeServerId] ?? [] : []
  const mention = useMentionAutocomplete({ content, cursorPosition, members })

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

  useEffect(() => {
    setContent(draft)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = "auto"
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
    if (!showComposerMenu && !showPollCreator) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const clickedInsideMenu = composerMenuRef.current?.contains(target)
      const clickedInsidePollCreator = pollCreatorRef.current?.contains(target)
      const clickedToggleButton = composerMenuButtonRef.current?.contains(target)
      if (!clickedInsideMenu && !clickedInsidePollCreator && !clickedToggleButton) {
        setShowComposerMenu(false)
        setShowPollCreator(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [showComposerMenu, showPollCreator])

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
        const res = await fetch(endpoint, { signal: controller.signal })
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
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [showEmojiPicker, pickerTab, gifQuery])

  async function handleSend() {
    if ((!content.trim() && files.length === 0) || sending) return
    setSending(true)
    setSendError(null)
    setUploadProgress(files.length > 0 ? 0 : null)
    onSent?.()
    try {
      await onSend(content, files, (percent) => setUploadProgress(percent))
      setContent("")
      onDraftChange("")
      for (const url of fileUrlCache.current.values()) URL.revokeObjectURL(url)
      fileUrlCache.current.clear()
      setFiles([])
    } catch (error: any) {
      setSendError(error?.message ?? "Message send failed. Try again.")
    } finally {
      setSending(false)
      setUploadProgress(null)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mentionHandledNavigation = mention.handleKeyDown(e)
    const selected = mention.filteredMembers[mention.selectedIndex]
    const action = resolveComposerKeybinding(e.key, e.shiftKey, {
      isMentionOpen: mention.isOpen,
      hasMentionSelection: Boolean(selected),
      hasDraftContent: content.length > 0,
      mentionHandledNavigation,
    })

    if (action.preventDefault) {
      e.preventDefault()
    }

    if (action.acceptMention && selected) {
      insertMention(selected)
      return
    }

    if (action.closeMention) {
      mention.close()
      return
    }

    if (action.clearDraft) {
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
    onDraftChange(e.target.value)
    setCursorPosition(e.target.selectionStart)
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
    if (e.target.value) onTyping?.()
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCursorPosition(e.currentTarget.selectionStart)
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
    setShowComposerMenu(false)
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
          <span className="font-semibold text-white">
            {replyTo.author?.display_name || replyTo.author?.username}
          </span>
          <span className="truncate flex-1" style={{ color: "var(--theme-text-muted)" }}>
            {replyTo.content}
          </span>
          <button onClick={onCancelReply} style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-3 h-3 hover:text-white" />
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
                  style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)", borderColor: "#111214" }}
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
                <X className="w-3 h-3 text-white" />
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
              <p className="text-[10px] mt-1" style={{ color: "var(--theme-text-muted)" }}>Uploading attachments… {Math.round(uploadProgress)}%</p>
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
            <button type="button" onClick={() => setShowPollCreator(false)} style={{ color: "var(--theme-text-muted)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            value={pollQuestion}
            onChange={(event) => setPollQuestion(event.target.value)}
            placeholder="Poll question"
            className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
          />
          <div className="space-y-1.5">
            {pollOptions.map((option, index) => (
              <input
                key={`poll-option-${index}`}
                value={option}
                onChange={(event) => {
                  const next = [...pollOptions]
                  next[index] = event.target.value
                  setPollOptions(next)
                }}
                placeholder={`Option ${index + 1}`}
                className="w-full px-2 py-1.5 rounded text-sm focus:outline-none"
                style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
              />
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
              disabled={pollQuestion.trim().length === 0 || pollOptions.filter((option) => option.trim().length > 0).length < 2}
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
          "flex items-end gap-2 rounded-lg px-3 py-2",
          replyTo || files.length > 0 || uploadProgress !== null || Boolean(sendError) ? "rounded-t-none" : ""
        )}
        style={{ background: "var(--theme-surface-input)" }}
      >
        <div className="relative mb-1">
          <button
            ref={composerMenuButtonRef}
            onClick={() => {
              setShowComposerMenu((prev) => !prev)
              setShowPollCreator(false)
            }}
            className="motion-interactive motion-press flex-shrink-0 hover:text-white"
            style={{ color: "var(--theme-text-secondary)" }}
            title="Add to message"
          >
            <Plus className="w-5 h-5" />
          </button>
          {showComposerMenu && (
            <div
              ref={composerMenuRef}
              className="absolute bottom-8 left-0 rounded-lg p-1.5 shadow-xl z-50 min-w-44"
              style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
            >
              <button
                type="button"
                onClick={() => {
                  fileRef.current?.click()
                  setShowComposerMenu(false)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-white/10"
                style={{ color: "var(--theme-text-primary)" }}
              >
                <FileUp className="w-3.5 h-3.5" /> Attach file
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowComposerMenu(false)
                  setShowPollCreator(true)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-white/10"
                style={{ color: "var(--theme-text-primary)" }}
              >
                <BarChart3 className="w-3.5 h-3.5" /> Create poll
              </button>
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

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={handleSelect}
            placeholder={replyTo
              ? `Reply in #${channelName} — press Enter to send, Shift+Enter for newline`
              : `Message #${channelName} — use @ to mention teammates`
            }
            rows={1}
            className="w-full resize-none bg-transparent text-sm focus:outline-none py-1"
            style={{ color: "var(--theme-text-normal)", maxHeight: "200px", lineHeight: "1.5" }}
          />
        </div>

        {/* Emoji picker toggle */}
        <div className="relative flex-shrink-0 mb-1">
          <button
            ref={emojiButtonRef}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="motion-interactive motion-press hover:text-white"
            style={{ color: "var(--theme-text-secondary)" }}
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              data-state="open"
              className="panel-surface-motion absolute bottom-8 right-0 p-2 rounded-lg shadow-xl z-50"
              style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)", width: "320px" }}
            >
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={() => setPickerTab("emoji")}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ background: pickerTab === "emoji" ? "var(--theme-accent)" : "transparent", color: "var(--theme-text-primary)" }}
                >
                  Emoji
                </button>
                <button
                  onClick={() => setPickerTab("gif")}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ background: pickerTab === "gif" ? "var(--theme-accent)" : "transparent", color: "var(--theme-text-primary)" }}
                >
                  GIFs
                </button>
              </div>

              {pickerTab === "emoji" ? (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                  {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                    <div key={category}>
                      <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--theme-text-muted)" }}>{category}</p>
                      <div className="grid grid-cols-8 gap-1">
                        {emojis.map((emoji) => (
                          <button
                            key={`${category}-${emoji}`}
                            onClick={() => {
                              const next = content + emoji
                              setContent(next)
                              setCursorPosition(next.length)
                              onDraftChange(next)
                              setShowEmojiPicker(false)
                              textareaRef.current?.focus()
                            }}
                            className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-lg"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    placeholder="Search GIFs"
                    className="w-full px-2 py-1.5 rounded text-xs focus:outline-none"
                    style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                  />
                  {!process.env.NEXT_PUBLIC_GIPHY_API_KEY ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                      Add NEXT_PUBLIC_GIPHY_API_KEY to enable GIF search.
                    </p>
                  ) : gifLoading ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Loading GIFs…</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
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
                          className="rounded overflow-hidden hover:opacity-90"
                          title={gif.title}
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
        </div>

        {/* Send button */}
        {(content.trim() || files.length > 0) && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="motion-interactive motion-press flex-shrink-0 mb-1 hover:text-white"
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
