"use client"

/**
 * VirtualizedMessageList
 *
 * Renders a scrollable message list using @tanstack/react-virtual to only
 * mount visible messages in the DOM.  Supports dynamic row heights (messages
 * vary due to embeds, attachments, reactions), bidirectional infinite scroll,
 * and scroll-to-bottom anchoring for new messages.
 *
 * Replaces the previous direct DOM rendering capped at 150 messages.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { MessageWithAuthor } from "@/types/database"

/** Estimated height per message row — the virtualizer adjusts dynamically. */
const ESTIMATED_ROW_HEIGHT = 68

interface VirtualizedMessageListProps {
  messages: MessageWithAuthor[]
  /** Ref to the outer scroll container (column-reverse flex). */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  /** Render a single message row.  Must return a single element with ref forwarding. */
  renderMessage: (message: MessageWithAuthor, index: number) => ReactNode
  /** Whether there are older messages to load (shows loading sentinel). */
  hasMoreHistory: boolean
  /** Whether pagination is currently in progress. */
  isPaginating: boolean
  /** Called when the user scrolls near the top (oldest messages). */
  onLoadOlder: () => void
  /** Header content shown before messages (e.g., "Welcome to #channel"). */
  headerContent?: ReactNode
  /** Footer content shown after messages (e.g., voice recap cards). */
  footerContent?: ReactNode
}

export function VirtualizedMessageList({
  messages,
  scrollContainerRef,
  renderMessage,
  hasMoreHistory,
  isPaginating,
  onLoadOlder,
  headerContent,
  footerContent,
}: VirtualizedMessageListProps) {
  const paginationGuardRef = useRef(false)

  // Total count: header (optional) + messages + footer (optional)
  const hasHeader = hasMoreHistory || !!headerContent
  const hasFooter = !!footerContent
  const totalCount = (hasHeader ? 1 : 0) + messages.length + (hasFooter ? 1 : 0)
  const headerOffset = hasHeader ? 1 : 0

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      // Header row
      if (hasHeader && index === 0) return 80
      // Footer row
      if (hasFooter && index === totalCount - 1) return 60
      return ESTIMATED_ROW_HEIGHT
    },
    overscan: 10,
    // The container uses column-reverse, so we don't need to invert manually.
    // We render in normal top-to-bottom order inside the reversed parent.
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Trigger pagination when the first virtual item is near the header
  useEffect(() => {
    if (!hasMoreHistory || isPaginating || paginationGuardRef.current) return
    if (virtualItems.length === 0) return

    const firstItem = virtualItems[0]
    if (!firstItem) return

    // If the first visible item is within 3 rows of the header, load more
    if (firstItem.index <= headerOffset + 3) {
      paginationGuardRef.current = true
      onLoadOlder()
      // Reset guard after a short delay to allow debouncing
      setTimeout(() => { paginationGuardRef.current = false }, 500)
    }
  }, [virtualItems, hasMoreHistory, isPaginating, onLoadOlder, headerOffset])

  // Re-measure all items when messages change (content may have changed)
  const prevMessageCountRef = useRef(messages.length)
  useEffect(() => {
    if (messages.length !== prevMessageCountRef.current) {
      virtualizer.measure()
      prevMessageCountRef.current = messages.length
    }
  }, [messages.length, virtualizer])

  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const index = Number(node.dataset.index)
        if (!Number.isNaN(index)) {
          virtualizer.measureElement(node)
        }
      }
    },
    [virtualizer],
  )

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}
    >
      {virtualItems.map((virtualRow) => {
        const { index, start } = virtualRow

        // Header row (channel intro + pagination skeleton)
        if (hasHeader && index === 0) {
          return (
            <div
              key="header"
              data-index={index}
              ref={measureRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${start}px)`,
              }}
            >
              {headerContent}
            </div>
          )
        }

        // Footer row
        if (hasFooter && index === totalCount - 1) {
          return (
            <div
              key="footer"
              data-index={index}
              ref={measureRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${start}px)`,
              }}
            >
              {footerContent}
            </div>
          )
        }

        // Message row
        const messageIndex = index - headerOffset
        const message = messages[messageIndex]
        if (!message) return null

        return (
          <div
            key={message.id}
            data-index={index}
            ref={measureRef}
            id={`message-${message.id}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${start}px)`,
            }}
          >
            {renderMessage(message, messageIndex)}
          </div>
        )
      })}
    </div>
  )
}

export { ESTIMATED_ROW_HEIGHT }
