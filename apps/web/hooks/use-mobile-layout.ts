"use client"

import { useEffect, useState } from "react"

const MOBILE_ENABLE_PX = 640
const MOBILE_DISABLE_PX = 768

/**
 * Hysteresis-based mobile detection to prevent layout flapping
 * near breakpoints. Enables mobile at <640px, disables at >=768px.
 * Matches the approach used by Fluxer's MobileLayoutStore.
 */
export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth < MOBILE_DISABLE_PX
  })

  useEffect(() => {
    let current = window.innerWidth < MOBILE_DISABLE_PX

    function onResize() {
      const width = window.innerWidth
      if (current && width >= MOBILE_DISABLE_PX) {
        current = false
        setIsMobile(false)
      } else if (!current && width < MOBILE_ENABLE_PX) {
        current = true
        setIsMobile(true)
      }
    }

    window.addEventListener("resize", onResize, { passive: true })
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return isMobile
}
