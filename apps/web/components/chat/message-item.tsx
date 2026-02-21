"use client"

import { useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { Reply, Edit2, Trash2, MoreHorizontal, Smile, Pin, PinOff } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { MessageWithAuthor } from "@/types/database"
import { cn } from "@/lib/utils/cn"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"]

interface Props {
  message: MessageWithAuthor
  isGrouped: boolean
  currentUserId: string
  canManage?: boolean
  onReply: () => void
  onEdit: (content: string) => Promise<void>
  onDelete: () => Promise<void>
  onReaction: (emoji: string) => Promise<void>
  onPin?: () => Promise<void>
}

export function MessageItem({
  message,
  isGrouped,
  currentUserId,
  canManage,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onPin,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? "")
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const isOwn = message.author_id === currentUserId
  const isMentioned =
    (message.mentions ?? []).includes(currentUserId) ||
    message.mention_everyone

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

  function renderContent(content: string) {
    // Escape HTML to prevent XSS, then apply safe markdown transforms
    const safe = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

    return safe
      // Code blocks (before inline code so ``` doesn't get eaten)
      .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) =>
        `<pre style="background:#1e1f22;border-radius:4px;padding:8px 12px;overflow-x:auto;margin:4px 0;font-size:0.85em;white-space:pre-wrap"><code>${code.trimEnd()}</code></pre>`
      )
      // Inline code
      .replace(/`([^`\n]+)`/g, '<code style="background:#1e1f22;padding:1px 5px;border-radius:3px;font-size:0.9em;font-family:monospace">$1</code>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      // Underline
      .replace(/__(.*?)__/g, "<u>$1</u>")
      // Strikethrough
      .replace(/~~(.*?)~~/g, "<s>$1</s>")
      // Spoiler — hidden until clicked
      .replace(/\|\|(.*?)\|\|/g, '<span onclick="this.style.color=\'#dcddde\';this.style.background=\'transparent\'" style="background:#1e1f22;color:#1e1f22;border-radius:3px;padding:0 3px;cursor:pointer" title="Click to reveal">$1</span>')
      // Blockquote (line starting with &gt; after escaping)
      .replace(/^&gt; (.+)$/gm, '<div style="border-left:4px solid #4e5058;padding-left:8px;margin:2px 0;color:#b5bac1">$1</div>')
      // @mention pills
      .replace(/@(everyone|here)/g, '<span style="color:#fff;background:rgba(250,166,26,0.3);padding:0 3px;border-radius:3px;font-weight:500">@$1</span>')
      .replace(/@(\w+)/g, '<span style="color:#5865f2;background:rgba(88,101,242,0.15);padding:0 3px;border-radius:3px;font-weight:500">@$1</span>')
      // Auto-link URLs
      .replace(/https?:\/\/[^\s&<>"]+/g, (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#00a8fc;text-decoration:underline">${url}</a>`
      )
  }

  return (
    <div
      className={cn(
        "relative group px-4 message-hover",
        isGrouped ? "py-0.5" : "pt-4 pb-0.5",
        isMentioned ? "mention-highlight" : ""
      )}
      style={isMentioned ? {
        background: "rgba(250, 166, 26, 0.05)",
        borderLeft: "2px solid #f9a31a",
      } : undefined}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false) }}
    >
      {/* Pinned indicator */}
      {(message as any).pinned && (
        <div className="flex items-center gap-1 mb-1 text-xs" style={{ color: "#f0b232" }}>
          <Pin className="w-3 h-3" />
          <span>Pinned message</span>
        </div>
      )}

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
              <span className="font-semibold text-white hover:underline cursor-pointer">
                {displayName}
              </span>
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
                  dangerouslySetInnerHTML={{
                    __html: renderContent(message.content),
                  }}
                />
              )}

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

          {(isOwn || canManage) && onPin && (
            <button
              onClick={onPin}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: (message as any).pinned ? "#f0b232" : "#b5bac1" }}
              title={(message as any).pinned ? "Unpin" : "Pin"}
            >
              {(message as any).pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          )}

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
              onClick={onDelete}
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
  )
}

function AttachmentDisplay({ attachment }: { attachment: any }) {
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
