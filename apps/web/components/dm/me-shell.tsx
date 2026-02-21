"use client"

import { DMList } from "./dm-list"
import { MobileNavProvider, MobileOverlay } from "@/components/layout/mobile-nav"
import { useMobileNav } from "@/components/layout/mobile-nav"

function DMListPanel() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  return (
    <>
      {/* Desktop: always visible */}
      <div
        className="hidden md:flex w-60 flex-shrink-0 flex-col overflow-hidden"
        style={{ background: "#2b2d31" }}
      >
        <DMList />
      </div>

      {/* Mobile: slide-in drawer */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-y-0 left-0 z-50 flex w-60 flex-col overflow-hidden"
          style={{ background: "#2b2d31" }}
        >
          <DMList onNavigate={() => setSidebarOpen(false)} />
        </div>
      )}
    </>
  )
}

export function MeShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex flex-1 overflow-hidden">
        <DMListPanel />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  )
}
