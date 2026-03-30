"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { MobileNavProvider } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"
import { setupMobileBackGuard } from "@/utils/mobile-navigation"
import { isFullScreenChannel } from "@/lib/utils/navigation"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullScreen = isFullScreenChannel(pathname)

  // Prevent Android hardware back from exiting the PWA
  useEffect(() => {
    return setupMobileBackGuard("/channels/me")
  }, [])

  return (
    <MobileNavProvider>
      {/* pb-[72px] md:pb-0 reserves space for the floating pill MobileBottomTabBar (56px + 8px margin + safe-area) on mobile; omitted in full-screen channel view */}
      <div className={`flex h-screen overflow-hidden md:pb-0 ${isFullScreen ? "" : "pb-[72px]"}`} style={{ background: "var(--app-bg-primary)", paddingTop: "env(safe-area-inset-top)" }}>
        {/* Guild rail: always visible on desktop; hidden in full-screen channel views on mobile */}
        <div className={isFullScreen ? "hidden md:flex" : "flex"}>
          <ServerSidebarWrapper />
        </div>
        <main id="main-content" className="flex flex-1 overflow-hidden min-w-0" data-main-content>
          {children}
        </main>
      </div>
    </MobileNavProvider>
  )
}
