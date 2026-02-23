"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { MobileNavProvider, MobileOverlay } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"
import { QuickSwitcherModal } from "@/components/modals/quickswitcher-modal"
import { SearchModal } from "@/components/modals/search-modal"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useAppStore } from "@/lib/stores/app-store"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { activeServerId } = useAppStore()
  const router = useRouter()

  useKeyboardShortcuts({
    onQuickSwitcher: useCallback(() => setQuickSwitcherOpen(true), []),
    onSearch: useCallback(() => {
      if (!activeServerId) return
      setSearchOpen(true)
    }, [activeServerId]),
  })

  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "#313338" }}>
        <ServerSidebarWrapper
          onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
          onOpenSearch={() => activeServerId && setSearchOpen(true)}
        />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
      {quickSwitcherOpen && <QuickSwitcherModal onClose={() => setQuickSwitcherOpen(false)} />}
      {searchOpen && activeServerId && (
        <SearchModal
          serverId={activeServerId}
          onClose={() => setSearchOpen(false)}
          onJumpToMessage={(channelId, _messageId) => router.push(`/channels/${activeServerId}/${channelId}`)}
        />
      )}
    </MobileNavProvider>
  )
}
