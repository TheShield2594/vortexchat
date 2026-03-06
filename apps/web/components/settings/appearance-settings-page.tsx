"use client"

import { useAppearanceStore } from "@/lib/stores/appearance-store"
import type { MessageDisplay, FontScale, Saturation, ThemePreset } from "@/lib/stores/appearance-store"

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

const THEME_PRESET_OPTIONS: {
  value: ThemePreset
  label: string
  description: string
  accent: string
  bg: string
  surface: string
}[] = [
  {
    value: "discord",
    label: "Discord",
    description: "Classic dark theme with blue accent",
    accent: "#5865F2",
    bg: "#313338",
    surface: "#2b2d31",
  },
  {
    value: "midnight-neon",
    label: "Midnight Neon",
    description: "Deep dark with vibrant neon purple",
    accent: "#a78bfa",
    bg: "#0f0f14",
    surface: "#1a1a24",
  },
  {
    value: "synthwave",
    label: "Synthwave",
    description: "Retro 80s vibes with pink & cyan",
    accent: "#f472b6",
    bg: "#1a0a2e",
    surface: "#21143d",
  },
  {
    value: "carbon",
    label: "Carbon",
    description: "Minimal dark gray with teal accent",
    accent: "#2dd4bf",
    bg: "#171717",
    surface: "#1f1f1f",
  },
  {
    value: "oled-black",
    label: "OLED Black",
    description: "True black for OLED displays with Tiffany blue",
    accent: "#0abab5",
    bg: "#000000",
    surface: "#080808",
  },
]

export function AppearanceSettingsPage() {
  const { messageDisplay, fontScale, saturation, themePreset, setMessageDisplay, setFontScale, setSaturation, setThemePreset } = useAppearanceStore()

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

      {/* Theme Presets */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Theme
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {THEME_PRESET_OPTIONS.map(({ value, label, description, accent, bg, surface }) => (
            <button
              key={value}
              type="button"
              aria-pressed={themePreset === value}
              onClick={() => setThemePreset(value)}
              className="relative text-left p-3 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2"
              style={{
                background: themePreset === value
                  ? "color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-secondary))"
                  : "var(--theme-bg-secondary)",
                border: `2px solid ${themePreset === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
              }}
            >
              {/* Color preview */}
              <div
                className="w-full h-10 rounded-md mb-2 overflow-hidden flex"
                style={{ background: bg }}
              >
                <div className="w-1/3 h-full" style={{ background: surface }} />
                <div className="flex-1 h-full flex items-center px-2 gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: accent }} />
                  <div className="h-1.5 flex-1 rounded-full opacity-40" style={{ background: accent }} />
                </div>
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>{label}</p>
              <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{description}</p>
              {themePreset === value && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--theme-accent)" }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          For advanced customization, use Custom CSS in Profile → Appearance.
        </p>
      </section>

      {/* Message Display */}
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

      {/* Font Scale */}
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

      {/* Saturation */}
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

      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
        These preferences are saved to your browser and apply immediately.
      </p>
    </div>
  )
}
