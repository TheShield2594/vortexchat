import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react"

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
 * Standard (top-to-bottom) scroll direction:
 *   scrollTop === 0 → user is at the top (oldest messages)
 *   scrollTop + clientHeight === scrollHeight → user is at the bottom (newest)
 *
 * Uses a useLayoutEffect (before paint) to keep scroll pinned to bottom
 * on every React render, and a MutationObserver for non-React DOM changes.
 */

const AT_BOTTOM_THRESHOLD = 120
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

  // ── Pin to bottom on every render (before paint) ────────────────────
  // This is the primary mechanism: whenever React commits DOM changes
  // (new messages, virtualizer re-measurement, etc.), we synchronously
  // snap scrollTop to the bottom before the browser paints.  The user
  // never sees a frame where content grew but scroll didn't follow.
  useLayoutEffect(() => {
    const container = messageScrollerRef.current
    if (!container || !isPinnedRef.current) return
    const maxScroll = container.scrollHeight - container.clientHeight
    if (maxScroll - container.scrollTop > 1) {
      container.scrollTop = maxScroll
    }
  })

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

      // Load older messages when near the top (oldest messages).
      if (scrollTop < SCROLL_TRIGGER_THRESHOLD && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      // At bottom when scrolled within threshold of the end
      const distanceFromBottom = container.scrollHeight - container.clientHeight - scrollTop
      const nextIsAtBottom = distanceFromBottom < AT_BOTTOM_THRESHOLD
      isPinnedRef.current = nextIsAtBottom
      setIsAtBottom(nextIsAtBottom)

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

    // ── MutationObserver: catch DOM changes outside React renders ──────
    // Virtualizer rAF-based re-measurement, lazy embeds, image loads that
    // change element sizes — any mutation that grows scrollHeight without
    // a React state update.
    let mutationRaf = 0
    const mutationObserver = new MutationObserver(() => {
      if (!isPinnedRef.current) return
      cancelAnimationFrame(mutationRaf)
      mutationRaf = requestAnimationFrame(() => {
        if (!isPinnedRef.current) return
        const maxScroll = container.scrollHeight - container.clientHeight
        if (maxScroll - container.scrollTop > 1) {
          container.scrollTop = maxScroll
        }
      })
    })
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    })

    onScroll()
    container.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      if (scrollStorageKey) persistScroll()
      container.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(mutationRaf)
      mutationObserver.disconnect()
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
