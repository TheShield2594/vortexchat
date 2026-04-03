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
 * Scroll management hook for chat message containers.
 *
 * Implements Fluxer-style sticky pin tolerance:
 *   - 10px tolerance to initially detect "at bottom"
 *   - 80px sticky tolerance to stay pinned while small layout shifts occur
 *
 * Uses a ResizeObserver on the scroll container's content to detect height
 * changes and immediately scroll to bottom when pinned — no racy double-RAF.
 */

const PIN_TOLERANCE = 10
const STICKY_TOLERANCE = 80
const SCROLL_TRIGGER_THRESHOLD = 120

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
  const isPinnedRef = useRef(true)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cachedScrollHeightRef = useRef(0)
  const isProgrammaticScrollRef = useRef(false)

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return

    const persistScroll = () => {
      if (scrollStorageKey && typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const evaluatePin = (): { distanceFromBottom: number; isWithinTolerance: boolean; isPinned: boolean } => {
      const distanceFromBottom = Math.max(
        container.scrollHeight - container.clientHeight - container.scrollTop,
        0,
      )
      const isWithinTolerance = distanceFromBottom <= PIN_TOLERANCE
      const isWithinStickyRange = distanceFromBottom <= STICKY_TOLERANCE
      const shouldPin = isWithinTolerance || (isPinnedRef.current && isWithinStickyRange)

      return { distanceFromBottom, isWithinTolerance, isPinned: shouldPin }
    }

    const onScroll = () => {
      const scrollTop = container.scrollTop

      // Load older messages when near the top (oldest messages).
      if (scrollTop < SCROLL_TRIGGER_THRESHOLD && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      const { isPinned: nextPinned } = evaluatePin()
      isPinnedRef.current = nextPinned
      setIsAtBottom(nextPinned)

      if (scrollStorageKey) {
        if (scrollSaveTimerRef.current) {
          clearTimeout(scrollSaveTimerRef.current)
        }
        scrollSaveTimerRef.current = setTimeout(() => {
          persistScroll()
          scrollSaveTimerRef.current = null
        }, 250)
      }

      if (nextPinned) {
        onReachedBottom()
        if (unreadAnchorStorageKey && typeof window !== "undefined") {
          window.sessionStorage.removeItem(unreadAnchorStorageKey)
        }
      }
    }

    // ResizeObserver: when the scroll container's scrollHeight grows while
    // pinned to bottom, immediately scroll to keep the newest messages visible.
    // This replaces the racy double-RAF pattern.
    cachedScrollHeightRef.current = container.scrollHeight

    const resizeObserver = new ResizeObserver(() => {
      const newScrollHeight = container.scrollHeight
      const heightGrew = newScrollHeight > cachedScrollHeightRef.current
      cachedScrollHeightRef.current = newScrollHeight

      if (heightGrew && isPinnedRef.current) {
        isProgrammaticScrollRef.current = true
        container.scrollTop = newScrollHeight
        isProgrammaticScrollRef.current = false
      }
    })

    // Observe the first child (the content wrapper) so we catch height changes
    // from new messages, images loading, embeds expanding, etc.
    if (container.firstElementChild) {
      resizeObserver.observe(container.firstElementChild)
    }
    // Also observe the container itself for viewport size changes
    resizeObserver.observe(container)

    onScroll()
    container.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      if (scrollStorageKey) persistScroll()
      container.removeEventListener("scroll", onScroll)
      resizeObserver.disconnect()
    }
  }, [hasMoreHistory, loadOlderMessages, messageScrollerRef, onReachedBottom, paginationRequestRef, scrollStorageKey, unreadAnchorStorageKey])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messageScrollerRef.current
    if (!container) return
    isPinnedRef.current = true
    setIsAtBottom(true)
    container.scrollTo({ top: container.scrollHeight, behavior })
  }, [messageScrollerRef])

  return { isAtBottom, setIsAtBottom, scrollToBottom, isPinnedRef }
}
