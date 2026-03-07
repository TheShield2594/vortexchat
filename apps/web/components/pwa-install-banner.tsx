"use client"

import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const STORAGE_KEY = "pwa-install-banner-dismissed"

export function PwaInstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show on mobile and only if never dismissed before
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (!isMobile) return
    if (localStorage.getItem(STORAGE_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === "accepted" || outcome === "dismissed") {
      localStorage.setItem(STORAGE_KEY, "1")
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div
      role="banner"
      aria-label="Add VortexChat to your home screen"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "var(--theme-surface-elevation-3)",
        borderTop: "1px solid var(--theme-accent)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "var(--theme-shadow-elevation-4)",
      }}
    >
      {/* Icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0 }} />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--theme-text-bright)", fontSize: 14 }}>
          Add VortexChat to Home Screen
        </p>
        <p style={{ margin: 0, color: "var(--theme-text-muted)", fontSize: 12 }}>
          Get the full app experience — offline support &amp; fast launch.
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          style={{
            background: "transparent",
            border: "1px solid var(--theme-border, #363d5c)",
            borderRadius: 6,
            color: "var(--theme-text-muted)",
            cursor: "pointer",
            fontSize: 13,
            padding: "6px 10px",
          }}
        >
          Not now
        </button>
        <button
          onClick={install}
          aria-label="Install VortexChat app"
          style={{
            background: "var(--theme-accent)",
            border: "none",
            borderRadius: 6,
            color: "var(--primary-foreground, #0f1120)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            padding: "6px 12px",
          }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
