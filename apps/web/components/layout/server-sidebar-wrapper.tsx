"use client"

import { ServerSidebar } from "./server-sidebar"
import { useMobileNav } from "./mobile-nav"

interface Props {
  onOpenQuickSwitcher: () => void
  onOpenSearch: () => void
}

// On mobile: renders as slide-in drawer. On desktop: inline.
export function ServerSidebarWrapper({ onOpenQuickSwitcher, onOpenSearch }: Props) {
  const { sidebarOpen } = useMobileNav()

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex flex-shrink-0">
        <ServerSidebar onOpenQuickSwitcher={onOpenQuickSwitcher} onOpenSearch={onOpenSearch} />
      </div>

      {/* Mobile: drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-y-0 left-0 z-50 flex">
          <ServerSidebar onOpenQuickSwitcher={onOpenQuickSwitcher} onOpenSearch={onOpenSearch} />
        </div>
      )}
    </>
  )
}
