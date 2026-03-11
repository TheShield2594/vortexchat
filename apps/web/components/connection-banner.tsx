"use client"

import type { ReactNode } from "react"
import { useConnectionStatus, type ConnectionState } from "@/hooks/use-connection-status"
import { WifiOff, RefreshCw, Loader2 } from "lucide-react"

const LABELS: Record<Exclude<ConnectionState, "connected">, { icon: ReactNode; text: string }> = {
  offline: {
    icon: <WifiOff className="h-4 w-4" />,
    text: "You're offline",
  },
  disconnected: {
    icon: <WifiOff className="h-4 w-4" />,
    text: "Connection lost",
  },
  reconnecting: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    text: "Reconnecting…",
  },
}

/**
 * Persistent banner shown when the connection is lost.
 * Renders at the top of the channels shell; hidden when connected.
 */
export function ConnectionBanner() {
  const { status, retry } = useConnectionStatus()

  if (status === "connected") return null

  const { icon, text } = LABELS[status]

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
      style={{
        background: status === "offline" ? "var(--theme-danger, #e53e3e)" : "var(--theme-warning, #d69e2e)",
        color: "#fff",
        paddingTop: "max(6px, env(safe-area-inset-top))",
      }}
    >
      {icon}
      <span>{text}</span>
      {status !== "reconnecting" && (
        <button
          type="button"
          onClick={retry}
          className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold underline hover:opacity-80"
        >
          <RefreshCw className="h-3 w-3" /> Reconnect
        </button>
      )}
    </div>
  )
}
