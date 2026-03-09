"use client"

import { MobileNavProvider, MobileOverlay, MobileSwipeArea } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      {/* pb-16 md:pb-0 reserves space for the fixed MobileBottomTabBar on mobile */}
      <div className="flex h-screen overflow-hidden pb-16 md:pb-0" style={{ background: "var(--app-bg-primary)" }}>
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
