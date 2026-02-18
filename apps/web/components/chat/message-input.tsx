"use client"

import { useState, useRef, useCallback } from "react"
import { Plus, Send, X, Paperclip, Smile, Reply } from "lucide-react"
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

  return (
    <div className="px-4 pb-4 flex-shrink-0" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Reply indicator */}
      {replyTo && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t text-xs"
          style={{ background: "#2b2d31", borderBottom: "1px solid #1e1f22" }}
        >
          <Reply className="w-3 h-3 -scale-x-100" style={{ color: "#949ba4" }} />
          <span style={{ color: "#949ba4" }}>Replying to</span>
          <span className="font-semibold text-white">
            {replyTo.author?.display_name || replyTo.author?.username}
          </span>
          <span className="truncate flex-1" style={{ color: "#949ba4" }}>
            {replyTo.content}
          </span>
          <button onClick={onCancelReply} style={{ color: "#949ba4" }}>
            <X className="w-3 h-3 hover:text-white" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div
          className="flex gap-2 p-2 flex-wrap rounded-t"
          style={{ background: "#2b2d31", borderBottom: "1px solid #1e1f22" }}
        >
          {files.map((file, i) => (
            <div key={i} className="relative group">
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-20 h-20 object-cover rounded"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded flex items-center justify-center text-xs text-center p-1"
                  style={{ background: "#1e1f22", color: "#b5bac1" }}
                >
                  {file.name}
                </div>
              )}
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "#f23f43" }}
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
          "flex items-end gap-2 rounded-lg px-3 py-2",
          replyTo || files.length > 0 ? "rounded-t-none" : ""
        )}
        style={{ background: "#383a40" }}
      >
        {/* Attach file */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-shrink-0 mb-1 hover:text-white transition-colors"
          style={{ color: "#b5bac1" }}
          title="Attach File"
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
          className="flex-1 resize-none bg-transparent text-sm focus:outline-none py-1"
          style={{ color: "#dcddde", maxHeight: "200px", lineHeight: "1.5" }}
        />

        {/* Emoji picker toggle */}
        <div className="relative flex-shrink-0 mb-1">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="hover:text-white transition-colors"
            style={{ color: "#b5bac1" }}
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          {showEmojiPicker && (
            <div
              className="absolute bottom-8 right-0 p-2 rounded-lg shadow-xl z-50 grid grid-cols-6 gap-1"
              style={{ background: "#2b2d31", border: "1px solid #1e1f22", width: "200px" }}
            >
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
            className="flex-shrink-0 mb-1 hover:text-white transition-colors"
            style={{ color: "#5865f2" }}
            title="Send Message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
