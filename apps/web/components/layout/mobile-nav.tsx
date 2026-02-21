"use client"

import { useState, createContext, useContext } from "react"
import { Menu, X, ArrowLeft } from "lucide-react"

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
  return (
    <button
      className="md:hidden w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-white/10"
      style={{ color: "#b5bac1" }}
      onClick={() => setSidebarOpen(!sidebarOpen)}
      aria-label="Toggle sidebar"
    >
      {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  )
}

// Overlay backdrop for mobile
export function MobileOverlay() {
  const { sidebarOpen, setSidebarOpen } = useMobileNav()
  if (!sidebarOpen) return null
  return (
    <div
      className="md:hidden fixed inset-0 z-40 bg-black/60"
      onClick={() => setSidebarOpen(false)}
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
