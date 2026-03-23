import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  FileJson2,
  KeyRound,
  ShieldCheck,
  Inbox,
  ClipboardList,
  MessageSquare,
  Mic2,
  Lock,
  Gift,
  Hash,
  CheckCircle2,
  Github,
  ExternalLink,
  Gamepad2,
  BookOpen,
  Briefcase,
  Heart,
} from "lucide-react"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { VortexLogo } from "@/components/ui/vortex-logo"

// ── SEO / OpenGraph ───────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "VortexChat — Free Open-Source Chat Platform | Chat, Voice, Servers",
  description:
    "VortexChat is a free-forever, open-source chat platform. Real-time messaging, crystal-clear voice & video, organized servers, and end-to-end privacy — no paywalls.",
  openGraph: {
    title: "VortexChat — Free Open-Source Chat Platform",
    description:
      "Real-time messaging, voice/video, servers, and E2E privacy. Free forever — no paywalls.",
    type: "website",
    siteName: "VortexChat",
  },
  twitter: {
    card: "summary_large_image",
    title: "VortexChat — Free Open-Source Chat Platform",
    description:
      "Real-time messaging, voice/video, servers, and E2E privacy. Free forever — no paywalls.",
  },
  alternates: {
    canonical: "/",
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Data ──────────────────────────────────────────────────────────────────────

const coreFeatures = [
  {
    icon: MessageSquare,
    title: "Real-Time Messaging",
    description:
      "Channels, threads, DMs, and group chats. Rich formatting, code blocks, reactions, and offline message queuing so nothing is ever lost.",
  },
  {
    icon: Mic2,
    title: "Voice & Video",
    description:
      "Crystal-clear voice channels and video calls powered by WebRTC. Low-latency, screen share, and live presence — no installs required.",
  },
  {
    icon: Hash,
    title: "Organized Servers",
    description:
      "Text channels, voice channels, roles, and permissions — all in one structured community space. Create one for your guild, study group, or team.",
  },
  {
    icon: Lock,
    title: "Privacy & Security",
    description:
      "Passkey-first authentication, TOTP 2FA, and end-to-end encrypted direct messages. Your conversations stay yours.",
  },
  {
    icon: Gift,
    title: "Free Forever",
    description:
      "No Nitro. No paywall. Every feature available to every user from day one — including custom themes, reactions, and file uploads.",
  },
  {
    icon: FileJson2,
    title: "Server Templates",
    description:
      "Bootstrap any community instantly with Gaming, Study, Startup, or Creator templates. Import/export JSON, preview diffs, apply transactionally.",
  },
]

const differentiators = [
  {
    icon: KeyRound,
    title: "Passkey-First Auth",
    description: "WebAuthn passkeys replace passwords. Phishing-resistant and device-bound by default.",
  },
  {
    icon: ClipboardList,
    title: "Moderation Timeline",
    description: "Every ban, kick, and role change logged in a unified audit trail.",
  },
  {
    icon: Inbox,
    title: "Outbox Reliability",
    description: "Messages queue offline and replay on reconnect. Zero lost messages.",
  },
  {
    icon: ShieldCheck,
    title: "Open Source",
    description: "Fully auditable codebase. No black-box algorithms, no shadow bans.",
  },
]

const useCases = [
  {
    icon: Gamepad2,
    label: "Gamers & Guilds",
    description: "Low-latency voice, role-based channels, and server templates built for gaming communities.",
    accent: "#f92aad",
  },
  {
    icon: BookOpen,
    label: "Study Groups",
    description: "Focused text channels, quiet voice rooms, and thread-based Q&A for students and educators.",
    accent: "#00e5ff",
  },
  {
    icon: Briefcase,
    label: "Work Teams",
    description: "Organized servers with permission-gated channels, audit logs, and DMs that stay professional.",
    accent: "#3ddc97",
  },
  {
    icon: Heart,
    label: "Fan Communities",
    description: "Build a fan space with announcements, event coordination, and creator-tier roles.",
    accent: "#ffb84d",
  },
]

const themes = [
  { name: "Midnight Neon", accent: "#00e5ff", bg: "#1b1f31", label: "Default" },
  { name: "Synthwave", accent: "#f92aad", bg: "#2a1e46", label: "" },
  { name: "Carbon", accent: "#3ba55c", bg: "#1f2124", label: "" },
  { name: "Twilight", accent: "#5865f2", bg: "#313338", label: "" },
  { name: "Frost", accent: "#e0a526", bg: "#1a2332", label: "" },
]

const steps = [
  { num: "01", title: "Create your free account", body: "Sign up in seconds with a passkey or email. No credit card, no upsells." },
  { num: "02", title: "Join or create a server", body: "Browse public servers, accept an invite link, or spin up your own from a template." },
  { num: "03", title: "Start chatting", body: "Text, voice, video, reactions — everything works out of the box. Invite your people." },
]

// ── Page ──────────────────────────────────────────────────────────────────────

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
    <main id="main-content" className="min-h-screen" style={{ background: "var(--theme-bg-primary)", color: "var(--theme-text-primary)" }}>

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(27,31,49,0.85)" }}
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 md:px-10">
          <div className="flex items-center gap-2.5">
            <VortexLogo size={22} />
            <span className="text-base font-bold tracking-tight font-display" style={{ color: "var(--theme-text-bright)" }}>
              VortexChat
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
        aria-labelledby="hero-heading"
      >
        {/* Gradient mesh background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--theme-accent) 14%, transparent), transparent 65%), radial-gradient(ellipse 50% 40% at 85% 70%, color-mix(in srgb, var(--theme-accent-secondary) 8%, transparent), transparent 60%), var(--theme-bg-primary)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-20 md:px-10 lg:flex lg:items-center lg:gap-16 lg:py-32">
          {/* Left — copy */}
          <div className="flex-1 max-w-2xl">
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest"
              style={{
                borderColor: "color-mix(in srgb, var(--theme-accent) 25%, transparent)",
                background: "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
                color: "var(--theme-accent)",
              }}
            >
              Free forever · Open source · No paywalls
            </div>

            <h1
              id="hero-heading"
              className="text-4xl font-extrabold leading-[1.1] tracking-tight font-display md:text-6xl"
              style={{ color: "var(--theme-text-bright)" }}
            >
              The free &amp; open-source{" "}
              <span style={{ color: "var(--theme-accent)" }}>chat platform</span>
            </h1>

            <p
              className="mt-5 text-lg md:text-xl leading-relaxed"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              VortexChat gives your community real-time messaging, voice &amp; video channels, organized
              servers, and end-to-end privacy — all completely free, forever.
            </p>

            <ul className="mt-5 space-y-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
              {[
                "No premium tiers or feature paywalls",
                "Passkey-secured from day one",
                "Works for gamers, teams, and communities",
              ].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--theme-success)" }} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-opacity hover:opacity-90"
                style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
              >
                Get Started Free <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="rounded-lg border px-6 py-3 font-semibold transition-colors hover:opacity-80"
                style={{
                  borderColor: "rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--theme-text-primary)",
                }}
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Right — animated vortex motif */}
          <div
            className="mt-14 lg:mt-0 flex-shrink-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="relative" style={{ width: 300, height: 300 }}>
              <div
                className="absolute inset-0 rounded-full vortex-glow"
                style={{ background: "var(--theme-accent)", filter: "blur(64px)", opacity: 0.18 }}
              />
              <div
                className="absolute vortex-orbit-slow"
                style={{
                  inset: 12, borderRadius: "50%",
                  border: "2px solid var(--theme-accent)",
                  borderTopColor: "transparent", borderRightColor: "transparent",
                  opacity: 0.5,
                }}
              />
              <div
                className="absolute vortex-orbit-rev"
                style={{
                  inset: 56, borderRadius: "50%",
                  border: "2px solid var(--theme-accent-secondary)",
                  borderBottomColor: "transparent", borderLeftColor: "transparent",
                  opacity: 0.45,
                }}
              />
              <div
                className="absolute vortex-orbit"
                style={{
                  inset: 96, borderRadius: "50%",
                  border: "2px solid var(--theme-accent)",
                  borderTopColor: "transparent", borderLeftColor: "transparent",
                  opacity: 0.35, animationDuration: "3s",
                }}
              />
              {/* Floating feature icons orbiting */}
              <div
                className="absolute vortex-orbit-slow"
                style={{ inset: 0, borderRadius: "50%" }}
              >
                <div
                  className="absolute rounded-lg p-2"
                  style={{
                    top: 0, left: "50%", transform: "translateX(-50%) translateY(-50%)",
                    background: "var(--theme-bg-secondary)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <MessageSquare className="h-4 w-4" style={{ color: "var(--theme-accent)" }} />
                </div>
                <div
                  className="absolute rounded-lg p-2"
                  style={{
                    bottom: 0, left: "50%", transform: "translateX(-50%) translateY(50%)",
                    background: "var(--theme-bg-secondary)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <Mic2 className="h-4 w-4" style={{ color: "var(--theme-accent-secondary)" }} />
                </div>
              </div>
              <div
                className="absolute"
                style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
              >
                <VortexLogo
                  size={52}
                  className="drop-shadow-[0_0_12px_var(--theme-accent)]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Core Feature Grid ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10" aria-labelledby="features-heading">
        <div className="mb-10">
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-widest font-display"
            style={{ color: "var(--theme-accent)" }}
          >
            Everything you need
          </p>
          <h2
            id="features-heading"
            className="text-2xl font-bold font-display"
            style={{ color: "var(--theme-text-bright)" }}
          >
            One platform. Zero paywalls.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coreFeatures.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border p-6 transition-colors hover:border-[color-mix(in_srgb,var(--theme-accent)_20%,transparent)]"
              style={{
                borderColor: "rgba(255,255,255,0.06)",
                background: "var(--theme-bg-secondary)",
              }}
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
              >
                <Icon aria-hidden="true" className="h-5 w-5" style={{ color: "var(--theme-accent)" }} />
              </div>
              <h3 className="mb-2 font-semibold font-display" style={{ color: "var(--theme-text-bright)" }}>
                {title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section
        className="border-t border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "var(--theme-bg-secondary)" }}
        aria-labelledby="how-it-works-heading"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div className="mb-10 text-center">
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest font-display"
              style={{ color: "var(--theme-accent)" }}
            >
              Get started in minutes
            </p>
            <h2
              id="how-it-works-heading"
              className="text-2xl font-bold font-display"
              style={{ color: "var(--theme-text-bright)" }}
            >
              How it works
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.num} className="relative flex flex-col items-center text-center">
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className="absolute hidden sm:block top-5 left-[calc(50%+2rem)] right-0 h-px"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold font-display"
                  style={{
                    borderColor: "color-mix(in srgb, var(--theme-accent) 30%, transparent)",
                    background: "color-mix(in srgb, var(--theme-accent) 10%, transparent)",
                    color: "var(--theme-accent)",
                  }}
                >
                  {step.num}
                </div>
                <h3
                  className="mb-2 font-semibold font-display"
                  style={{ color: "var(--theme-text-bright)" }}
                >
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
            >
              Create your free account <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Use Cases ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10" aria-labelledby="use-cases-heading">
        <div className="mb-10">
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-widest font-display"
            style={{ color: "var(--theme-accent)" }}
          >
            Built for everyone
          </p>
          <h2
            id="use-cases-heading"
            className="text-2xl font-bold font-display"
            style={{ color: "var(--theme-text-bright)" }}
          >
            Guilds, teams, or fan clubs — VortexChat fits.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map(({ icon: Icon, label, description, accent }) => (
            <div
              key={label}
              className="rounded-xl border p-5"
              style={{
                borderColor: hexToRgba(accent, 0.18),
                background: "var(--theme-bg-secondary)",
              }}
            >
              <div
                className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: hexToRgba(accent, 0.12) }}
              >
                <Icon aria-hidden="true" className="h-5 w-5" style={{ color: accent }} />
              </div>
              <h3 className="mb-1.5 font-semibold font-display" style={{ color: "var(--theme-text-bright)" }}>
                {label}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Open Source / No Paywall ──────────────────────────────────────── */}
      <section
        className="border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "var(--theme-bg-secondary)" }}
        aria-labelledby="open-source-heading"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div className="rounded-2xl border p-8 md:p-12 relative overflow-hidden"
            style={{
              borderColor: "color-mix(in srgb, var(--theme-accent) 18%, transparent)",
              background: "color-mix(in srgb, var(--theme-accent) 5%, var(--theme-bg-primary))",
            }}
          >
            {/* Decorative glow */}
            <div
              className="absolute -top-24 -right-24 h-64 w-64 rounded-full pointer-events-none"
              style={{ background: "var(--theme-accent)", filter: "blur(80px)", opacity: 0.08 }}
              aria-hidden="true"
            />

            <div className="relative md:flex md:items-center md:gap-12">
              <div className="flex-1">
                <div
                  className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-widest"
                  style={{
                    borderColor: "color-mix(in srgb, var(--theme-accent) 30%, transparent)",
                    color: "var(--theme-accent)",
                    background: "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
                  }}
                >
                  <Github className="h-3.5 w-3.5" aria-hidden="true" />
                  100% Open Source
                </div>
                <h2
                  id="open-source-heading"
                  className="mb-3 text-2xl font-bold font-display md:text-3xl"
                  style={{ color: "var(--theme-text-bright)" }}
                >
                  No Nitro. No paywalls. Ever.
                </h2>
                <p className="text-base leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                  Every feature — custom themes, file uploads, video calls, server templates — is
                  available to every user from day one. The full codebase is open for audit,
                  contribution, and self-hosting.
                </p>
                <ul className="mt-5 space-y-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
                  {[
                    "All features free, always",
                    "Self-host on your own infrastructure",
                    "Community-driven roadmap",
                    "No dark-pattern algorithms",
                  ].map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--theme-success)" }} aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 md:mt-0 flex flex-col gap-3 md:w-56">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-semibold transition-opacity hover:opacity-90 text-center"
                  style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
                >
                  Get Started Free <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <a
                  href="https://github.com/TheShield2594/vortexchat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border px-5 py-3 font-semibold transition-opacity hover:opacity-80 text-center text-sm"
                  style={{
                    borderColor: "rgba(255,255,255,0.15)",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--theme-text-primary)",
                  }}
                >
                  <Github className="h-4 w-4" aria-hidden="true" />
                  View on GitHub
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Under-the-hood differentiators ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10" aria-labelledby="differentiators-heading">
        <div className="mb-10">
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-widest font-display"
            style={{ color: "var(--theme-accent)" }}
          >
            Built different
          </p>
          <h2
            id="differentiators-heading"
            className="text-2xl font-bold font-display"
            style={{ color: "var(--theme-text-bright)" }}
          >
            Under the hood.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {differentiators.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border p-5"
              style={{
                borderColor: "rgba(255,255,255,0.06)",
                background: "var(--theme-bg-secondary)",
              }}
            >
              <div
                className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}
              >
                <Icon aria-hidden="true" className="h-4 w-4" style={{ color: "var(--theme-accent)" }} />
              </div>
              <h3 className="mb-1.5 font-semibold text-sm font-display" style={{ color: "var(--theme-text-bright)" }}>
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
        aria-labelledby="themes-heading"
      >
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-sm">
              <h2
                id="themes-heading"
                className="mb-2 text-2xl font-bold font-display"
                style={{ color: "var(--theme-text-bright)" }}
              >
                Your interface, your vibe.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                Four hand-crafted themes ship with every account. Switch instantly — no refresh
                required. All free.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {themes.map((theme) => (
                <div
                  key={theme.name}
                  className="flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium"
                  style={{
                    background: theme.bg,
                    borderColor: hexToRgba(theme.accent, 0.25),
                    color: "#e6ecff",
                  }}
                >
                  <span
                    className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ background: theme.accent, boxShadow: `0 0 6px ${hexToRgba(theme.accent, 0.5)}` }}
                    aria-hidden="true"
                  />
                  <span>{theme.name}</span>
                  {theme.label && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background: hexToRgba(theme.accent, 0.13),
                        color: theme.accent,
                        border: `1px solid ${hexToRgba(theme.accent, 0.27)}`,
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

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section
        className="mx-auto max-w-6xl px-6 py-20 text-center md:px-10"
        aria-labelledby="cta-heading"
      >
        <div
          className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full mb-5"
          style={{ background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
          aria-hidden="true"
        >
          <VortexLogo size={28} />
        </div>
        <h2
          id="cta-heading"
          className="mb-3 text-3xl font-bold font-display md:text-4xl"
          style={{ color: "var(--theme-text-bright)" }}
        >
          Ready to find your community?
        </h2>
        <p className="mb-8 text-base max-w-md mx-auto" style={{ color: "var(--theme-text-secondary)" }}>
          Free forever. No credit card. Passkey-secured from day one. Join the open-source chat
          platform built for everyone.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg px-7 py-3.5 font-semibold transition-opacity hover:opacity-90 text-base"
            style={{ background: "var(--theme-accent)", color: "var(--theme-bg-tertiary)" }}
          >
            Get Started Free <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="rounded-lg border px-7 py-3.5 font-semibold transition-colors hover:opacity-80 text-base"
            style={{
              borderColor: "rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--theme-text-primary)",
            }}
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        className="border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "var(--theme-bg-tertiary)" }}
        aria-label="Site footer"
      >
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="mb-3 flex items-center gap-2">
                <VortexLogo size={20} />
                <span className="font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
                  VortexChat
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>
                The free and open-source chat platform. Built for communities, teams, and
                creators.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-x-12 gap-y-6">
              <nav aria-label="Product links">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                  Product
                </p>
                <ul className="space-y-2">
                  {[
                    { label: "Sign Up", href: "/register" },
                    { label: "Sign In", href: "/login" },
                  ].map(({ label, href }) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-sm transition-colors hover:opacity-80"
                        style={{ color: "var(--theme-text-secondary)" }}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-label="Company links">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                  Company
                </p>
                <ul className="space-y-2">
                  {[
                    { label: "GitHub", href: "https://github.com/TheShield2594/vortexchat", external: true },
                    { label: "Terms of Service", href: "/terms" },
                    { label: "Privacy Policy", href: "/privacy" },
                  ].map(({ label, href, external }) => (
                    <li key={label}>
                      {external ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80"
                          style={{ color: "var(--theme-text-secondary)" }}
                        >
                          {label}
                          <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
                        </a>
                      ) : (
                        <Link
                          href={href}
                          className="text-sm transition-colors hover:opacity-80"
                          style={{ color: "var(--theme-text-secondary)" }}
                        >
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          <div
            className="mt-8 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "rgba(255,255,255,0.06)", color: "var(--theme-text-muted)" }}
          >
            <p>© {new Date().getFullYear()} VortexChat. Open source, free forever.</p>
            <p>
              Made with{" "}
              <Heart className="inline h-3 w-3 mx-0.5" style={{ color: "var(--theme-accent-secondary)" }} aria-label="love" />{" "}
              for communities everywhere.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
