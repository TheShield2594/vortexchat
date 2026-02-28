"use client"

import { ServerSidebar } from "./server-sidebar"
import { useMobileNav } from "./mobile-nav"
import { useSwipe } from "@/hooks/use-swipe"

// On mobile: renders as slide-in drawer. On desktop: inline.
export function ServerSidebarWrapper() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  const swipe = useSwipe({ onSwipeLeft: () => setSidebarOpen(false) })

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex flex-shrink-0">
        <ServerSidebar />
      </div>

      {/* Mobile: drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-y-0 left-0 z-50 flex" {...swipe}>
          <ServerSidebar />
        </div>
      )}
    </>
  )
}
