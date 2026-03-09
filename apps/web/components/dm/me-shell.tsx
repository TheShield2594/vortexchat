"use client"

import { DMList } from "./dm-list"
import { UserPanel } from "@/components/layout/user-panel"
import { MobileNavProvider, MobileOverlay, MobileSwipeArea } from "@/components/layout/mobile-nav"
import { useMobileNav } from "@/components/layout/mobile-nav"
import { useSwipe } from "@/hooks/use-swipe"

function DMNavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex-1 min-h-0">
        <DMList onNavigate={onNavigate} />
      </div>
      <UserPanel />
    </>
  )
}

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
        <DMNavContent />
      </div>

      {/* Mobile: slide-in drawer */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-y-0 left-0 z-50 flex w-60 flex-col overflow-hidden"
          style={{ background: "var(--app-bg-secondary)" }}
          {...swipe}
        >
          <DMNavContent onNavigate={() => setSidebarOpen(false)} />
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
