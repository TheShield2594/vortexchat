"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, Send, X, Smile, Reply } from "lucide-react"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"

interface Props {
  channelName: string
  replyTo: MessageWithAuthor | null
  onCancelReply: () => void
  onSend: (content: string, files?: File[]) => Promise<void>
}

const COMMON_EMOJIS = ["😀", "😂", "❤️", "👍", "👎", "🔥", "✅", "🎉", "🤔", "👀", "😭", "💯"]

export function MessageInput({ channelName, replyTo, onCancelReply, onSend }: Props) {
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewUrlsRef = useRef<string[]>([])

  // Revoke blob URLs on cleanup or when files change
  useEffect(() => {
    // Revoke old URLs
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    // Create new URLs
    previewUrlsRef.current = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f))

    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
    }
  }, [files])

  async function handleSend() {
    if ((!content.trim() && files.length === 0) || sending) return
    setSending(true)
    try {
      await onSend(content, files)
      setContent("")
      setFiles([])
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }

  // Get preview URL for image file at index (only counting image files)
  function getPreviewUrl(fileIndex: number): string | undefined {
    let imageIdx = 0
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        if (i === fileIndex) return previewUrlsRef.current[imageIdx]
        imageIdx++
      }
    }
    return undefined
  }

  return (
    <div className="px-4 pb-4 flex-shrink-0" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-t text-xs bg-vortex-bg-secondary border-b border-vortex-bg-tertiary">
          <Reply className="w-3 h-3 -scale-x-100 text-vortex-interactive" />
          <span className="text-vortex-interactive">Replying to</span>
          <span className="font-semibold text-white">
            {replyTo.author?.display_name || replyTo.author?.username}
          </span>
          <span className="truncate flex-1 text-vortex-interactive">
            {replyTo.content}
          </span>
          <button onClick={onCancelReply} className="text-vortex-interactive hover:text-white" aria-label="Cancel reply">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex gap-2 p-2 flex-wrap rounded-t bg-vortex-bg-secondary border-b border-vortex-bg-tertiary">
          {files.map((file, i) => (
            <div key={i} className="relative group">
              {file.type.startsWith("image/") ? (
                <img
                  src={getPreviewUrl(i)}
                  alt={file.name}
                  className="w-20 h-20 object-cover rounded"
                />
              ) : (
                <div className="w-20 h-20 rounded flex items-center justify-center text-xs text-center p-1 bg-vortex-bg-tertiary text-vortex-text-secondary">
                  {file.name}
                </div>
              )}
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-vortex-danger"
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg px-3 py-2 bg-[#383a40]",
          (replyTo || files.length > 0) && "rounded-t-none"
        )}
      >
        {/* Attach file */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-shrink-0 mb-1 text-vortex-text-secondary hover:text-white transition-colors"
          aria-label="Attach file"
        >
          <Plus className="w-5 h-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={`Message #${channelName}`}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm focus:outline-none py-1 text-[#dcddde] leading-relaxed max-h-[200px]"
        />

        {/* Emoji picker toggle */}
        <div className="relative flex-shrink-0 mb-1">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-vortex-text-secondary hover:text-white transition-colors"
            aria-label="Emoji picker"
          >
            <Smile className="w-5 h-5" />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-8 right-0 p-2 rounded-lg shadow-xl z-50 grid grid-cols-6 gap-1 w-[200px] bg-vortex-bg-secondary border border-vortex-bg-tertiary">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setContent((prev) => prev + emoji)
                    setShowEmojiPicker(false)
                    textareaRef.current?.focus()
                  }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Send button */}
        {(content.trim() || files.length > 0) && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-shrink-0 mb-1 text-vortex-accent hover:text-white transition-colors"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
