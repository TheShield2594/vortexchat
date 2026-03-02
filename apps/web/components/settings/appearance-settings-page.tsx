"use client"

import { useAppearanceStore } from "@/lib/stores/appearance-store"
import type { MessageDisplay, FontScale, Saturation } from "@/lib/stores/appearance-store"

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

export function AppearanceSettingsPage() {
  const { messageDisplay, fontScale, saturation, setMessageDisplay, setFontScale, setSaturation } = useAppearanceStore()

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
