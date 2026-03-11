"use client"

import { useEffect, useState } from "react"

/**
 * Mobile detection using matchMedia at 768px (Tailwind's md breakpoint).
 * This ensures JS routing decisions match CSS md: breakpoint visibility.
 */
export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false
    return !window.matchMedia("(min-width: 768px)").matches
  })

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(!e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}
