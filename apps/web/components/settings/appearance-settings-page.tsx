"use client"

import React, { useRef, useCallback, useState, useEffect } from "react"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import type { MessageDisplay, FontScale, Saturation, ThemePreset, ReducedMotion, TimestampFormat } from "@/lib/stores/appearance-store"

const MESSAGE_DISPLAY_OPTIONS: { value: MessageDisplay; label: string; description: string }[] = [
  { value: "cozy", label: "Cozy", description: "Avatars shown — comfortable reading" },
  { value: "compact", label: "Compact", description: "More messages visible at once" },
]

const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
]

const SATURATION_OPTIONS: { value: Saturation; label: string }[] = [
  { value: "reduced", label: "Reduced" },
  { value: "normal", label: "Normal" },
]

const REDUCED_MOTION_OPTIONS: { value: ReducedMotion; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow your OS preference" },
  { value: "on", label: "On", description: "Disable all animations" },
  { value: "off", label: "Off", description: "Always show animations" },
]

const TIMESTAMP_FORMAT_OPTIONS: { value: TimestampFormat; label: string; example: string }[] = [
  { value: "12h", label: "12-hour", example: "2:41 PM" },
  { value: "24h", label: "24-hour", example: "14:41" },
]

const THEME_PRESET_OPTIONS: {
  value: ThemePreset
  label: string
  description: string
  accent: string
  bg: string
  surface: string
  textPrimary: string
  textMuted: string
}[] = [
  {
    value: "twilight",
    label: "Twilight",
    description: "Classic dark with blue accent",
    accent: "#5865F2",
    bg: "#313338",
    surface: "#2b2d31",
    textPrimary: "#f2f3f5",
    textMuted: "#949ba4",
  },
  {
    value: "midnight-neon",
    label: "Midnight Neon",
    description: "Deep dark with vibrant neon",
    accent: "#a78bfa",
    bg: "#0f0f14",
    surface: "#1a1a24",
    textPrimary: "#e8e6f0",
    textMuted: "#6b6880",
  },
  {
    value: "synthwave",
    label: "Synthwave",
    description: "Retro 80s with pink & cyan",
    accent: "#f472b6",
    bg: "#1a0a2e",
    surface: "#21143d",
    textPrimary: "#f0e6ff",
    textMuted: "#9b7ec8",
  },
  {
    value: "carbon",
    label: "Carbon",
    description: "Minimal gray with teal accent",
    accent: "#2dd4bf",
    bg: "#171717",
    surface: "#1f1f1f",
    textPrimary: "#e5e5e5",
    textMuted: "#737373",
  },
  {
    value: "oled-black",
    label: "OLED Black",
    description: "True black with Tiffany blue",
    accent: "#0abab5",
    bg: "#000000",
    surface: "#080808",
    textPrimary: "#e0e0e0",
    textMuted: "#666666",
  },
  {
    value: "frost",
    label: "Frost",
    description: "Cool slate with warm amber",
    accent: "#e0a526",
    bg: "#1a2332",
    surface: "#151d2a",
    textPrimary: "#d8e3f0",
    textMuted: "#7a8ba0",
  },
  {
    value: "clarity",
    label: "Clarity",
    description: "Clean & minimal light theme",
    accent: "#2563eb",
    bg: "#ffffff",
    surface: "#f8f9fa",
    textPrimary: "#1a1a1a",
    textMuted: "#9ca3af",
  },
  {
    value: "velvet-dusk",
    label: "Velvet Dusk",
    description: "Soft pastel tones on dark canvas",
    accent: "#cba6f7",
    bg: "#1e1e2e",
    surface: "#181825",
    textPrimary: "#cdd6f4",
    textMuted: "#7f849c",
  },
]

/* ─── Mock chat preview data ──────────────────────────── */
const MOCK_CHANNELS = ["general", "design", "random"]
const MOCK_MESSAGES = [
  { user: "Alex", avatar: "A", time: "2:41 PM", text: "Hey, has anyone tried the new theme yet?" },
  { user: "Jordan", avatar: "J", time: "2:42 PM", text: "Yeah it looks amazing! Really clean." },
  { user: "Sam", avatar: "S", time: "2:43 PM", text: "Love the accent color on this one." },
]

