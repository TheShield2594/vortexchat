"use client"

import { MobileNavProvider, MobileOverlay } from "./mobile-nav"
import { ServerSidebarWrapper } from "./server-sidebar-wrapper"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "#313338" }}>
        <ServerSidebarWrapper />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  )
}
