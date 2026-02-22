"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Reply, Edit2, Trash2, Smile, Clipboard, Hash } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { UserProfilePopover } from "@/components/user-profile-popover"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import type { MessageWithAuthor, AttachmentRow } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import { LinkEmbed, extractFirstUrl } from "@/components/chat/link-embed"
import { ServerEmojiImage } from "@/components/chat/server-emoji-context"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"]

interface Props {
  message: MessageWithAuthor
  isGrouped: boolean
  currentUserId: string
  onReply: () => void
  onEdit: (content: string) => Promise<void>
  onDelete: () => Promise<void>
  onReaction: (emoji: string) => Promise<void>
}

export function MessageItem({
  message,
  isGrouped,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReaction,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? "")
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const { toast } = useToast()
  const isOwn = message.author_id === currentUserId

  function confirmDelete() {
    if (window.confirm("Are you sure you want to delete this message? This cannot be undone.")) {
      onDelete()
    }
  }

  const displayName =
    message.author?.display_name || message.author?.username || "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()
  const timestamp = new Date(message.created_at)

  // Group reactions by emoji
  const reactionGroups = message.reactions.reduce(
    (acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasOwn: false }
      acc[r.emoji].count++
      acc[r.emoji].users.push(r.user_id)
      if (r.user_id === currentUserId) acc[r.emoji].hasOwn = true
      return acc
    },
    {} as Record<string, { count: number; users: string[]; hasOwn: boolean }>
  )

  async function handleEditSubmit() {
    if (editContent.trim() && editContent !== message.content) {
      await onEdit(editContent.trim())
    }
    setIsEditing(false)
  }

  function renderInline(text: string, keyOffset: number): React.ReactNode[] {
    // bold, italic, underline, strikethrough, inline-code, URL, mention, spoiler, :server_emoji:
    const pattern = /(https?:\/\/[^\s>]+|\*\*([\s\S]*?)\*\*|\*([\s\S]*?)\*|__([\s\S]*?)__|~~([\s\S]*?)~~|`([^`\n]+)`|<@(\w+)>|\|\|([\s\S]*?)\|\||:([a-z0-9_]+):)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = keyOffset

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
      const full = match[0]
      if (/^https?:\/\//.test(full)) {
        parts.push(<a key={key++} href={full} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#00a8fc" }}>{full}</a>)
      } else if (match[2] !== undefined) {
        parts.push(<strong key={key++}>{match[2]}</strong>)
      } else if (match[3] !== undefined) {
        parts.push(<em key={key++}>{match[3]}</em>)
      } else if (match[4] !== undefined) {
        parts.push(<u key={key++}>{match[4]}</u>)
      } else if (match[5] !== undefined) {
        parts.push(<s key={key++}>{match[5]}</s>)
      } else if (match[6] !== undefined) {
        parts.push(<code key={key++} className="px-1 py-0.5 rounded text-sm" style={{ background: "rgba(0,0,0,0.3)", fontFamily: "monospace" }}>{match[6]}</code>)
      } else if (match[7] !== undefined) {
        parts.push(<span key={key++} className="px-0.5 rounded" style={{ color: "#5865f2", background: "rgba(88,101,242,0.1)" }}>@{match[7]}</span>)
      } else if (match[8] !== undefined) {
        parts.push(<SpoilerSpan key={key++}>{match[8]}</SpoilerSpan>)
      } else if (match[9] !== undefined) {
        parts.push(<ServerEmojiImage key={key++} name={match[9]} />)
      }
      lastIndex = match.index + full.length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }

  function renderTextBlock(text: string, keyOffset: number): React.ReactNode[] {
    const lines = text.split("\n")
    const result: React.ReactNode[] = []
    let key = keyOffset
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (/^>\s?/.test(line)) {
        const quoteLines: string[] = []
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""))
          i++
        }
        result.push(
          <blockquote key={`bq-${key++}`} className="pl-3 my-1" style={{ borderLeft: "4px solid #4e5058", color: "#b5bac1" }}>
            {quoteLines.map((ql, qi) => <div key={qi}>{renderInline(ql, key + qi * 100)}</div>)}
          </blockquote>
        )
      } else {
        const inlined = renderInline(line, key)
        key += 100
        if (i < lines.length - 1) {
          result.push(<span key={`ln-${key++}`}>{inlined}<br /></span>)
        } else {
          result.push(<span key={`ln-${key++}`}>{inlined}</span>)
        }
        i++
      }
    }
    return result
  }

  function renderContent(content: string): React.ReactNode {
    const segments: React.ReactNode[] = []
    let keyCounter = 0
    let lastEnd = 0
    // Split out fenced code blocks first
    const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g
    let cbMatch: RegExpExecArray | null
    while ((cbMatch = codeBlockRe.exec(content)) !== null) {
      const before = content.slice(lastEnd, cbMatch.index)
      if (before) {
        for (const node of renderTextBlock(before, keyCounter)) { segments.push(node); keyCounter++ }
      }
      const lang = cbMatch[1] || ""
      const code = cbMatch[2].trimEnd()
      segments.push(
        <pre key={`cb-${keyCounter++}`} className="my-1 p-3 rounded overflow-x-auto text-sm" style={{ background: "#1e1f22", fontFamily: "monospace", color: "#dcddde", border: "1px solid #232428" }}>
          {lang && <div className="text-xs mb-1" style={{ color: "#5865f2", fontFamily: "sans-serif" }}>{lang}</div>}
          <code>{code}</code>
        </pre>
      )
      lastEnd = cbMatch.index + cbMatch[0].length
    }
    const remaining = content.slice(lastEnd)
    if (remaining) {
      for (const node of renderTextBlock(remaining, keyCounter)) { segments.push(node); keyCounter++ }
    }
    return segments
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "relative group px-4 message-hover",
            isGrouped ? "py-0.5" : "pt-4 pb-0.5"
          )}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false) }}
        >
          {/* Reply reference */}
          {message.reply_to_id && message.reply_to && (
            <div className="flex items-center gap-2 mb-1 ml-10 text-xs" style={{ color: '#949ba4' }}>
              <Reply className="w-3 h-3 -scale-x-100" />
              <span className="font-medium" style={{ color: '#b5bac1' }}>
                {message.reply_to.author?.display_name || message.reply_to.author?.username}
              </span>
              <span className="truncate">{message.reply_to.content}</span>
            </div>
          )}

          <div className="flex gap-3">
            {/* Avatar or timestamp gutter */}
            <div className="w-10 flex-shrink-0">
              {!isGrouped ? (
                <UserProfilePopover
                  user={message.author}
                  displayName={displayName}
                  status={message.author?.status}
                  side="right"
                  align="start"
                >
                  <div className="cursor-pointer">
                    <Avatar className="w-10 h-10">
                      {message.author?.avatar_url && (
                        <AvatarImage src={message.author.avatar_url} />
                      )}
                      <AvatarFallback
                        style={{ background: "#5865f2", color: "white", fontSize: "14px" }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </UserProfilePopover>
              ) : (
                <span
                  className="text-xs opacity-0 group-hover:opacity-100 transition-opacity pt-1 block text-right pr-1"
                  style={{ color: "#4e5058", fontSize: "10px" }}
                >
                  {format(timestamp, "HH:mm")}
                </span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {!isGrouped && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <UserProfilePopover
                    user={message.author}
                    displayName={displayName}
                    status={message.author?.status}
                    side="right"
                    align="start"
                  >
                    <span className="font-semibold text-white hover:underline cursor-pointer">
                      {displayName}
                    </span>
                  </UserProfilePopover>
                  <span className="text-xs" style={{ color: "#4e5058" }}>
                    {format(timestamp, "MM/dd/yyyy h:mm a")}
                  </span>
                  {message.edited_at && (
                    <span className="text-xs" style={{ color: "#4e5058" }}>
                      (edited)
                    </span>
                  )}
                </div>
              )}

              {isEditing ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleEditSubmit()
                      }
                      if (e.key === "Escape") {
                        setIsEditing(false)
                        setEditContent(message.content ?? "")
                      }
                    }}
                    className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none"
                    style={{
                      background: "#1e1f22",
                      color: "#f2f3f5",
                      border: "1px solid #5865f2",
                    }}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1 text-xs" style={{ color: "#949ba4" }}>
                    <span>ESC to cancel</span>
                    <span>·</span>
                    <button
                      onClick={handleEditSubmit}
                      style={{ color: "#00a8fc" }}
                    >
                      Enter to save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {message.content && (
                    <p
                      className="text-sm leading-relaxed message-content break-words"
                      style={{ color: "#dcddde" }}
                    >
                      {renderContent(message.content)}
                    </p>
                  )}

                  {/* Link embed — shown for messages with a URL and no image attachments */}
                  {message.content && (!message.attachments?.length) && (() => {
                    const url = extractFirstUrl(message.content)
                    return url ? <LinkEmbed url={url} /> : null
                  })()}

                  {/* Attachments */}
                  {message.attachments?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.attachments.map((attachment) => (
                        <AttachmentDisplay key={attachment.id} attachment={attachment} />
                      ))}
                    </div>
                  )}

                  {/* Reactions */}
                  {Object.entries(reactionGroups).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
                        <button
                          key={emoji}
                          onClick={() => onReaction(emoji)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors"
                          style={{
                            background: hasOwn
                              ? "rgba(88,101,242,0.3)"
                              : "rgba(255,255,255,0.06)",
                            border: `1px solid ${hasOwn ? "#5865f2" : "transparent"}`,
                            color: "#dcddde",
                          }}
                        >
                          {emoji} {count}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {showActions && !isEditing && (
            <div
              className="absolute right-4 -top-4 flex items-center rounded shadow-lg overflow-hidden"
              style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}
            >
              {/* Quick reactions */}
              {showEmojiPicker && (
                <div className="flex items-center px-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReaction(emoji); setShowEmojiPicker(false) }}
                      className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-sm transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: "#b5bac1" }}
                title="Add Reaction"
              >
                <Smile className="w-4 h-4" />
              </button>

              <button
                onClick={onReply}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: "#b5bac1" }}
                title="Reply"
              >
                <Reply className="w-4 h-4" />
              </button>

              {isOwn && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                  style={{ color: "#b5bac1" }}
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              {isOwn && (
                <button
                  onClick={confirmDelete}
                  className="w-8 h-8 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                  style={{ color: "#f23f43" }}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onReply}>
          <Reply className="w-4 h-4 mr-2" /> Reply
        </ContextMenuItem>
        {isOwn && (
          <ContextMenuItem onClick={() => setIsEditing(true)}>
            <Edit2 className="w-4 h-4 mr-2" /> Edit Message
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {message.content && (
          <ContextMenuItem onClick={() => {
            navigator.clipboard.writeText(message.content!)
            toast({ title: "Text copied!" })
          }}>
            <Clipboard className="w-4 h-4 mr-2" /> Copy Text
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(message.id)
          toast({ title: "Message ID copied!" })
        }}>
          <Hash className="w-4 h-4 mr-2" /> Copy Message ID
        </ContextMenuItem>
        {isOwn && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={confirmDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Message
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function AttachmentDisplay({ attachment }: { attachment: AttachmentRow }) {
  const isImage = attachment.content_type?.startsWith("image/")

  if (isImage) {
    return (
      <div className="max-w-sm">
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="rounded max-h-80 object-contain"
          style={{ background: "#1e1f22" }}
        />
      </div>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded max-w-sm transition-colors hover:bg-white/5"
      style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}
    >
      <div
        className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: "#5865f2" }}
      >
        <span className="text-white text-xs font-bold">
          {attachment.filename.split(".").pop()?.toUpperCase().slice(0, 4)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {attachment.filename}
        </div>
        <div className="text-xs" style={{ color: "#949ba4" }}>
          {(attachment.size / 1024).toFixed(1)} KB
        </div>
      </div>
    </a>
  )
}

function SpoilerSpan({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      onClick={() => setRevealed(true)}
      className="rounded px-0.5 cursor-pointer select-none"
      style={{
        background: revealed ? "rgba(255,255,255,0.1)" : "#2b2d31",
        color: revealed ? "#dcddde" : "transparent",
        transition: "color 0.1s",
      }}
      title={revealed ? undefined : "Click to reveal spoiler"}
    >
      {children}
    </span>
  )
}
