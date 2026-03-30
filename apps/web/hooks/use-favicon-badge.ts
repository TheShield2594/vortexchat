"use client"

import { useEffect, useRef } from "react"

const FAVICON_SIZE = 32
const BADGE_RADIUS = 6
const BADGE_COLOR = "#ED4245" // Discord-style red

/**
 * Dynamically renders a red badge dot on the browser tab favicon
 * when there are unread notifications. Uses canvas to composite
 * the original favicon with a red circle overlay.
 *
 * Modeled after Fluxer's FaviconBadge approach.
 */
export function useFaviconBadge(hasUnread: boolean) {
  const originalHrefRef = useRef<string | null>(null)
  const linkRef = useRef<HTMLLinkElement | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return

    // Find or create the 32x32 favicon link element
    let link = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][sizes="32x32"]'
    )
    if (!link) {
      link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    }
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      link.type = "image/png"
      link.sizes = "32x32"
      document.head.appendChild(link)
    }

    linkRef.current = link

    // Store the original href on first mount
    if (originalHrefRef.current === null) {
      originalHrefRef.current = link.href
    }

    if (!hasUnread) {
      // Restore original favicon
      if (originalHrefRef.current) {
        link.href = originalHrefRef.current
      }
      return
    }

    // Draw favicon with badge
    const canvas = document.createElement("canvas")
    canvas.width = FAVICON_SIZE
    canvas.height = FAVICON_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
      ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE)

      // Draw red badge circle in top-right
      const cx = FAVICON_SIZE - BADGE_RADIUS - 1
      const cy = BADGE_RADIUS + 1
      ctx.beginPath()
      ctx.arc(cx, cy, BADGE_RADIUS, 0, 2 * Math.PI)
      ctx.fillStyle = BADGE_COLOR
      ctx.fill()

      // White border around the badge for visibility
      ctx.strokeStyle = "#FFFFFF"
      ctx.lineWidth = 1.5
      ctx.stroke()

      const dataUrl = canvas.toDataURL("image/png")
      if (linkRef.current) {
        linkRef.current.href = dataUrl
      }
    }

    img.onerror = () => {
      // If the image fails to load (e.g. CORS), draw a simple colored square with badge
      ctx.fillStyle = "#5865F2"
      ctx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)

      // Draw "V" letter
      ctx.fillStyle = "#FFFFFF"
      ctx.font = "bold 22px sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("V", FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1)

      // Draw red badge
      const cx = FAVICON_SIZE - BADGE_RADIUS - 1
      const cy = BADGE_RADIUS + 1
      ctx.beginPath()
      ctx.arc(cx, cy, BADGE_RADIUS, 0, 2 * Math.PI)
      ctx.fillStyle = BADGE_COLOR
      ctx.fill()
      ctx.strokeStyle = "#FFFFFF"
      ctx.lineWidth = 1.5
      ctx.stroke()

      const dataUrl = canvas.toDataURL("image/png")
      if (linkRef.current) {
        linkRef.current.href = dataUrl
      }
    }

    img.src = originalHrefRef.current || "/favicon-32x32.png?v=2"

    // Cleanup: restore original on unmount
    return () => {
      if (linkRef.current && originalHrefRef.current) {
        linkRef.current.href = originalHrefRef.current
      }
    }
  }, [hasUnread])
}