/* ─── Theme preview mini-chat ──────────────────────────── */
function ThemePreviewChat({ theme }: { theme: typeof THEME_PRESET_OPTIONS[number] }): React.ReactElement {
  return (
    <div
      className="rounded-xl overflow-hidden border shadow-lg w-full"
      aria-hidden="true"
      style={{
        background: theme.bg,
        borderColor: `color-mix(in srgb, ${theme.textMuted} 20%, transparent)`,
        maxHeight: 320,
      }}
    >
      <div className="flex h-full" style={{ minHeight: 260 }}>
        {/* Sidebar */}
        <div
          className="w-[140px] shrink-0 p-2.5 space-y-1 hidden sm:block"
          style={{ background: theme.surface }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"
            style={{ color: theme.textMuted }}
          >
            Channels
          </div>
          {MOCK_CHANNELS.map((ch) => (
            <div
              key={ch}
              className="text-xs px-2 py-1 rounded"
              style={{
                color: ch === "general" ? theme.textPrimary : theme.textMuted,
                background: ch === "general"
                  ? `color-mix(in srgb, ${theme.textMuted} 15%, transparent)`
                  : "transparent",
                fontWeight: ch === "general" ? 600 : 400,
              }}
            >
              # {ch}
            </div>
          ))}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div
            className="px-3 py-2 text-xs font-semibold border-b flex items-center gap-1.5"
            style={{
              color: theme.textPrimary,
              borderColor: `color-mix(in srgb, ${theme.textMuted} 12%, transparent)`,
              background: theme.bg,
            }}
          >
            <span style={{ color: theme.textMuted }}>#</span> general
          </div>

          {/* Messages */}
          <div className="flex-1 px-3 py-2 space-y-2.5 overflow-hidden">
            {MOCK_MESSAGES.map((msg, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${theme.accent} 30%, ${theme.surface})`,
                    color: theme.accent,
                  }}
                >
                  {msg.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: theme.accent }}>
                      {msg.user}
                    </span>
                    <span className="text-[10px]" style={{ color: theme.textMuted }}>
                      {msg.time}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: theme.textPrimary }}>
                    {msg.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input bar */}
          <div className="px-3 py-2">
            <div
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{
                background: theme.surface,
                color: theme.textMuted,
              }}
            >
              Message #general
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Scroll arrows for the theme strip ──────────────── */
function ScrollArrow({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full transition-all opacity-80 hover:opacity-100 hover:scale-110"
      style={{
        background: "var(--theme-bg-tertiary)",
        color: "var(--theme-text-primary)",
        [direction === "left" ? "left" : "right"]: -12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
      aria-label={`Scroll ${direction}`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d={direction === "left" ? "M9 2L4 7L9 12" : "M5 2L10 7L5 12"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/* ─── Main component ──────────────────────────────────── */
export function AppearanceSettingsPage(): React.ReactElement {
  const { messageDisplay, fontScale, saturation, themePreset, reducedMotion, timestampFormat, setMessageDisplay, setFontScale, setSaturation, setThemePreset, setReducedMotion, setTimestampFormat } = useAppearanceStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const activeTheme = THEME_PRESET_OPTIONS.find((t) => t.value === themePreset) ?? THEME_PRESET_OPTIONS[0]

  const updateScrollState = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)
    return (): void => { resizeObserver.disconnect() }
  }, [updateScrollState])

  const scroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>): void => {
    const el = scrollRef.current
    if (!el) return
    if (e.deltaY === 0) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
    updateScrollState()
  }, [updateScrollState])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
          Appearance
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--theme-text-muted)" }}>
          Customize how VortexChat looks and feels for you.
        </p>
      </div>

      {/* ── Theme Selector ──────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Theme
        </h2>

        {/* Live preview */}
        <ThemePreviewChat theme={activeTheme} />

        {/* Theme name + description */}
        <div className="text-center">
          <p className="text-base font-semibold" style={{ color: "var(--theme-text-bright)" }}>
            {activeTheme.label}
          </p>
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            {activeTheme.description}
          </p>
        </div>

        {/* Scrollable theme strip */}
        <div className="relative">
          {canScrollLeft && <ScrollArrow direction="left" onClick={() => scroll("left")} />}
          {canScrollRight && <ScrollArrow direction="right" onClick={() => scroll("right")} />}

          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            onWheel={handleWheel}
            className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
            style={{
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--theme-bg-tertiary) transparent",
            }}
          >
            {THEME_PRESET_OPTIONS.map((theme) => {
              const isActive = themePreset === theme.value
              return (
                <button
                  key={theme.value}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={theme.label}
                  onClick={() => setThemePreset(theme.value)}
                  className="relative shrink-0 rounded-lg overflow-hidden transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 group"
                  style={{
                    width: 100,
                    height: 72,
                    scrollSnapAlign: "start",
                    border: `2.5px solid ${isActive ? theme.accent : "transparent"}`,
                    boxShadow: isActive ? `0 0 12px ${theme.accent}40` : "0 1px 4px rgba(0,0,0,0.2)",
                    transform: isActive ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  {/* Mini theme thumbnail */}
                  <div className="w-full h-full flex" style={{ background: theme.bg }}>
                    {/* Mini sidebar */}
                    <div className="w-[28%] h-full" style={{ background: theme.surface }}>
                      <div className="mt-2 mx-1 space-y-1">
                        <div className="h-1 w-full rounded-full opacity-40" style={{ background: theme.textMuted }} />
                        <div className="h-1 w-3/4 rounded-full opacity-25" style={{ background: theme.textMuted }} />
                        <div className="h-1 w-full rounded-full opacity-25" style={{ background: theme.textMuted }} />
                      </div>
                    </div>
                    {/* Mini chat area */}
                    <div className="flex-1 p-1.5 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: theme.accent }} />
                          <div className="h-1 flex-1 rounded-full opacity-40" style={{ background: theme.textPrimary }} />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full opacity-60" style={{ background: theme.accent }} />
                          <div className="h-1 w-3/4 rounded-full opacity-30" style={{ background: theme.textPrimary }} />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full opacity-40" style={{ background: theme.accent }} />
                          <div className="h-1 w-1/2 rounded-full opacity-20" style={{ background: theme.textPrimary }} />
                        </div>
                      </div>
                      {/* Mini input */}
                      <div className="h-2 rounded-sm" style={{ background: theme.surface }} />
                    </div>
                  </div>

                  {/* Active checkmark badge */}
                  {isActive && (
                    <div
                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: theme.accent }}
                    >
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}

                  {/* Theme label on hover */}
                  <div
                    className="absolute inset-x-0 bottom-0 text-[9px] font-semibold text-center py-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                    style={{
                      background: `linear-gradient(transparent, ${theme.bg}ee)`,
                      color: theme.textPrimary,
                    }}
                  >
                    {theme.label}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          For advanced customization, use Custom CSS in Profile → Appearance.
        </p>
      </section>

      {/* ── Message Display ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Message Display
        </h2>
        <div className="space-y-2">
          {MESSAGE_DISPLAY_OPTIONS.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all"
              style={{
                background: messageDisplay === value
                  ? "color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-secondary))"
                  : "var(--theme-bg-secondary)",
                border: `1px solid ${messageDisplay === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
              }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{label}</p>
                <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{description}</p>
              </div>
              <input
                type="radio"
                name="messageDisplay"
                value={value}
                checked={messageDisplay === value}
                onChange={() => setMessageDisplay(value)}
                className="accent-[var(--theme-accent)]"
              />
            </label>
          ))}
        </div>
      </section>

      {/* ── Font Scale ──────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Font Size
        </h2>
        <div className="flex items-center gap-2">
          {FONT_SCALE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={fontScale === value}
              onClick={() => setFontScale(value)}
              className="flex-1 py-2 rounded text-sm transition-all"
              style={{
                background: fontScale === value
                  ? "var(--theme-accent)"
                  : "var(--theme-bg-secondary)",
                color: fontScale === value ? "white" : "var(--theme-text-secondary)",
                border: `1px solid ${fontScale === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
                fontWeight: fontScale === value ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Current scale: {fontScale}
        </p>
      </section>

      {/* ── Saturation ──────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Color Saturation
        </h2>
        <div className="flex items-center gap-2">
          {SATURATION_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={saturation === value}
              onClick={() => setSaturation(value)}
              className="flex-1 py-2 rounded text-sm transition-all"
              style={{
                background: saturation === value
                  ? "var(--theme-accent)"
                  : "var(--theme-bg-secondary)",
                color: saturation === value ? "white" : "var(--theme-text-secondary)",
                border: `1px solid ${saturation === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
                fontWeight: saturation === value ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Reduced Motion ────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Reduced Motion
        </h2>
        <div className="space-y-2">
          {REDUCED_MOTION_OPTIONS.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all"
              style={{
                background: reducedMotion === value
                  ? "color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-secondary))"
                  : "var(--theme-bg-secondary)",
                border: `1px solid ${reducedMotion === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
              }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{label}</p>
                <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{description}</p>
              </div>
              <input
                type="radio"
                name="reducedMotion"
                value={value}
                checked={reducedMotion === value}
                onChange={() => setReducedMotion(value)}
                className="accent-[var(--theme-accent)]"
              />
            </label>
          ))}
        </div>
      </section>

      {/* ── Timestamp Format ──────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Timestamp Format
        </h2>
        <div className="flex items-center gap-2">
          {TIMESTAMP_FORMAT_OPTIONS.map(({ value, label, example }) => (
            <button
              key={value}
              type="button"
              aria-pressed={timestampFormat === value}
              onClick={() => setTimestampFormat(value)}
              className="flex-1 py-2.5 rounded text-sm transition-all"
              style={{
                background: timestampFormat === value
                  ? "var(--theme-accent)"
                  : "var(--theme-bg-secondary)",
                color: timestampFormat === value ? "white" : "var(--theme-text-secondary)",
                border: `1px solid ${timestampFormat === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
                fontWeight: timestampFormat === value ? 600 : 400,
              }}
            >
              <span>{label}</span>
              <span className="block text-xs opacity-70 mt-0.5">{example}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
        These preferences are saved to your browser and apply immediately.
      </p>
    </div>
  )
}
