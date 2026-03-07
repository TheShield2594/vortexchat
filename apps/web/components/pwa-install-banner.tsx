"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

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
      className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center gap-3 border-t border-accent bg-card px-4 py-3 shadow-lg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={40} height={40} className="shrink-0 rounded-lg" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Add VortexChat to Home Screen</p>
        <p className="text-xs text-muted-foreground">
          Get the full app experience — offline support &amp; fast launch.
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={dismiss} aria-label="Dismiss install banner">
          Not now
        </Button>
        <Button variant="default" size="sm" onClick={install} aria-label="Install VortexChat app">
          Install
        </Button>
      </div>
    </div>
  )
}
