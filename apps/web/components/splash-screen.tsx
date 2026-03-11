"use client"

import { useEffect, useState } from "react"

/**
 * Branded loading overlay shown during cold starts.
 * Renders a pulsing Vortex logo that fades out once the app is hydrated.
 * Uses inline styles to avoid layout shift from CSS loading.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Once React hydrates, fade out and unmount
    const timer = setTimeout(() => setVisible(false), 300)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1b1f31",
        transition: "opacity 300ms ease-out",
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
      }}
    >
      {/* Glow ring */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,229,255,0.25) 0%, transparent 70%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "splash-pulse 1.6s ease-in-out infinite",
        }}
      >
        <span
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#00e5ff",
            fontFamily: "var(--font-display), system-ui, sans-serif",
          }}
        >
          V
        </span>
      </div>
      <p
        style={{
          marginTop: 16,
          fontSize: 14,
          color: "#8f9bbf",
          fontFamily: "var(--font-body), system-ui, sans-serif",
          letterSpacing: "0.05em",
        }}
      >
        Loading VortexChat…
      </p>
      <style>{`
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes splash-pulse {
            0%, 100% { transform: none; opacity: 1; }
          }
        }
      `}</style>
    </div>
  )
}
