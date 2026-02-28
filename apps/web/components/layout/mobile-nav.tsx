"use client"

import { useState, createContext, useContext } from "react"
import { X } from "lucide-react"
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

// Hamburger button shown in the mobile header
export function MobileMenuButton() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  if (!sidebarOpen) return <div className="md:hidden w-8 h-8" aria-hidden="true" />

  return (
    <button
      className="md:hidden w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-white/10"
      style={{ color: "var(--theme-text-secondary)" }}
      onClick={() => setSidebarOpen(false)}
      aria-label="Close sidebar"
    >
      <X className="w-5 h-5" />
    </button>
  )
}

// Overlay backdrop for mobile
export function MobileOverlay() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  const swipe = useSwipe({ onSwipeLeft: () => setSidebarOpen(false) })
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
  })

  return (
    <div
      className="md:hidden fixed inset-y-0 left-0 z-30 w-5"
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
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 flex transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </div>
    </>
  )
}
