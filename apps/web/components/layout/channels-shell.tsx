"use client"

import { useEffect } from "react"
import { MobileNavProvider, MobileOverlay, MobileSwipeArea } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"
import { ConnectionBanner } from "@/components/connection-banner"
import { setupMobileBackGuard } from "@/utils/mobile-navigation"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  // Prevent Android hardware back from exiting the PWA
  useEffect(() => {
    return setupMobileBackGuard("/channels/me")
  }, [])

  return (
    <MobileNavProvider>
      {/* pb-16 md:pb-0 reserves space for the fixed MobileBottomTabBar on mobile */}
      <div className="flex h-screen overflow-hidden pb-16 md:pb-0" style={{ background: "var(--app-bg-primary)" }}>
        <ConnectionBanner />
        <ServerSidebarWrapper />
        <MobileSwipeArea />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  )
}
