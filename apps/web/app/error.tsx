"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Unhandled error:", error)
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4"
      style={{ background: "#313338", color: "#f2f3f5" }}
    >
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="text-sm" style={{ color: "#b5bac1" }}>
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ background: "#5865f2" }}
      >
        Try Again
      </button>
    </div>
  )
}
