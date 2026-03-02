import { Compass } from "lucide-react"
import Link from "next/link"

/** Public server discovery — coming soon placeholder. */
export default function DiscoverPage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--theme-bg-primary)", color: "var(--theme-text-primary)" }}
    >
      <div
        className="inline-flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
      >
        <Compass className="h-8 w-8" style={{ color: "var(--theme-accent)" }} />
      </div>

      <div className="max-w-sm">
        <h1
          className="mb-2 text-2xl font-bold font-display"
          style={{ color: "var(--theme-text-bright)" }}
        >
          Discover Public Servers
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
          Browse and join public communities. This feature is coming soon — check back later.
        </p>
      </div>

      <Link
        href="/channels/me"
        className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
      >
        Back to VortexChat
      </Link>
    </main>
  )
}
