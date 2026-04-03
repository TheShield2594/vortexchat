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
 *    (image loads via naturalWidth, lazy embeds, virtualizer re-measurement).
 *    Fires in the same microtask as the mutation, so it's still pre-paint.
 *
 * 3. Sticky pin tolerance — 10px to initially pin, 100px to stay pinned.
 *    Small layout shifts (reactions, edited messages, embed heights) don't
 *    accidentally unpin the user.
 */

const PIN_TOLERANCE = 10
const STICKY_TOLERANCE = 100
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

      const nextPinned = evaluatePin()
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
    // Virtualizer re-measures, image loads, embed heights — anything that
    // changes children/styles in the scroll container without a React
    // state update.  Fires synchronously in the mutation microtask, so we
    // can adjust scrollTop before the next paint.
    let mutationRaf = 0
    const mutationObserver = new MutationObserver(() => {
      if (!isPinnedRef.current) return
      // Batch via rAF — multiple mutations (virtualizer re-measuring many
      // items) collapse into a single scroll adjustment.
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
