import Image from "next/image"
import type { JSX } from "react"

interface VortexLogoProps {
  /** Pixel size for width and height. Default 32. */
  size?: number
  className?: string
}

/**
 * Vortex logomark — renders the actual logo image asset.
 */
export function VortexLogo({ size = 32, className }: VortexLogoProps): JSX.Element {
  return (
    <Image
      src="/icon-192-maskable.png"
      alt="VortexChat"
      width={size}
      height={size}
      className={`rounded-md ${className ?? ""}`}
      priority={size >= 40}
    />
  )
}
