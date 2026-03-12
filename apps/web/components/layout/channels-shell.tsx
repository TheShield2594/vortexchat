"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { MobileNavProvider } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"
import { ConnectionBanner } from "@/components/connection-banner"
import { setupMobileBackGuard } from "@/utils/mobile-navigation"
import { isFullScreenChannel } from "./mobile-bottom-tab-bar"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullScreen = isFullScreenChannel(pathname)

  // Prevent Android hardware back from exiting the PWA
  useEffect(() => {
    return setupMobileBackGuard("/channels/me")
  }, [])

  return (
    <MobileNavProvider>
      {/* pb-16 md:pb-0 reserves space for the fixed MobileBottomTabBar on mobile; omitted in full-screen channel view */}
      <div className={`flex h-screen overflow-hidden md:pb-0 ${isFullScreen ? "" : "pb-16"}`} style={{ background: "var(--app-bg-primary)", paddingTop: "env(safe-area-inset-top)" }}>
        <ConnectionBanner />
        {/* Guild rail: always visible on desktop; hidden in full-screen channel views on mobile */}
        <div className={isFullScreen ? "hidden md:flex" : "flex"}>
          <ServerSidebarWrapper />
        </div>
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  )
}
