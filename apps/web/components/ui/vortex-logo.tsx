import type { CSSProperties } from "react"

interface VortexLogoProps {
  /** Pixel size for width and height. Default 32. */
  size?: number
  className?: string
  /**
   * Supports CSS custom properties to theme the gradient:
   *   --vortex-start  (default #00e5ff)
   *   --vortex-mid    (default #0088e0)
   *   --vortex-end    (default #0044cc)
   */
  style?: CSSProperties
}

/**
 * Vortex tornado logomark — a stylised tornado/vortex funnel with a
 * cyan-to-blue gradient, horizontal bands tapering to a sharp V-point.
 *
 * Theme via CSS custom properties on `style`:
 *   `style={{ '--vortex-start': 'var(--theme-accent)' } as CSSProperties}`
 */
export function VortexLogo({ size = 32, className, style }: VortexLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="vortex-lg" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="var(--vortex-start, #00e5ff)" />
          <stop offset="45%" stopColor="var(--vortex-mid, #0088e0)" />
          <stop offset="100%" stopColor="var(--vortex-end, #0044cc)" />
        </linearGradient>
      </defs>

      {/* Top spiral / torus ring */}
      <ellipse cx="262" cy="108" rx="128" ry="52" fill="url(#vortex-lg)" />
      <ellipse cx="272" cy="104" rx="76" ry="28" fill="white" />
      <path
        d="M 152 96 C 168 62, 240 48, 300 66 C 260 56, 200 66, 182 100 C 172 108, 156 106, 152 96 Z"
        fill="url(#vortex-lg)"
      />
      <path
        d="M 340 72 C 365 62, 395 68, 404 88 C 395 76, 370 68, 345 76 Z"
        fill="url(#vortex-lg)"
        opacity="0.85"
      />

      {/* Funnel body */}
      <path
        d="M 142 138 L 256 448 L 370 138 C 330 154, 182 154, 142 138 Z"
        fill="url(#vortex-lg)"
        opacity="0.28"
      />

      {/* Horizontal bands */}
      <path d="M 106 182 C 172 166, 340 166, 406 182 C 340 198, 172 198, 106 182 Z" fill="url(#vortex-lg)" opacity="0.95" />
      <path d="M 144 228 C 200 214, 312 214, 368 228 C 312 242, 200 242, 144 228 Z" fill="url(#vortex-lg)" opacity="0.85" />
      <path d="M 178 270 C 222 258, 290 258, 334 270 C 290 282, 222 282, 178 270 Z" fill="url(#vortex-lg)" opacity="0.75" />
      <path d="M 208 308 C 236 298, 276 298, 304 308 C 276 318, 236 318, 208 308 Z" fill="url(#vortex-lg)" opacity="0.65" />

      {/* Bottom V-point */}
      <path
        d="M 226 334 L 256 448 L 286 334 C 272 344, 240 344, 226 334 Z"
        fill="url(#vortex-lg)"
        opacity="0.55"
      />
      <path d="M 248 425 L 256 460 L 264 425 Z" fill="var(--vortex-end, #0044cc)" />
    </svg>
  )
}
