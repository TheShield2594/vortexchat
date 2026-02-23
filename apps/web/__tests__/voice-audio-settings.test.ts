import { describe, it, expect } from "vitest"
import {
  applyPresetToSettings,
  createDefaultAudioSettings,
  estimateAudioCpuConstraint,
  withEqBandGain,
} from "@/lib/voice/audio-settings"

describe("voice audio settings", () => {
  it("applies preset EQ values", () => {
    const defaults = createDefaultAudioSettings()
    const updated = applyPresetToSettings("broadcast", defaults)
    expect(updated.preset).toBe("broadcast")
    expect(updated.eqBands.some((b) => b.gain !== 0)).toBe(true)
  })

  it("switches to flat when custom EQ is edited", () => {
    const defaults = createDefaultAudioSettings()
    const updated = withEqBandGain(defaults, 1, 6)
    expect(updated.preset).toBe("flat")
    expect(updated.eqBands[1].gain).toBe(6)
  })

  it("flags constrained cpu on low core count", () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, "navigator", {
      value: { hardwareConcurrency: 2 },
      configurable: true,
    })

    const constrained = estimateAudioCpuConstraint({
      sampleRate: 48000,
      baseLatency: 0.01,
    } as AudioContext)

    expect(constrained).toBe(true)

    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
  })
})
