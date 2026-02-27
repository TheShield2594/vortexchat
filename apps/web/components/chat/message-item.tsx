"use client"

import { memo, useCallback, useEffect, useId, useRef, useState } from "react"
import { format } from "date-fns"
import { Reply, Edit2, Trash2, Smile, Clipboard, Hash, MessageSquare, RefreshCcw, CheckSquare, Flag, Copy, Check } from "lucide-react"
import { Highlight, themes } from "prism-react-renderer"
import { EmojiPicker } from "frimousse"
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
import { ReportModal } from "@/components/modals/report-modal"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"]
const POLL_NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]

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
  recentlyActive?: boolean
}

function extractPoll(content: string | null): { question: string; options: string[]; sanitizedContent: string | null } | null {
  if (!content) return null
  const pollMatch = content.match(/\[POLL\]\s*([\s\S]*?)\s*\[\/POLL\]/i)
  if (!pollMatch) return null
  const pollBody = pollMatch[1] ?? ""
  const lines = pollBody.split("\n").map((line) => line.trim()).filter(Boolean)
  if (lines.length < 3) return null
  const question = lines[0]
  const options = lines.slice(1).map((line) => line.replace(/^-\s*/, "").trim()).filter(Boolean)
  if (!question || options.length < 2) return null
  const sanitized = content.replace(pollMatch[0], "").trim()
  return {
    question,
    options: options.slice(0, POLL_NUMBER_EMOJIS.length),
    sanitizedContent: sanitized.length > 0 ? sanitized : null,
  }
}

