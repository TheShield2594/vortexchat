"use client"

import { useRef, useCallback, useMemo, useState } from "react"

interface PullToRefreshConfig {
  /** Called when the user completes a pull-down gesture. Should return a promise. */
  onRefresh: () => Promise<void>
  /** Minimum pull distance in px to trigger refresh. Default 80. */
  threshold?: number
  /** Whether the scrollable is at the top (scrollTop <= 0). */
  isAtTop: boolean
}

interface PullToRefreshResult {
  /** Spread these onto the scrollable container element. */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
    onTouchCancel: () => void
  }
  /** Current pull distance (0 when idle). Use for rendering a pull indicator. */
  pullDistance: number
  /** Whether a refresh is currently in progress. */
  refreshing: boolean
}

/**
 * Adds pull-to-refresh gesture to a scrollable container on mobile.
 * Only activates when the container is scrolled to the top.
 */
export function usePullToRefresh({ onRefresh, threshold = 80, isAtTop }: PullToRefreshConfig): PullToRefreshResult {
  const startYRef = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullingRef = useRef(false)

  const reset = useCallback(() => {
    startYRef.current = null
    pullingRef.current = false
    setPullDistance(0)
  }, [])

  const handlers = useMemo(() => ({
    onTouchStart: (e: React.TouchEvent) => {
      if (refreshing) return
      startYRef.current = e.touches[0].clientY
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (refreshing || startYRef.current === null) return
      const dy = e.touches[0].clientY - startYRef.current
      // Only track downward pulls when at the top of the scroll container
      if (dy > 0 && isAtTop) {
        pullingRef.current = true
        // Rubber-band: diminishing returns past threshold
        const dampened = dy > threshold ? threshold + (dy - threshold) * 0.3 : dy
        setPullDistance(dampened)
      } else if (pullingRef.current && dy <= 0) {
        // User reversed direction
        reset()
      }
    },
    onTouchEnd: () => {
      if (refreshing) return
      if (pullingRef.current && pullDistance >= threshold) {
        setRefreshing(true)
        setPullDistance(threshold * 0.5) // Settle to a smaller indicator
        onRefresh().finally(() => {
          setRefreshing(false)
          reset()
        })
      } else {
        reset()
      }
    },
    onTouchCancel: () => {
      if (!refreshing) reset()
    },
  }), [refreshing, isAtTop, threshold, pullDistance, onRefresh, reset])

  return { handlers, pullDistance, refreshing }
}
