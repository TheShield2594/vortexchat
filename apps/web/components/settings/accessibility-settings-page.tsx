"use client"

import React from "react"
import Link from "next/link"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import type { ReducedMotion, Saturation, FocusIndicator } from "@/lib/stores/appearance-store"

/* ─── Option definitions ──────────────────────────────── */

const REDUCED_MOTION_OPTIONS: { value: ReducedMotion; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow your OS preference" },
  { value: "on", label: "On", description: "Disable all animations and transitions" },
  { value: "off", label: "Off", description: "Always show animations" },
]

const SATURATION_OPTIONS: { value: Saturation; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "reduced", label: "Reduced" },
]

const FOCUS_INDICATOR_OPTIONS: { value: FocusIndicator; label: string; description: string }[] = [
  { value: "default", label: "Default", description: "Standard browser focus ring" },
  { value: "high-contrast", label: "High Contrast", description: "Thick accent ring with glow" },
  { value: "outline", label: "Dashed Outline", description: "Dashed border for maximum visibility" },
]

/* ─── Reusable helpers ────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
      {children}
    </h2>
  )
}

function SectionDivider(): React.ReactElement {
  return <hr className="border-0 h-px" style={{ background: "var(--theme-bg-tertiary)" }} />
}

function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: { value: T; label: string; description: string }[]
  value: T
  onChange: (v: T) => void
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all"
          style={{
            background: value === opt.value
              ? "color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-secondary))"
              : "var(--theme-bg-secondary)",
            border: `1px solid ${value === opt.value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
          }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{opt.label}</p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{opt.description}</p>
          </div>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-[var(--theme-accent)]"
          />
        </label>
      ))}
    </div>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="flex-1 py-2 rounded text-sm transition-all"
          style={{
            background: value === opt.value ? "var(--theme-accent)" : "var(--theme-bg-secondary)",
            color: value === opt.value ? "white" : "var(--theme-text-secondary)",
            border: `1px solid ${value === opt.value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
            fontWeight: value === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <label
      className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all"
      style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? "var(--theme-accent)" : "var(--theme-bg-tertiary)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </label>
  )
}

/* ─── Main component ──────────────────────────────────── */
export function AccessibilitySettingsPage(): React.ReactElement {
  const store = useAppearanceStore()

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
          Accessibility
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--theme-text-muted)" }}>
          Settings to make VortexChat more comfortable and usable for you.
        </p>
      </div>

      {/* ── Reduced Motion ────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Reduced Motion</SectionHeading>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Control whether animations and transitions play. Reducing motion can help if animations cause discomfort.
        </p>
        <RadioGroup name="reducedMotion" options={REDUCED_MOTION_OPTIONS} value={store.reducedMotion} onChange={store.setReducedMotion} />
      </section>

      <SectionDivider />

      {/* ── Color Saturation ──────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Color Saturation</SectionHeading>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Reduce color intensity across the interface. Helpful for light sensitivity or visual fatigue.
        </p>
        <SegmentedControl options={SATURATION_OPTIONS} value={store.saturation} onChange={store.setSaturation} />
      </section>

      <SectionDivider />

      {/* ── High Contrast ─────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>High Contrast</SectionHeading>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Increase contrast between text and backgrounds for improved readability.
        </p>
        <ToggleSwitch
          label="High contrast mode"
          description="Boosts text contrast and darkens backgrounds for maximum legibility"
          checked={store.highContrast}
          onChange={store.setHighContrast}
        />
      </section>

      <SectionDivider />

      {/* ── Focus Indicators ──────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Focus Indicators</SectionHeading>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Choose how focused elements are highlighted when navigating with a keyboard.
        </p>
        <RadioGroup name="focusIndicator" options={FOCUS_INDICATOR_OPTIONS} value={store.focusIndicator} onChange={store.setFocusIndicator} />

        {/* Live preview */}
        <div className="mt-3">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--theme-text-secondary)" }}>Preview</p>
          <div className="flex gap-3 items-center">
            <button
              type="button"
              className="px-4 py-2 rounded text-sm focus-visible:outline-none"
              style={{ background: "var(--theme-bg-secondary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
            >
              Tab to me
            </button>
            <input
              type="text"
              placeholder="Or focus here"
              className="px-3 py-2 rounded text-sm"
              style={{ background: "var(--theme-bg-secondary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── Dyslexia-Friendly ─────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Reading Assistance</SectionHeading>
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>Dyslexia-friendly font</p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
              Switch to OpenDyslexic with increased letter spacing.{" "}
              {store.fontFamily === "dyslexia" ? (
                <span style={{ color: "var(--theme-success)" }}>Currently active.</span>
              ) : (
                <>
                  Go to{" "}
                  <Link href="/settings/appearance" className="underline" style={{ color: "var(--theme-link)" }}>
                    Appearance → Typography
                  </Link>{" "}
                  to enable.
                </>
              )}
            </p>
          </div>
          {store.fontFamily !== "dyslexia" ? (
            <button
              type="button"
              onClick={() => store.setFontFamily("dyslexia")}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0"
              style={{ background: "var(--theme-accent)", color: "white" }}
            >
              Enable
            </button>
          ) : (
            <button
              type="button"
              onClick={() => store.setFontFamily("system")}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0"
              style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
            >
              Disable
            </button>
          )}
        </div>

        <ToggleSwitch
          label="Autoplay GIFs"
          description="Disable to reduce visual distraction — GIFs will show on hover instead"
          checked={store.gifAutoplay}
          onChange={store.setGifAutoplay}
        />
      </section>

      <p className="text-xs pb-4" style={{ color: "var(--theme-text-muted)" }}>
        Accessibility settings apply immediately and are saved to your browser.
      </p>
    </div>
  )
}
