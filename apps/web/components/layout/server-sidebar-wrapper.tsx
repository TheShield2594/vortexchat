"use client"

import { ServerSidebar } from "./server-sidebar"
import { useMobileNav } from "./mobile-nav"

// On mobile: renders as slide-in drawer. On desktop: inline.
export function ServerSidebarWrapper() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex flex-shrink-0">
        <ServerSidebar />
      </div>

      {/* Mobile: drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-y-0 left-0 z-50 flex">
          <ServerSidebar />
        </div>
      )}
    </>
  )
}
