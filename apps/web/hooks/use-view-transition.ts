"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

/**
 * Wraps Next.js router navigations with the View Transitions API
 * for smooth cross-fade route animations.
 *
 * Falls back to standard navigation when the API is unavailable
 * or the user has `prefers-reduced-motion: reduce` enabled.
 */
export function useViewTransition() {
  const router = useRouter()

  const navigate = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      const supportsViewTransitions =
        typeof document !== "undefined" &&
        "startViewTransition" in document

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

      if (!supportsViewTransitions || prefersReducedMotion) {
        if (options?.replace) {
          router.replace(href)
        } else {
          router.push(href)
        }
        return
      }

      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        if (options?.replace) {
          router.replace(href)
        } else {
          router.push(href)
        }
      })
    },
    [router]
  )

  return { navigate }
}