const SUPPORTED_PRISM_LANGUAGES = new Set([
  "markup", "html", "xml", "svg", "mathml", "css", "clike",
  "javascript", "js", "jsx", "typescript", "ts", "tsx",
  "bash", "shell", "python", "py", "ruby", "rb", "go",
  "java", "kotlin", "swift", "c", "cpp", "csharp", "cs",
  "json", "yaml", "markdown", "md", "sql", "graphql",
  "diff", "git", "rust", "php", "r", "scala", "dart",
  "haskell", "erlang", "elixir", "clojure", "groovy",
  "objectivec", "perl", "lua", "coffeescript", "sass",
  "scss", "less", "stylus", "toml", "ini", "dockerfile",
  "nginx", "regex", "wasm", "text",
])

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy code:", error)
    }
  }

  const langKey = lang ? lang.toLowerCase() : ""
  const language = langKey && SUPPORTED_PRISM_LANGUAGES.has(langKey) ? langKey : "text"

  return (
    <div className="relative my-1 group/code rounded overflow-hidden" style={{ border: "1px solid var(--theme-surface-elevated)" }}>
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ background: "var(--theme-bg-secondary)", borderBottom: "1px solid var(--theme-surface-elevated)" }}
      >
        {lang ? (
          <span className="text-xs font-mono" style={{ color: "var(--theme-accent)" }}>{lang}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={copyCode}
          aria-label="Copy code"
          className="flex items-center gap-1 text-xs opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 transition-opacity motion-interactive"
          style={{ color: copied ? "var(--theme-success)" : "var(--theme-text-muted)" }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <Highlight code={code} language={language} theme={themes.nightOwl}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto text-sm p-3"
            style={{ ...style, margin: 0, fontFamily: "monospace" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}

function EmojiPickerPopup({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  return (
    <EmojiPicker.Root
      onEmojiSelect={({ emoji }) => { onSelect(emoji); onClose() }}
      style={{ display: "flex", flexDirection: "column", width: "320px", height: "380px" }}
    >
      <div style={{ padding: "8px 8px 4px" }}>
        <EmojiPicker.Search
          aria-label="Search emoji"
          style={{
            all: "unset",
            display: "block",
            width: "100%",
            padding: "6px 10px",
            borderRadius: "6px",
            fontSize: "13px",
            boxSizing: "border-box",
            background: "var(--theme-bg-tertiary)",
            color: "var(--theme-text-normal)",
          }}
          placeholder="Search emoji…"
        />
      </div>
      <EmojiPicker.Viewport style={{ flex: 1, overflow: "hidden auto" }}>
        <EmojiPicker.Loading>
          <div style={{ padding: "16px", color: "var(--theme-text-muted)", fontSize: "13px" }}>Loading…</div>
        </EmojiPicker.Loading>
        <EmojiPicker.Empty>
          {({ search }) => (
            <div style={{ padding: "16px", color: "var(--theme-text-muted)", fontSize: "13px" }}>
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
                  padding: "4px 8px",
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
      <div style={{ padding: "4px 8px 8px", display: "flex", justifyContent: "flex-end" }}>
        <EmojiPicker.SkinToneSelector
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: "16px",
            padding: "2px 4px",
            borderRadius: "4px",
            border: "1px solid var(--theme-bg-tertiary)",
            background: "var(--theme-bg-tertiary)",
          }}
          aria-label="Change skin tone"
        />
      </div>
    </EmojiPicker.Root>
  )
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
  recentlyActive = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? "")
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const { toast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showActions && !showEmojiPicker) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowActions(false)
        setShowEmojiPicker(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowActions(false)
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showActions, showEmojiPicker])
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
  const parsedPoll = extractPoll(renderedContent)
  const messageBodyContent = parsedPoll ? parsedPoll.sanitizedContent : renderedContent

  const sendStateLabel = sendState === "queued" ? "Queued" : sendState === "sending" ? "Sending" : sendState === "failed" ? "Failed" : null


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
  const pollEmojiSet = parsedPoll ? new Set(parsedPoll.options.map((_, index) => POLL_NUMBER_EMOJIS[index])) : null
  const genericReactionEntries = Object.entries(reactionGroups).filter(([emoji]) => !pollEmojiSet?.has(emoji))

  async function handleEditSubmit() {
    if (editContent.trim() && editContent !== message.content) {
      try {
        await onEdit(editContent.trim())
      } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to edit message", description: error?.message ?? "Please try again." })
        return
      }
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
        <CodeBlock key={`cb-${keyCounter++}`} lang={lang} code={code} />
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
          ref={containerRef}
          id={containerId}
          className={cn(
            "relative group px-4 message-hover motion-interactive",
            highlighted && "mention-highlight",
            isGrouped ? "py-0.5" : "pt-4 pb-0.5"
          )}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => { setShowActions(false) }}
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
                    <Avatar className={cn("w-10 h-10", recentlyActive && "recent-activity-halo")}>
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
                  {sendStateLabel && (
                    <span className={cn("message-state-morph text-[10px]", sendState && `is-${sendState}`)}>{sendStateLabel}</span>
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
                  {sendStateLabel && (
                    <span className={cn("message-state-morph", sendState && `is-${sendState}`)}>{sendStateLabel}</span>
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
                      type="button"
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
                  {parsedPoll && (
                    <div className="mt-1 rounded-lg p-3 space-y-2" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>Poll</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>{parsedPoll.question}</p>
                      <div className="space-y-1.5">
                        {parsedPoll.options.map((option, index) => {
                          const emoji = POLL_NUMBER_EMOJIS[index]
                          const votes = reactionGroups[emoji]?.count ?? 0
                          return (
                            <button
                              type="button"
                              key={`poll-option-${message.id}-${index}`}
                              onClick={() => onReaction(emoji)}
                              className="w-full flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-white/5"
                              style={{ border: "1px solid var(--theme-bg-tertiary)", color: "var(--theme-text-normal)" }}
                            >
                              <span className="truncate text-left">{emoji} {option}</span>
                              <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{votes}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {messageBodyContent && (
                    <p
                      className="text-sm leading-relaxed message-content break-words"
                      style={{ color: "var(--theme-text-normal)" }}
                    >
                      {renderContent(messageBodyContent)}
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
                  {genericReactionEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {genericReactionEntries.map(([emoji, { count, hasOwn, users }]) => (
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

          {/* Emoji picker popup — positioned above the action rail */}
          {showEmojiPicker && (
            <div
              className="absolute z-50"
              style={{ right: 0, bottom: "calc(100% + 8px)" }}
            >
              <div
                className="rounded-lg shadow-xl overflow-hidden"
                style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
              >
                <EmojiPickerPopup
                  onSelect={(emoji) => onReaction(emoji)}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            </div>
          )}

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
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="motion-interactive motion-press w-8 h-8 flex items-center justify-center hover:bg-white/10 focus-ring"
                style={{ color: showEmojiPicker ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
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
        {!isOwn && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setShowReportModal(true)}>
              <Flag className="w-4 h-4 mr-2" /> Report Message
            </ContextMenuItem>
          </>
        )}
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

    {!isOwn && (
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUserId={message.author_id}
        reportedUsername={displayName}
        reportedMessageId={message.id}
        serverId={activeServerId ?? undefined}
      />
    )}

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
  const [zoom, setZoom] = useState(1)
  const [panOrigin, setPanOrigin] = useState({ x: 50, y: 50 })
  const imageContainerRef = useRef<HTMLDivElement>(null)

  const openImage = (index: number) => { setLightboxIndex(index); setZoom(1); setPanOrigin({ x: 50, y: 50 }) }
  const closeImage = () => { setLightboxIndex(null); setZoom(1) }

  const currentImageListIndex = lightboxIndex === null ? -1 : imageIndexes.indexOf(lightboxIndex)
  const currentAttachment = lightboxIndex === null ? null : attachments[lightboxIndex]

  const move = useCallback((direction: 1 | -1) => {
    if (currentImageListIndex < 0) return
    const nextIndex = (currentImageListIndex + direction + imageIndexes.length) % imageIndexes.length
    setLightboxIndex(imageIndexes[nextIndex])
    setZoom(1)
    setPanOrigin({ x: 50, y: 50 })
  }, [currentImageListIndex, imageIndexes])

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (zoom === 1) {
      if ("clientX" in e && typeof e.clientX === "number") {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        setPanOrigin({ x, y })
      } else {
        setPanOrigin({ x: 50, y: 50 })
      }
      setZoom(2)
    } else {
      setZoom(1)
      setPanOrigin({ x: 50, y: 50 })
    }
  }, [zoom])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPanOrigin({ x, y })
  }, [zoom])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    setZoom((prev) => {
      const next = prev + (e.deltaY < 0 ? 0.5 : -0.5)
      return Math.max(1, Math.min(5, next))
    })
  }, [])

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
            } else if (event.key === "+" || event.key === "=") {
              event.preventDefault()
              setZoom((prev) => Math.min(5, prev + 0.5))
            } else if (event.key === "-") {
              event.preventDefault()
              setZoom((prev) => Math.max(1, prev - 0.5))
            } else if (event.key === "0") {
              event.preventDefault()
              setZoom(1)
              setPanOrigin({ x: 50, y: 50 })
            }
          }}
        >
          {currentAttachment && (
            <div className="space-y-3">
              <div
                ref={imageContainerRef}
                className="overflow-hidden rounded"
                role="button"
                tabIndex={0}
                aria-label={zoom > 1 ? "Zoom out" : "Zoom in"}
                style={{ cursor: zoom > 1 ? "zoom-out" : "zoom-in" }}
                onClick={handleImageClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleImageClick(e as unknown as React.MouseEvent<HTMLDivElement>)
                  }
                }}
                onMouseMove={handleMouseMove}
                onWheel={handleWheel}
              >
                <img
                  src={currentAttachment.url}
                  alt={currentAttachment.filename}
                  className="w-full max-h-[75vh] object-contain"
                  draggable={false}
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: `${panOrigin.x}% ${panOrigin.y}%`,
                    transition: zoom === 1 ? "transform 0.2s ease-out" : "none",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--theme-text-secondary)" }}>
                <span>{currentAttachment.filename}</span>
                <div className="flex items-center gap-2">
                  {zoom > 1 && (
                    <span className="px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.1)" }}>
                      {Math.round(zoom * 100)}%
                    </span>
                  )}
                  {imageIndexes.length > 1 && (
                    <span>
                      <button type="button" className="px-2 py-1 rounded hover:bg-white/10" onClick={() => move(-1)} aria-label="Previous image">← Prev</button>
                      <button type="button" className="px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => move(1)} aria-label="Next image">Next →</button>
                    </span>
                  )}
                </div>
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
