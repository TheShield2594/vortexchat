"use client"

import { memo, useId, useState } from "react"
import { format } from "date-fns"
import { Reply, Edit2, Trash2, Smile, Clipboard, Hash, MessageSquare, AlertCircle, Clock3, Loader2, RefreshCcw, CheckSquare } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { UserProfilePopover } from "@/components/user-profile-popover"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import type { MessageWithAuthor, AttachmentRow, ThreadRow } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { LinkEmbed, extractFirstUrl, extractGiphyUrl, getEmbeddableGiphyUrl, stripUrlFromContent } from "@/components/chat/link-embed"
import { WorkspaceReferenceEmbed, extractWorkspaceReference } from "@/components/chat/workspace-reference-embed"
import { ServerEmojiImage } from "@/components/chat/server-emoji-context"
import { CreateThreadModal } from "@/components/modals/create-thread-modal"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"]

interface Props {
  message: MessageWithAuthor
  containerId?: string
  highlighted?: boolean
  isGrouped: boolean
  currentUserId: string
  onReply: () => void
  onEdit: (content: string) => Promise<void>
  onDelete: () => Promise<void>
  onReaction: (emoji: string) => Promise<void>
  onReplyJump?: (messageId: string) => void
  onThreadCreated?: (thread: ThreadRow) => void
  sendState?: "queued" | "sending" | "failed"
  onRetry?: () => void
}

