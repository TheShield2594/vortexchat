import type { CSSProperties } from "react"
import { cn } from "@/lib/utils/cn"

interface VortexLogoProps {
  /** Pixel size for width and height. Default 32. */
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * Vortex spiral logomark — three concentric 270° arcs with a center dot,
 * open at the top, creating the visual sense of a rotating vortex pulling
 * inward. Color inherits from `currentColor`.
 */
export function VortexLogo({ size = 32, className, style }: VortexLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn(className)}
      style={style}
    >
      {/* Outer arc — 270° clockwise, opens at top (12 o'clock) */}
      <path
        d="M 28 16 A 12 12 0 1 1 16 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Middle arc — 270° clockwise */}
      <path
        d="M 23 16 A 7 7 0 1 1 16 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.65"
      />
      {/* Inner arc — 270° clockwise */}
      <path
        d="M 19 16 A 3 3 0 1 1 16 13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Center dot */}
      <circle cx="16" cy="16" r="1.75" fill="currentColor" />
    </svg>
  )
}
