import type { CSSProperties } from "react"

interface VortexLogoProps {
  /** Pixel size for width and height. Default 32. */
  size?: number
  className?: string
  style?: CSSProperties
}

/** Vortex tornado logomark — renders the actual logo image. */
export function VortexLogo({ size = 32, className, style }: VortexLogoProps) {
  return (
    <img
      src="/icon-512.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={style}
    />
  )
}