/** Memoized message bubble with author info, attachments, reactions, inline editing, thread creation, and context menu actions. */
export const MessageItem = memo(function MessageItem({
  message,
  containerId,
  highlighted = false,
  isGrouped,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onReplyJump,
  onThreadCreated,
  sendState,
  onRetry,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? "")
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const { toast } = useToast()
  const isOwn = message.author_id === currentUserId
  const { activeServerId, membersByServer } = useAppStore(
    useShallow((s) => ({ activeServerId: s.activeServerId, membersByServer: s.members }))
  )
  const memberLookup = activeServerId ? membersByServer[activeServerId] ?? [] : []

  async function confirmDelete() {
    try {
      await onDelete()
      setShowDeleteDialog(false)
      toast({ title: "Message deleted" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to delete message", description: error?.message ?? "Please try again." })
    }
  }

  const displayName =
    message.author?.display_name || message.author?.username || "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()
  const timestamp = new Date(message.created_at)
  const messageMetaId = useId()
  const giphyUrl = message.content ? extractGiphyUrl(message.content) : null
  const embeddableGiphyUrl = giphyUrl ? getEmbeddableGiphyUrl(giphyUrl) : null
  const renderedContent = message.content && giphyUrl && embeddableGiphyUrl
    ? stripUrlFromContent(message.content, giphyUrl)
    : message.content

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
        parts.push(<a key={key++} href={full} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--theme-link)" }}>{full}</a>)
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
        const isSelfMention = match[7] === currentUserId
        parts.push(
          <span
            key={key++}
            className="px-0.5 rounded"
            style={{
              color: isSelfMention ? "var(--theme-mention-self-color)" : "var(--theme-accent)",
              background: isSelfMention ? "var(--theme-mention-self-bg)" : "rgba(88,101,242,0.1)",
              border: isSelfMention ? "1px solid var(--theme-mention-self-border)" : undefined,
            }}
          >
            @{match[7]}
          </span>
        )
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
          <blockquote key={`bq-${key++}`} className="pl-3 my-1" style={{ borderLeft: "4px solid var(--theme-text-faint)", color: "var(--theme-text-secondary)" }}>
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
      const code = cbMatch[2]
      segments.push(
        <pre key={`cb-${keyCounter++}`} className="my-1 p-3 rounded overflow-x-auto text-sm" style={{ background: "var(--theme-bg-tertiary)", fontFamily: "monospace", color: "var(--theme-text-normal)", border: "1px solid #232428" }}>
          {lang && <div className="text-xs mb-1" style={{ color: "var(--theme-accent)", fontFamily: "sans-serif" }}>{lang}</div>}
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
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={containerId}
          className={cn(
            "relative group px-4 message-hover motion-interactive",
            highlighted && "mention-highlight",
            isGrouped ? "py-0.5" : "pt-4 pb-0.5"
          )}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false) }}
          onFocus={() => setShowActions(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setShowActions(false)
              setShowEmojiPicker(false)
            }
          }}
        >
          {/* Reply reference */}
          {message.reply_to_id && message.reply_to && (
            onReplyJump ? (
              <button
                type="button"
                onClick={() => onReplyJump(message.reply_to_id!)}
                className="w-full text-left flex items-center gap-2 mb-1 ml-10 text-xs tertiary-metadata rounded px-1 py-0.5 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-accent)]"
                aria-label="Jump to replied message"
              >
                <Reply className="w-3 h-3 -scale-x-100" />
                <span className="font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                  {message.reply_to.author?.display_name || message.reply_to.author?.username}
                </span>
                <span className="truncate">{message.reply_to.content}</span>
              </button>
            ) : (
              <div
                className="w-full text-left flex items-center gap-2 mb-1 ml-10 text-xs tertiary-metadata rounded px-1 py-0.5"
                aria-hidden={onReplyJump ? true : undefined}
              >
                <Reply className="w-3 h-3 -scale-x-100" />
                <span className="font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                  {message.reply_to.author?.display_name || message.reply_to.author?.username}
                </span>
                <span className="truncate">{message.reply_to.content}</span>
              </div>
            )
          )}

          <div className="flex gap-3">
            {/* Avatar or timestamp gutter */}
            <div className="w-10 flex-shrink-0">
              {!isGrouped ? (
                <UserProfilePopover
                  user={message.author}
                  userId={message.author?.id}
                  currentUserId={currentUserId}
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
                        style={{ background: "var(--theme-accent)", color: "white", fontSize: "14px" }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </UserProfilePopover>
              ) : (
                <div className="pt-1 pr-1 flex items-center justify-end gap-1">
                  <span
                    id={messageMetaId}
                    className="text-xs opacity-0 group-hover:opacity-100 motion-interactive block text-right tertiary-metadata"
                    style={{ fontSize: "10px" }}
                  >
                    {format(timestamp, "HH:mm")}
                  </span>
                  {sendState === "queued" && (
                    <Clock3 className="w-3 h-3" style={{ color: "var(--theme-warning)" }} />
                  )}
                  {sendState === "sending" && (
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--theme-text-muted)" }} />
                  )}
                  {sendState === "failed" && (
                    <AlertCircle className="w-3 h-3" style={{ color: "var(--theme-danger)" }} />
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {!isGrouped && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <UserProfilePopover
                    user={message.author}
                    userId={message.author?.id}
                    currentUserId={currentUserId}
                    displayName={displayName}
                    status={message.author?.status}
                    side="right"
                    align="start"
                  >
                    <span className="font-semibold text-white hover:underline cursor-pointer">
                      {displayName}
                    </span>
                  </UserProfilePopover>
                  <span id={messageMetaId} className="text-xs tertiary-metadata">
                    {format(timestamp, "MM/dd/yyyy h:mm a")}
                  </span>
                  {sendState === "queued" && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--theme-warning)" }}>
                      <Clock3 className="w-3 h-3" /> queued
                    </span>
                  )}
                  {sendState === "sending" && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--theme-text-muted)" }}>
                      <Loader2 className="w-3 h-3 animate-spin" /> sending
                    </span>
                  )}
                  {sendState === "failed" && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--theme-danger)" }}>
                      <AlertCircle className="w-3 h-3" /> failed
                    </span>
                  )}
                  {message.edited_at && (
                    <span className="text-xs tertiary-metadata">
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
                      background: "var(--theme-bg-tertiary)",
                      color: "var(--theme-text-primary)",
                      border: "1px solid var(--theme-accent)",
                    }}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1 text-xs tertiary-metadata">
                    <span>ESC to cancel</span>
                    <span>·</span>
                    <button
                      onClick={handleEditSubmit}
                      className="focus-ring rounded"
                      style={{ color: "var(--theme-link)" }}
                    >
                      Enter to save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {renderedContent && (
                    <p
                      className="text-sm leading-relaxed message-content break-words"
                      style={{ color: "var(--theme-text-normal)" }}
                    >
                      {renderContent(renderedContent)}
                    </p>
                  )}

                  {embeddableGiphyUrl && (
                    <img
                      src={embeddableGiphyUrl}
                      alt="GIF"
                      className="mt-2 max-w-sm w-full rounded-md border"
                      style={{ borderColor: "var(--theme-bg-tertiary)", background: "var(--theme-bg-tertiary)" }}
                    />
                  )}

                  {/* Link embed — shown for messages with a URL and no image attachments */}
                  {message.content && (!message.attachments?.length) && !embeddableGiphyUrl && (() => {
                    const url = extractFirstUrl(message.content)
                    return url ? <LinkEmbed url={url} /> : null
                  })()}

                  {message.content && (() => {
                    const reference = extractWorkspaceReference(message.content)
                    return reference ? <WorkspaceReferenceEmbed type={reference.type} id={reference.id} /> : null
                  })()}

                  {/* Attachments */}
                  {message.attachments?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <AttachmentGallery attachments={message.attachments} />
                    </div>
                  )}

                  {/* Reactions */}
                  {Object.entries(reactionGroups).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(reactionGroups).map(([emoji, { count, hasOwn, users }]) => (
                        <button
                          key={emoji}
                          onClick={() => onReaction(emoji)}
                          title={users
                            .map((id) => {
                              if (id === currentUserId) return "You"
                              const member = memberLookup.find((m) => m.user_id === id)
                              return member?.nickname || member?.display_name || member?.username || "Unknown user"
                            })
                            .join(", ")}
                          className="motion-interactive motion-press flex items-center gap-1 px-2 py-0.5 rounded-full text-sm hover:-translate-y-px"
                          aria-label={`Toggle ${emoji} reaction`}
                          style={{
                            background: hasOwn
                              ? "rgba(88,101,242,0.3)"
                              : "rgba(255,255,255,0.06)",
                            border: `1px solid ${hasOwn ? "var(--theme-accent)" : "transparent"}`,
                            color: "var(--theme-text-normal)",
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
          {!isEditing && (
            <div
              aria-hidden={!showActions}
              inert={!showActions}
              className={cn(
                "action-rail-motion absolute right-4 -top-4 flex items-center rounded shadow-lg overflow-hidden",
                showActions ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"
              )}
              style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
            >
              {/* Quick reactions */}
              {showEmojiPicker && (
                <div className="flex items-center px-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReaction(emoji); setShowEmojiPicker(false) }}
                      className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-sm focus-ring"
                      tabIndex={showActions ? 0 : -1}
                      aria-label={`Add ${emoji} reaction`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                style={{ color: "var(--theme-text-secondary)" }}
                title="Add Reaction"
                aria-label="Add reaction"
                aria-describedby={messageMetaId}
                tabIndex={showActions ? 0 : -1}
              >
                <Smile className="w-4 h-4" />
              </button>

              <button
                onClick={onReply}
                className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                style={{ color: "var(--theme-text-secondary)" }}
                title="Reply"
                aria-label="Reply to message"
                aria-describedby={messageMetaId}
                tabIndex={showActions ? 0 : -1}
              >
                <Reply className="w-4 h-4" />
              </button>

              {onThreadCreated && (
                <button
                  onClick={() => setShowCreateThread(true)}
                  className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                  style={{ color: "var(--theme-text-secondary)" }}
                  title="Create Thread"
                  aria-label="Create thread from message"
                  aria-describedby={messageMetaId}
                  tabIndex={showActions ? 0 : -1}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}

              {isOwn && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                  style={{ color: "var(--theme-text-secondary)" }}
                  title="Edit"
                  aria-label="Edit message"
                  aria-describedby={messageMetaId}
                  tabIndex={showActions ? 0 : -1}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              {sendState === "failed" && onRetry && (
                <button
                  onClick={onRetry}
                  className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                  style={{ color: "var(--theme-warning)" }}
                  title="Retry send"
                  aria-label="Retry sending message"
                  aria-describedby={messageMetaId}
                  tabIndex={showActions ? 0 : -1}
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              )}

              {isOwn && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-red-500/20 focus-ring"
                  style={{ color: "var(--theme-danger)" }}
                  title="Delete"
                  aria-label="Delete message"
                  aria-describedby={messageMetaId}
                  tabIndex={showActions ? 0 : -1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52" aria-label={`Message actions for ${displayName}`}>
        <ContextMenuItem onClick={onReply}>
          <Reply className="w-4 h-4 mr-2" /> Reply
        </ContextMenuItem>
        {onThreadCreated && (
          <ContextMenuItem onClick={() => setShowCreateThread(true)}>
            <MessageSquare className="w-4 h-4 mr-2" /> Create Thread
          </ContextMenuItem>
        )}
        {isOwn && (
          <ContextMenuItem onClick={() => setIsEditing(true)}>
            <Edit2 className="w-4 h-4 mr-2" /> Edit Message
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={async () => {
          const res = await fetch(`/api/messages/${message.id}/task`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
          if (res.ok) {
            const data = await res.json()
            toast({ title: "Task created", description: `Reference: ${data.reference}` })
          } else {
            toast({ variant: "destructive", title: "Unable to convert message to task" })
          }
        }}>
          <CheckSquare className="w-4 h-4 mr-2" /> Convert to Task
        </ContextMenuItem>
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
            <ContextMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Message
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>

    {onThreadCreated && (
      <CreateThreadModal
        open={showCreateThread}
        onClose={() => setShowCreateThread(false)}
        messageId={message.id}
        onCreated={(thread) => {
          setShowCreateThread(false)
          onThreadCreated(thread)
        }}
      />
    )}

    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DialogContent style={{ background: "var(--theme-bg-primary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}>
        <DialogHeader>
          <DialogTitle>Delete message?</DialogTitle>
          <DialogDescription style={{ color: "var(--theme-text-secondary)" }}>
            This action is irreversible. This message will be permanently removed for everyone in this channel.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            Delete message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
})

function AttachmentGallery({ attachments }: { attachments: AttachmentRow[] }) {
  const imageIndexes = attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter((entry) => entry.attachment.content_type?.startsWith("image/"))
    .map((entry) => entry.index)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const openImage = (index: number) => setLightboxIndex(index)
  const closeImage = () => setLightboxIndex(null)

  const currentImageListIndex = lightboxIndex === null ? -1 : imageIndexes.indexOf(lightboxIndex)
  const currentAttachment = lightboxIndex === null ? null : attachments[lightboxIndex]

  function move(direction: 1 | -1) {
    if (currentImageListIndex < 0) return
    const nextIndex = (currentImageListIndex + direction + imageIndexes.length) % imageIndexes.length
    setLightboxIndex(imageIndexes[nextIndex])
  }

  return (
    <>
      {attachments.map((attachment, index) => (
        <AttachmentDisplay key={attachment.id} attachment={attachment} onOpenImage={() => openImage(index)} />
      ))}

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => { if (!open) closeImage() }}>
        <DialogContent
          className="max-w-5xl border"
          style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-secondary)", color: "var(--theme-text-primary)" }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault()
              move(1)
            } else if (event.key === "ArrowLeft") {
              event.preventDefault()
              move(-1)
            }
          }}
        >
          {currentAttachment && (
            <div className="space-y-3">
              <img src={currentAttachment.url} alt={currentAttachment.filename} className="w-full max-h-[75vh] object-contain rounded" />
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--theme-text-secondary)" }}>
                <span>{currentAttachment.filename}</span>
                {imageIndexes.length > 1 && (
                  <span>
                    <button type="button" className="px-2 py-1 rounded hover:bg-white/10" onClick={() => move(-1)}>← Prev</button>
                    <button type="button" className="px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => move(1)}>Next →</button>
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AttachmentDisplay({ attachment, onOpenImage }: { attachment: AttachmentRow; onOpenImage?: () => void }) {
  const isImage = attachment.content_type?.startsWith("image/")

  if (isImage) {
    return (
      <button type="button" className="max-w-sm" onClick={onOpenImage}>
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="rounded max-h-80 object-contain"
          style={{ background: "var(--theme-bg-tertiary)" }}
        />
      </button>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="motion-interactive flex items-center gap-3 p-3 rounded max-w-sm hover:bg-white/5"
      style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
    >
      <div
        className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--theme-accent)" }}
      >
        <span className="text-white text-xs font-bold">
          {attachment.filename.split(".").pop()?.toUpperCase().slice(0, 4)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {attachment.filename}
        </div>
        <div className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
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
        background: revealed ? "rgba(255,255,255,0.1)" : "var(--theme-bg-secondary)",
        color: revealed ? "var(--theme-text-normal)" : "transparent",
        transition: "color 0.1s",
      }}
      title={revealed ? undefined : "Click to reveal spoiler"}
    >
      {children}
    </span>
  )
}
