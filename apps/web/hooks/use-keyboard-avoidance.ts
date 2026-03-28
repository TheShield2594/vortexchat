"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * On mobile, when the virtual keyboard opens the visual viewport shrinks.
 * This hook detects viewport size changes and scrolls the given container
 * so the message input stays visible. Uses the `visualViewport` API.
 *
 * @param scrollContainerRef - Ref to the scrollable message container
 * @param enabled - Whether to activate (typically `isMobile`)
 * @param columnReverse - If true, scrolls to top=0 (column-reverse bottom). If false, scrolls to scrollHeight.
 */
export function useKeyboardAvoidance(
  scrollContainerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  columnReverse = true
): void {
  const prevHeightRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.visualViewport) return

    const viewport = window.visualViewport

    function handleResize() {
      const currentHeight = viewport!.height
      const prevHeight = prevHeightRef.current

      // Keyboard opened — viewport got smaller
      if (prevHeight > 0 && currentHeight < prevHeight - 50) {
        const container = scrollContainerRef.current
        if (container) {
          requestAnimationFrame(() => {
            if (columnReverse) {
              // column-reverse: scrollTop 0 = bottom (newest messages)
              container.scrollTo({ top: 0, behavior: "smooth" })
            } else {
              // Normal scroll: scroll to the very bottom
              container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
            }
          })
        }
      }

      prevHeightRef.current = currentHeight
    }

    prevHeightRef.current = viewport.height
    viewport.addEventListener("resize", handleResize)
    return () => viewport.removeEventListener("resize", handleResize)
  }, [enabled, scrollContainerRef, columnReverse])
}
