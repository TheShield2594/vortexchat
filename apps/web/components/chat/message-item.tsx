"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Reply, Edit2, Trash2, Smile } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"]

interface Attachment {
  id: string
  url: string
  filename: string
  size: number
  content_type: string | null
}

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
  const isOwn = message.author_id === currentUserId

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

  return (
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
        <div className="flex items-center gap-2 mb-1 ml-10 text-xs text-vortex-interactive">
          <Reply className="w-3 h-3 -scale-x-100" />
          <span className="font-medium text-vortex-text-secondary">
            {message.reply_to.author?.display_name || message.reply_to.author?.username}
          </span>
          <span className="truncate">{message.reply_to.content}</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar or timestamp gutter */}
        <div className="w-10 flex-shrink-0">
          {!isGrouped ? (
            <Avatar className="w-10 h-10">
              {message.author?.avatar_url && (
                <AvatarImage src={message.author.avatar_url} />
              )}
              <AvatarFallback className="bg-vortex-accent text-white text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-[10px] text-vortex-text-muted opacity-0 group-hover:opacity-100 transition-opacity pt-1 block text-right pr-1">
              {format(timestamp, "HH:mm")}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-white hover:underline cursor-pointer">
                {displayName}
              </span>
              <span className="text-xs text-vortex-text-muted">
                {format(timestamp, "MM/dd/yyyy h:mm a")}
              </span>
              {message.edited_at && (
                <span className="text-xs text-vortex-text-muted">(edited)</span>
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
                className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none bg-vortex-bg-tertiary text-vortex-text-primary border border-vortex-accent"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 mt-1 text-xs text-vortex-interactive">
                <span>ESC to cancel</span>
                <span>·</span>
                <button onClick={handleEditSubmit} className="text-vortex-link">
                  Enter to save
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.content && (
                <p className="text-sm leading-relaxed message-content break-words text-vortex-interactive-hover">
                  {renderContent(message.content)}
                </p>
              )}

              {/* Attachments */}
              {message.attachments?.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.attachments.map((attachment: Attachment) => (
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
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors text-vortex-interactive-hover",
                        hasOwn
                          ? "bg-vortex-accent/30 border border-vortex-accent"
                          : "bg-white/[0.06] border border-transparent"
                      )}
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
        <div className="absolute right-4 -top-4 flex items-center rounded shadow-lg overflow-hidden bg-vortex-bg-secondary border border-vortex-bg-tertiary">
          {showEmojiPicker && (
            <div className="flex items-center px-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(emoji); setShowEmojiPicker(false) }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-sm transition-colors"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors text-vortex-text-secondary"
            aria-label="Add Reaction"
          >
            <Smile className="w-4 h-4" />
          </button>

          <button
            onClick={onReply}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors text-vortex-text-secondary"
            aria-label="Reply"
          >
            <Reply className="w-4 h-4" />
          </button>

          {isOwn && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors text-vortex-text-secondary"
              aria-label="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}

          {isOwn && (
            <button
              onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center hover:bg-red-500/20 transition-colors text-vortex-danger"
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Safely render message content as React elements (no dangerouslySetInnerHTML) */
function renderContent(content: string): React.ReactNode[] {
  const result: React.ReactNode[] = []
  const tokenRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\~\~(.+?)\~\~)|(`(.+?)`)|(<@(\w+)>)|(https?:\/\/[^\s<>]+)/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      result.push(content.slice(lastIndex, match.index))
    }

    if (match[2]) {
      result.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[4]) {
      result.push(<em key={key++}>{match[4]}</em>)
    } else if (match[6]) {
      result.push(<s key={key++}>{match[6]}</s>)
    } else if (match[8]) {
      result.push(
        <code key={key++} className="bg-vortex-bg-tertiary px-1 rounded text-xs">{match[8]}</code>
      )
    } else if (match[10]) {
      result.push(
        <span key={key++} className="text-vortex-accent bg-vortex-mention px-0.5 rounded-sm">@{match[10]}</span>
      )
    } else if (match[0].startsWith("http")) {
      result.push(
        <a key={key++} href={match[0]} target="_blank" rel="noopener noreferrer" className="text-vortex-link hover:underline">{match[0]}</a>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex))
  }

  return result
}

function AttachmentDisplay({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.content_type?.startsWith("image/")

  if (isImage) {
    return (
      <div className="max-w-sm">
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="rounded max-h-80 object-contain bg-vortex-bg-tertiary"
        />
      </div>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded max-w-sm transition-colors hover:bg-white/5 bg-vortex-bg-secondary border border-vortex-bg-tertiary"
    >
      <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-vortex-accent">
        <span className="text-white text-xs font-bold">
          {attachment.filename.split(".").pop()?.toUpperCase().slice(0, 4)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">{attachment.filename}</div>
        <div className="text-xs text-vortex-interactive">{(attachment.size / 1024).toFixed(1)} KB</div>
      </div>
    </a>
  )
}
