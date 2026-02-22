"use client"

import { useState, useCallback } from "react"
import { MobileNavProvider, MobileOverlay } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"
import { QuickSwitcherModal } from "@/components/modals/quickswitcher-modal"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)

  useKeyboardShortcuts({
    onQuickSwitcher: useCallback(() => setQuickSwitcherOpen(true), []),
    onSearch: useCallback(() => setQuickSwitcherOpen(true), []),
  })

  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "#313338" }}>
        <ServerSidebarWrapper />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
      {quickSwitcherOpen && <QuickSwitcherModal onClose={() => setQuickSwitcherOpen(false)} />}
    </MobileNavProvider>
  )
}
