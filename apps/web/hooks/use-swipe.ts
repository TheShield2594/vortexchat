"use client"

import { useMemo, useRef } from "react"

interface SwipeConfig {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  minDistance?: number
  maxCrossAxis?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, minDistance = 56, maxCrossAxis = 80 }: SwipeConfig) {
  const startRef = useRef<{ x: number; y: number } | null>(null)

  return useMemo(
    () => ({
      onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
        const touch = event.changedTouches[0]
        startRef.current = { x: touch.clientX, y: touch.clientY }
      },
      onTouchEnd: (event: React.TouchEvent<HTMLElement>) => {
        const start = startRef.current
        if (!start) return
        const touch = event.changedTouches[0]
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        if (Math.abs(dy) > maxCrossAxis) return
        if (dx <= -minDistance) onSwipeLeft?.()
        if (dx >= minDistance) onSwipeRight?.()
      },
      onTouchCancel: () => {
        startRef.current = null
      },
    }),
    [maxCrossAxis, minDistance, onSwipeLeft, onSwipeRight]
  )
}
