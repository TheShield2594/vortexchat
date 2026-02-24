"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type MessageDisplay = "cozy" | "compact"
export type FontScale = "small" | "normal" | "large"
export type Saturation = "normal" | "reduced"
export type ThemePreset = "discord" | "midnight-neon" | "synthwave" | "carbon"

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
  setMessageDisplay: (v: MessageDisplay) => void
  setFontScale: (v: FontScale) => void
  setSaturation: (v: Saturation) => void
  setThemePreset: (v: ThemePreset) => void
  setCustomCss: (v: string) => void
  hydrateFromSettings: (settings?: AppearanceSettings | null) => void
  toSettingsPayload: () => Required<AppearanceSettings>
}

const DEFAULTS: Required<AppearanceSettings> = {
  messageDisplay: "cozy",
  fontScale: "normal",
  saturation: "normal",
  themePreset: "discord",
  customCss: "",
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      hasHydratedFromProfile: false,
      setMessageDisplay: (v) => set({ messageDisplay: v }),
      setFontScale: (v) => set({ fontScale: v }),
      setSaturation: (v) => set({ saturation: v }),
      setThemePreset: (v) => set({ themePreset: v }),
      setCustomCss: (v) => set({ customCss: v.slice(0, 12000) }),
      hydrateFromSettings: (settings) => {
        if (get().hasHydratedFromProfile) return
        set({
          messageDisplay: settings?.messageDisplay ?? DEFAULTS.messageDisplay,
          fontScale: settings?.fontScale ?? DEFAULTS.fontScale,
          saturation: settings?.saturation ?? DEFAULTS.saturation,
          themePreset: settings?.themePreset ?? DEFAULTS.themePreset,
          customCss: (settings?.customCss ?? DEFAULTS.customCss).slice(0, 12000),
          hasHydratedFromProfile: true,
        })
      },
      toSettingsPayload: () => {
        const { messageDisplay, fontScale, saturation, themePreset, customCss } = get()
        return { messageDisplay, fontScale, saturation, themePreset, customCss: customCss.slice(0, 12000) }
      },
    }),
    { name: "vortex:appearance" }
  )
)
