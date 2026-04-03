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
 * Pin-to-bottom strategy (adapted from Fluxer's ScrollManager):
 *
 * 1. useLayoutEffect — runs synchronously after every React render but BEFORE
 *    paint.  If pinned to bottom, we set scrollTop = scrollHeight so the user
 *    never sees a frame where content shifted but scroll didn't follow.
 *
 * 2. MutationObserver — catches DOM changes that don't trigger React renders
 *    (lazy embeds, virtualizer re-measurement via rAF).
 *
 * 3. Sticky pin tolerance — 10px to initially pin, 200px to stay pinned.
 *    The large sticky range absorbs mobile address-bar resize (~56-100px)
 *    and iOS momentum scroll overshoot.
 */

const PIN_TOLERANCE = 10
const STICKY_TOLERANCE = 200
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
  // Track previous scrollHeight so we can distinguish "content grew" from
  // "viewport resized" — viewport resizes (address bar, keyboard) should
  // keep the pin but not actively scroll.
  const prevScrollHeightRef = useRef(0)

  // ── Core: snap to bottom on every render when pinned ────────────────
  // Runs in useLayoutEffect (before paint) so new messages, channel
  // switches, and virtualizer re-measurements all settle before the user
  // sees the frame.
  useLayoutEffect(() => {
    const container = messageScrollerRef.current
    if (!container || !isPinnedRef.current) return
    const maxScroll = container.scrollHeight - container.clientHeight
    // Only touch scrollTop when there's actually a gap to close
    if (maxScroll - container.scrollTop > 1) {
      container.scrollTop = maxScroll
    }
  })

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return

    prevScrollHeightRef.current = container.scrollHeight

    const persistScroll = () => {
      if (scrollStorageKey && typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const evaluatePin = (): boolean => {
      const distanceFromBottom = Math.max(
        container.scrollHeight - container.clientHeight - container.scrollTop,
        0,
      )
      const isWithinTolerance = distanceFromBottom <= PIN_TOLERANCE
      const isWithinStickyRange = distanceFromBottom <= STICKY_TOLERANCE
      return isWithinTolerance || (isPinnedRef.current && isWithinStickyRange)
    }

    const onScroll = () => {
      const scrollTop = container.scrollTop

      // Load older messages when near the top (oldest messages).
      if (scrollTop < SCROLL_TRIGGER_THRESHOLD && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      // Detect whether scrollHeight changed (content grew/shrank) vs
      // clientHeight changed (viewport resize from address bar / keyboard).
      // Both fire scroll events, but viewport resizes should preserve pin
      // without actively re-scrolling — the browser already adjusts.
      const scrollHeightChanged = container.scrollHeight !== prevScrollHeightRef.current
      prevScrollHeightRef.current = container.scrollHeight

      const nextPinned = evaluatePin()

      // On viewport resize (clientHeight change, scrollHeight unchanged),
      // keep the current pin state — don't let address-bar show/hide unpin.
      if (!scrollHeightChanged && isPinnedRef.current && !nextPinned) {
        // Viewport shrank or grew but content didn't — stay pinned and re-snap
        const maxScroll = container.scrollHeight - container.clientHeight
        if (maxScroll - scrollTop > 1) {
          container.scrollTop = maxScroll
        }
        return
      }

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

    // ── MutationObserver: catch DOM changes outside React renders ──────
    // Lazy embeds, virtualizer rAF re-measurements, etc.
    let mutationRaf = 0
    const mutationObserver = new MutationObserver(() => {
      if (!isPinnedRef.current) return
      cancelAnimationFrame(mutationRaf)
      mutationRaf = requestAnimationFrame(() => {
        if (!isPinnedRef.current) return
        const maxScroll = container.scrollHeight - container.clientHeight
        if (maxScroll - container.scrollTop > 1) {
          container.scrollTop = maxScroll
          prevScrollHeightRef.current = container.scrollHeight
        }
      })
    })
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    })

    // Initial evaluation
    onScroll()
    container.addEventListener("scroll", onScroll, { passive: true })

    // On mobile, visualViewport resize (keyboard, address bar) can shift
    // clientHeight without a scroll event.  Re-snap if pinned.
    const onViewportResize = () => {
      if (!isPinnedRef.current) return
      requestAnimationFrame(() => {
        if (!isPinnedRef.current) return
        const maxScroll = container.scrollHeight - container.clientHeight
        if (maxScroll - container.scrollTop > 1) {
          container.scrollTop = maxScroll
        }
      })
    }
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    vv?.addEventListener("resize", onViewportResize)

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      if (scrollStorageKey) persistScroll()
      container.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(mutationRaf)
      mutationObserver.disconnect()
      vv?.removeEventListener("resize", onViewportResize)
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
