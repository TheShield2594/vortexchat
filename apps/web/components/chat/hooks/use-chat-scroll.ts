import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"

interface UseChatScrollArgs {
  hasMoreHistory: boolean
  loadOlderMessages: () => Promise<void>
  messageScrollerRef: MutableRefObject<HTMLDivElement | null>
  paginationRequestRef: MutableRefObject<Promise<unknown> | null>
  /** Session-storage key for persisting scroll offset. Omit to skip persistence. */
  scrollStorageKey?: string
  /** Session-storage key for unread anchor. Omit to skip anchor cleanup. */
  unreadAnchorStorageKey?: string
  onReachedBottom: () => void
}

/**
 * Scroll management hook for chat message containers using column-reverse.
 *
 * In column-reverse:
 *   scrollTop === 0 → user is at the bottom (newest messages)
 *   scrollTop increases → user scrolls toward older messages
 *
 * The browser natively keeps the user at scrollTop=0 when new content is
 * added, so no programmatic scroll pinning, useLayoutEffect hacks, or
 * MutationObservers are needed.
 */

const AT_BOTTOM_THRESHOLD = 120
const LOAD_MORE_THRESHOLD = 120

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
      if (scrollStorageKey && typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const onScroll = () => {
      const scrollTop = container.scrollTop

      // In column-reverse, scrollTop=0 is the bottom (newest).
      // User scrolls UP to see older messages → scrollTop increases.
      const nextIsAtBottom = scrollTop < AT_BOTTOM_THRESHOLD
      setIsAtBottom(nextIsAtBottom)

      // Load older messages when scrolled far enough toward history.
      // distanceFromOldest = how far from the oldest content (max scrollTop)
      const maxScroll = container.scrollHeight - container.clientHeight
      const distanceFromOldest = maxScroll - scrollTop
      if (distanceFromOldest < LOAD_MORE_THRESHOLD && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      if (scrollStorageKey) {
        if (scrollSaveTimerRef.current) {
          clearTimeout(scrollSaveTimerRef.current)
        }
        scrollSaveTimerRef.current = setTimeout(() => {
          persistScroll()
          scrollSaveTimerRef.current = null
        }, 250)
      }

      if (nextIsAtBottom) {
        onReachedBottom()
        if (unreadAnchorStorageKey && typeof window !== "undefined") {
          window.sessionStorage.removeItem(unreadAnchorStorageKey)
        }
      }
    }

    onScroll()
    container.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      if (scrollStorageKey) persistScroll()
      container.removeEventListener("scroll", onScroll)
    }
  }, [hasMoreHistory, loadOlderMessages, messageScrollerRef, onReachedBottom, paginationRequestRef, scrollStorageKey, unreadAnchorStorageKey])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messageScrollerRef.current
    if (!container) return
    // In column-reverse, scrollTop=0 is the bottom (newest messages)
    container.scrollTo({ top: 0, behavior })
  }, [messageScrollerRef])

  return { isAtBottom, setIsAtBottom, scrollToBottom }
}
