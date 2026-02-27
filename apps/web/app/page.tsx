import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, FileJson2, KeyRound, ShieldCheck, Inbox, ClipboardList } from "lucide-react"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { VortexLogo } from "@/components/ui/vortex-logo"

// ── Feature differentiators unique to VortexChat ────────────────────────────

const features = [
  {
    icon: FileJson2,
    title: "Server Templates",
    description:
      "Bootstrap any community instantly. Gaming, Study, Startup, and Creator templates ship out of the box — import/export JSON, preview diffs, apply transactionally.",
  },
  {
    icon: KeyRound,
    title: "Passkey-first Security",
    description:
      "WebAuthn passkeys replace passwords by default. Phishing-resistant, device-bound, and paired with TOTP-based 2FA and one-time recovery codes.",
  },
  {
    icon: ClipboardList,
    title: "Moderation Timeline",
    description:
      "Every ban, kick, role change, and channel edit logged in a unified audit trail. Understand your server's history at a glance.",
  },
  {
    icon: Inbox,
    title: "Outbox Reliability",
    description:
      "Messages queue offline and replay automatically on reconnect. Zero lost messages — even on flaky connections.",
  },
]

// ── Theme presets teaser ─────────────────────────────────────────────────────

const themes = [
  { name: "Midnight Neon", accent: "#00e5ff", bg: "#1b1f31", label: "Default" },
  { name: "Synthwave", accent: "#f92aad", bg: "#2a1e46", label: "" },
  { name: "Carbon", accent: "#3ba55c", bg: "#1f2124", label: "" },
  { name: "Discord", accent: "#5865f2", bg: "#313338", label: "" },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (!error && user) {
    redirect("/channels/me")
  }

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--theme-bg-primary)", color: "var(--theme-text-primary)" }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Layered background gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--theme-accent) 12%, transparent), transparent 70%), var(--theme-bg-primary)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-20 md:px-10 lg:flex lg:items-center lg:gap-16 lg:py-28">
          {/* Left — copy */}
          <div className="flex-1 max-w-2xl">
            {/* Wordmark */}
            <div className="mb-8 flex items-center gap-2.5">
              <VortexLogo size={28} style={{ color: "var(--theme-accent)" } as React.CSSProperties} />
              <span
                className="text-lg font-bold tracking-tight font-display"
                style={{ color: "var(--theme-text-bright)" }}
              >
                VortexChat
              </span>
            </div>

            <h1
              className="text-4xl font-extrabold leading-[1.1] tracking-tight font-display md:text-6xl"
              style={{ color: "var(--theme-text-bright)" }}
            >
              The pull of great{" "}
              <span style={{ color: "var(--theme-accent)" }}>conversation.</span>
            </h1>

            <p
              className="mt-5 text-lg md:text-xl leading-relaxed"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              VortexChat is the platform for focused teams and creative communities — real-time
              messaging, voice, and collaboration without the noise.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-semibold transition-opacity hover:opacity-90"
                style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
              >
                Get started free <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="rounded-lg border px-5 py-3 font-semibold transition-colors hover:opacity-80"
                style={{
                  borderColor: "rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--theme-text-primary)",
                }}
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* Right — animated vortex motif */}
          <div
            className="mt-14 lg:mt-0 flex-shrink-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="relative" style={{ width: 300, height: 300 }}>
              {/* Glow blob */}
              <div
                className="absolute inset-0 rounded-full vortex-glow"
                style={{
                  background: "var(--theme-accent)",
                  filter: "blur(64px)",
                  opacity: 0.2,
                }}
              />
              {/* Outer ring */}
              <div
                className="absolute vortex-orbit-slow"
                style={{
                  inset: 12,
                  borderRadius: "50%",
                  border: "2px solid var(--theme-accent)",
                  borderTopColor: "transparent",
                  borderRightColor: "transparent",
                  opacity: 0.5,
                }}
              />
              {/* Middle ring — opposite direction */}
              <div
                className="absolute vortex-orbit-rev"
                style={{
                  inset: 56,
                  borderRadius: "50%",
                  border: "2px solid #f92aad",
                  borderBottomColor: "transparent",
                  borderLeftColor: "transparent",
                  opacity: 0.45,
                }}
              />
              {/* Inner ring */}
              <div
                className="absolute vortex-orbit"
                style={{
                  inset: 96,
                  borderRadius: "50%",
                  border: "2px solid var(--theme-accent)",
                  borderTopColor: "transparent",
                  borderLeftColor: "transparent",
                  opacity: 0.35,
                  animationDuration: "3s",
                }}
              />
              {/* Center VortexLogo */}
              <div
                className="absolute"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <VortexLogo
                  size={52}
                  style={{ color: "var(--theme-accent)" } as React.CSSProperties}
                  className="drop-shadow-[0_0_12px_var(--theme-accent)]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <h2
          className="mb-2 text-xs font-semibold uppercase tracking-widest font-display"
          style={{ color: "var(--theme-accent)" }}
        >
          What makes Vortex different
        </h2>
        <p
          className="mb-10 text-2xl font-bold font-display"
          style={{ color: "var(--theme-text-bright)" }}
        >
          Built for depth, not just scale.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border p-6 transition-colors"
              style={{
                borderColor: "rgba(255,255,255,0.06)",
                background: "var(--theme-bg-secondary)",
              }}
            >
              <div
                className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)",
                }}
              >
                <Icon
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={{ color: "var(--theme-accent)" }}
                />
              </div>
              <h3
                className="mb-2 font-semibold font-display"
                style={{ color: "var(--theme-text-bright)" }}
              >
                {title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Themes teaser ────────────────────────────────────────────────── */}
      <section
        className="border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "var(--theme-bg-secondary)" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-sm">
              <h2
                className="mb-2 text-2xl font-bold font-display"
                style={{ color: "var(--theme-text-bright)" }}
              >
                Your interface, your vibe.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                Four hand-crafted themes ship with every account. Switch instantly — no refresh
                required.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {themes.map((theme) => (
                <div
                  key={theme.name}
                  className="flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium"
                  style={{
                    background: theme.bg,
                    borderColor: theme.accent + "40",
                    color: "#e6ecff",
                  }}
                >
                  {/* Accent swatch */}
                  <span
                    className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                    style={{ background: theme.accent, boxShadow: `0 0 6px ${theme.accent}80` }}
                  />
                  <span>{theme.name}</span>
                  {theme.label && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background: theme.accent + "22",
                        color: theme.accent,
                        border: `1px solid ${theme.accent}44`,
                      }}
                    >
                      {theme.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA footer ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 text-center md:px-10">
        <ShieldCheck
          aria-hidden="true"
          className="mx-auto mb-4 h-8 w-8"
          style={{ color: "var(--theme-success)" }}
        />
        <h2
          className="mb-3 text-3xl font-bold font-display"
          style={{ color: "var(--theme-text-bright)" }}
        >
          Ready to find your focus?
        </h2>
        <p className="mb-8 text-base" style={{ color: "var(--theme-text-secondary)" }}>
          Free forever. No credit card. Passkey-secured from day one.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
        >
          Create your account <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
    </main>
  )
}
