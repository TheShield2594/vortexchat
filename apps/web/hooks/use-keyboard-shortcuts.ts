"use client"

import { useEffect } from "react"

interface ShortcutHandlers {
  onQuickSwitcher?: () => void      // Ctrl/Cmd+K
  onMarkRead?: () => void            // Escape (when focused outside input)
  onSearch?: () => void              // Ctrl/Cmd+F
}

/**
 * Global keyboard shortcuts matching Discord's primary bindings.
 * Alt+Up / Alt+Down channel navigation is handled separately in ChannelSidebar.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      const meta = e.metaKey || e.ctrlKey

      // Ctrl/Cmd+K → quickswitcher
      if (meta && e.key === "k") {
        e.preventDefault()
        handlers.onQuickSwitcher?.()
        return
      }

      // Ctrl/Cmd+F → search
      if (meta && e.key === "f") {
        e.preventDefault()
        handlers.onSearch?.()
        return
      }

      // Escape → mark channel read / close modals (only when not in an input)
      if (e.key === "Escape" && !inInput) {
        handlers.onMarkRead?.()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handlers.onQuickSwitcher, handlers.onMarkRead, handlers.onSearch])
}

/**
 * Alt+Up / Alt+Down — navigate between channels in order.
 * channelIds: ordered list of visible channel IDs
 * activeId: currently active channel
 * onNavigate: called with the ID to navigate to
 */
export function useChannelNavShortcuts(
  channelIds: string[],
  activeId: string | null,
  onNavigate: (id: string) => void
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return

      e.preventDefault()
      if (channelIds.length === 0) return

      const currentIndex = activeId ? channelIds.indexOf(activeId) : -1
      let nextIndex: number

      if (e.key === "ArrowUp") {
        nextIndex = currentIndex <= 0 ? channelIds.length - 1 : currentIndex - 1
      } else {
        nextIndex = currentIndex >= channelIds.length - 1 ? 0 : currentIndex + 1
      }

      onNavigate(channelIds[nextIndex])
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [channelIds, activeId, onNavigate])
}
