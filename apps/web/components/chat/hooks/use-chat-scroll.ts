import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"

interface UseChatScrollArgs {
  hasMoreHistory: boolean
  loadOlderMessages: () => Promise<void>
  messageScrollerRef: MutableRefObject<HTMLDivElement | null>
  paginationRequestRef: MutableRefObject<Promise<unknown> | null>
  scrollStorageKey: string
  unreadAnchorStorageKey: string
  onReachedBottom: () => void
}

/**
 * Scroll management hook for the virtualized message container.
 *
 * With standard (top-to-bottom) scroll direction:
 *   scrollTop === 0 → user is at the top (oldest messages)
 *   scrollTop + clientHeight === scrollHeight → user is at the bottom (newest)
 *
 * Pagination is handled by VirtualizedMessageList — this hook only
 * tracks scroll position for "at bottom" detection and persistence.
 */
export function useChatScroll({
  hasMoreHistory,
  loadOlderMessages,
  messageScrollerRef,
  paginationRequestRef,
  scrollStorageKey,
  unreadAnchorStorageKey,
  onReachedBottom,
}: UseChatScrollArgs) {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return

    const persistScroll = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const onScroll = () => {
      const scrollTop = container.scrollTop

      // Load older messages when near the top (oldest messages).
      if (scrollTop < 120 && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      // At bottom when scrolled within 120px of the end
      const distanceFromBottom = container.scrollHeight - container.clientHeight - scrollTop
      const nextIsAtBottom = distanceFromBottom < 120
      setIsAtBottom(nextIsAtBottom)

      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
      }
      scrollSaveTimerRef.current = setTimeout(() => {
        persistScroll()
        scrollSaveTimerRef.current = null
      }, 250)

      if (nextIsAtBottom) {
        onReachedBottom()
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(unreadAnchorStorageKey)
        }
      }
    }

    onScroll()
    container.addEventListener("scroll", onScroll)

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      persistScroll()
      container.removeEventListener("scroll", onScroll)
    }
  }, [hasMoreHistory, loadOlderMessages, messageScrollerRef, onReachedBottom, paginationRequestRef, scrollStorageKey, unreadAnchorStorageKey])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messageScrollerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }, [messageScrollerRef])

  return { isAtBottom, setIsAtBottom, scrollToBottom }
}
