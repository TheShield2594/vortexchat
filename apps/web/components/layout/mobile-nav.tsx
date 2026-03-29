"use client"

import { useState, createContext, useContext, useEffect } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useSwipe } from "@/hooks/use-swipe"

interface MobileNavCtx {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

const MobileNavContext = createContext<MobileNavCtx>({
  sidebarOpen: false,
  setSidebarOpen: () => {},
})

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <MobileNavContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav() {
  return useContext(MobileNavContext)
}

// Hamburger button shown in the mobile header — opens or closes the sidebar drawer
export function MobileMenuButton() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  return (
    <button
      className="md:hidden w-10 h-10 flex items-center justify-center rounded-md transition-colors hover:bg-white/10 active:bg-white/15"
      style={{ color: "var(--theme-text-secondary)" }}
      onClick={() => setSidebarOpen(!sidebarOpen)}
      aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      aria-expanded={sidebarOpen}
    >
      {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  )
}

// Overlay backdrop for mobile
export function MobileOverlay() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  const swipe = useSwipe({ onSwipeLeft: () => setSidebarOpen(false) })

  // Set inert on main content when drawer is open to trap focus inside the drawer.
  // Only applies when the viewport is mobile-width; if the user resizes to desktop
  // while the sidebar is open, inert is removed immediately via a media-query listener.
  useEffect(() => {
    const main = document.querySelector("[data-main-content]")
    if (!main) return

    const mql = window.matchMedia("(max-width: 768px)")

    function sync(): void {
      if (sidebarOpen && mql.matches) {
        main!.setAttribute("inert", "")
      } else {
        main!.removeAttribute("inert")
      }
    }

    sync()
    mql.addEventListener("change", sync)

    return () => {
      main.removeAttribute("inert")
      mql.removeEventListener("change", sync)
    }
  }, [sidebarOpen])

  if (!sidebarOpen) return null
  return (
    <div
      className="md:hidden fixed inset-0 z-40 bg-black/60"
      onClick={() => setSidebarOpen(false)}
      {...swipe}
    />
  )
}

export function MobileSwipeArea() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  const swipe = useSwipe({
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => sidebarOpen && setSidebarOpen(false),
    minDistance: 72,
  })

  return (
    <div
      className="md:hidden fixed inset-y-0 left-0 z-30 w-20"
      aria-hidden="true"
      {...swipe}
    />
  )
}

// Wrapper that makes a sidebar a slide-in drawer on mobile
export function MobileDrawer({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useMobileNav()
  return (
    <>
      {/* Desktop: always visible inline */}
      <div className="hidden md:flex flex-shrink-0">
        {children}
      </div>
      {/* Mobile: slide-in drawer */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-50 flex transform motion-safe:transition-transform motion-safe:duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {children}
      </div>
    </>
  )
}
