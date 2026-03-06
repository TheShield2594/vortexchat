"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type MessageDisplay = "cozy" | "compact"
export type FontScale = "small" | "normal" | "large"
export type Saturation = "normal" | "reduced"
export type ThemePreset = "discord" | "midnight-neon" | "synthwave" | "carbon" | "oled-black"

export interface AppearanceSettings {
  messageDisplay?: MessageDisplay
  fontScale?: FontScale
  saturation?: Saturation
  themePreset?: ThemePreset
  customCss?: string
}

interface AppearanceState {
  messageDisplay: MessageDisplay
  fontScale: FontScale
  saturation: Saturation
  themePreset: ThemePreset
  customCss: string
  hasHydratedFromProfile: boolean
  lastHydratedUserId: string | null
  setMessageDisplay: (v: MessageDisplay) => void
  setFontScale: (v: FontScale) => void
  setSaturation: (v: Saturation) => void
  setThemePreset: (v: ThemePreset) => void
  setCustomCss: (v: string) => void
  hydrateFromSettings: (settings?: AppearanceSettings | null, userId?: string | null) => void
  toSettingsPayload: () => Required<AppearanceSettings>
}

const DEFAULTS: Required<AppearanceSettings> = {
  messageDisplay: "cozy",
  fontScale: "normal",
  saturation: "normal",
  themePreset: "discord",
  customCss: "",
}

const THEME_PRESETS: ThemePreset[] = ["discord", "midnight-neon", "synthwave", "carbon", "oled-black"]
const MESSAGE_DISPLAY_MODES: MessageDisplay[] = ["cozy", "compact"]
const FONT_SCALES: FontScale[] = ["small", "normal", "large"]
const SATURATION_LEVELS: Saturation[] = ["normal", "reduced"]

function sanitizeCustomCss(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    // Block expression() – IE/legacy XSS vector
    .replace(/expression\s*\(/gi, "/* blocked:expression */(")
    // Block -moz-binding – old Firefox XSS vector
    .replace(/-moz-binding\s*:/gi, "/* blocked */:")
    // Block behavior: – IE XSS vector
    .replace(/behavior\s*:/gi, "/* blocked */:")
    // Block javascript: URLs inside url()
    .replace(/url\s*\(\s*(['"]?)javascript:/gi, "url($1data:text/plain,blocked")
    // Block data: URLs for non-image/font types (e.g. data:text/html XSS)
    .replace(/url\s*\(\s*(['"]?)data:(?!image\/|font\/|application\/font|application\/x-font)/gi, "url($1data:text/plain,blocked")
    .slice(0, 50000)
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      hasHydratedFromProfile: false,
      lastHydratedUserId: null,
      setMessageDisplay: (v) => set({ messageDisplay: v }),
      setFontScale: (v) => set({ fontScale: v }),
      setSaturation: (v) => set({ saturation: v }),
      setThemePreset: (v) => set({ themePreset: v }),
      setCustomCss: (v) => set({ customCss: sanitizeCustomCss(v) }),
      hydrateFromSettings: (settings, userId = null) => {
        const state = get()
        if (state.hasHydratedFromProfile && state.lastHydratedUserId === userId) return

        const themePreset = THEME_PRESETS.includes(settings?.themePreset as ThemePreset)
          ? (settings?.themePreset as ThemePreset)
          : DEFAULTS.themePreset
        const messageDisplay = MESSAGE_DISPLAY_MODES.includes(settings?.messageDisplay as MessageDisplay)
          ? (settings?.messageDisplay as MessageDisplay)
          : DEFAULTS.messageDisplay
        const fontScale = FONT_SCALES.includes(settings?.fontScale as FontScale)
          ? (settings?.fontScale as FontScale)
          : DEFAULTS.fontScale
        const saturation = SATURATION_LEVELS.includes(settings?.saturation as Saturation)
          ? (settings?.saturation as Saturation)
          : DEFAULTS.saturation

        set({
          themePreset,
          messageDisplay,
          fontScale,
          saturation,
          customCss: sanitizeCustomCss(settings?.customCss),
          hasHydratedFromProfile: true,
          lastHydratedUserId: userId,
        })
      },
      toSettingsPayload: () => {
        const { messageDisplay, fontScale, saturation, themePreset, customCss } = get()
        return { messageDisplay, fontScale, saturation, themePreset, customCss: sanitizeCustomCss(customCss) }
      },
    }),
    {
      name: "vortex:appearance",
      partialize: (state) => ({
        messageDisplay: state.messageDisplay,
        fontScale: state.fontScale,
        saturation: state.saturation,
        themePreset: state.themePreset,
        customCss: state.customCss,
        hasHydratedFromProfile: state.hasHydratedFromProfile,
        lastHydratedUserId: state.lastHydratedUserId,
      }),
    }
  )
)
