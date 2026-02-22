"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type MessageDisplay = "cozy" | "compact"
export type FontScale = "small" | "normal" | "large"
export type Saturation = "normal" | "reduced"

interface AppearanceState {
  messageDisplay: MessageDisplay
  fontScale: FontScale
  saturation: Saturation
  setMessageDisplay: (v: MessageDisplay) => void
  setFontScale: (v: FontScale) => void
  setSaturation: (v: Saturation) => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      messageDisplay: "cozy",
      fontScale: "normal",
      saturation: "normal",
      setMessageDisplay: (v) => set({ messageDisplay: v }),
      setFontScale: (v) => set({ fontScale: v }),
      setSaturation: (v) => set({ saturation: v }),
    }),
    { name: "vortex:appearance" }
  )
)
