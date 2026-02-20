"use client"

import { useEffect } from "react"

export default function ChannelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[channels] error:", error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center bg-vortex-bg-primary">
      <div className="text-center space-y-4 max-w-md px-4">
        <h2 className="text-xl font-bold text-white">Something went wrong</h2>
        <p className="text-vortex-text-secondary text-sm">
          An error occurred while loading this page.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded bg-vortex-accent text-white text-sm font-medium hover:bg-vortex-accent/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
