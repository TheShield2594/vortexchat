import Image from "next/image"
import type { CSSProperties } from "react"

interface VortexLogoProps {
  /** Pixel size for width and height. Default 32. */
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * Vortex logomark — renders the actual logo image asset.
 */
export function VortexLogo({ size = 32, className, style }: VortexLogoProps) {
  return (
    <Image
      src="/icon-192.png"
      alt="VortexChat"
      width={size}
      height={size}
      className={className}
      style={style}
      priority={size >= 40}
    />
  )
}
