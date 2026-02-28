"use client"

import { DMList } from "./dm-list"
import { MobileNavProvider, MobileOverlay, MobileSwipeArea } from "@/components/layout/mobile-nav"
import { useMobileNav } from "@/components/layout/mobile-nav"
import { useSwipe } from "@/hooks/use-swipe"

function DMListPanel() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  const swipe = useSwipe({ onSwipeLeft: () => setSidebarOpen(false) })
  return (
    <>
      {/* Desktop: always visible */}
      <div
        className="hidden md:flex w-60 flex-shrink-0 flex-col overflow-hidden"
        style={{ background: "var(--app-bg-secondary)" }}
      >
        <DMList />
      </div>

      {/* Mobile: slide-in drawer */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-y-0 left-0 z-50 flex w-60 flex-col overflow-hidden"
          style={{ background: "var(--app-bg-secondary)" }}
          {...swipe}
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
        <MobileSwipeArea />
        <MobileOverlay />
        <main id="main-content" className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </main>
      </div>
    </MobileNavProvider>
  )
}
