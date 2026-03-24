"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type MessageDisplay = "cozy" | "compact"
export type FontScale = "small" | "normal" | "large"
export type Saturation = "normal" | "reduced"
export type ThemePreset = "twilight" | "midnight-neon" | "synthwave" | "carbon" | "oled-black" | "frost" | "clarity" | "velvet-dusk"
export type ReducedMotion = "system" | "on" | "off"
export type TimestampFormat = "12h" | "24h"
export type FontFamily = "system" | "inter" | "mono" | "dyslexia"
export type LineHeight = "tight" | "normal" | "relaxed"
export type CodeFont = "default" | "fira-code" | "jetbrains-mono" | "cascadia"
export type ColorMode = "system" | "dark" | "light"
export type ChatBubbleStyle = "flat" | "bubble"
export type MessageGrouping = "5min" | "10min" | "never"
export type EmojiSize = "small" | "normal" | "large"
export type NotificationBadgeStyle = "dot" | "count"
export type FocusIndicator = "default" | "high-contrast" | "outline"

export interface AppearanceSettings {
  messageDisplay?: MessageDisplay
  fontScale?: FontScale
  saturation?: Saturation
  themePreset?: ThemePreset
  reducedMotion?: ReducedMotion
  timestampFormat?: TimestampFormat
  customCss?: string
  fontFamily?: FontFamily
  lineHeight?: LineHeight
  codeFont?: CodeFont
  colorMode?: ColorMode
  chatBubbleStyle?: ChatBubbleStyle
  messageGrouping?: MessageGrouping
  emojiSize?: EmojiSize
  accentColorOverride?: string
  highContrast?: boolean
  gifAutoplay?: boolean
  linkPreviews?: boolean
  imagePreviews?: boolean
  notificationBadgeStyle?: NotificationBadgeStyle
  focusIndicator?: FocusIndicator
  syncToAccount?: boolean
}

interface AppearanceState {
  messageDisplay: MessageDisplay
  fontScale: FontScale
  saturation: Saturation
  themePreset: ThemePreset
  reducedMotion: ReducedMotion
  timestampFormat: TimestampFormat
  customCss: string
  fontFamily: FontFamily
  lineHeight: LineHeight
  codeFont: CodeFont
  colorMode: ColorMode
  chatBubbleStyle: ChatBubbleStyle
  messageGrouping: MessageGrouping
  emojiSize: EmojiSize
  accentColorOverride: string
  highContrast: boolean
  gifAutoplay: boolean
  linkPreviews: boolean
  imagePreviews: boolean
  notificationBadgeStyle: NotificationBadgeStyle
  focusIndicator: FocusIndicator
  syncToAccount: boolean
  hasHydratedFromProfile: boolean
  lastHydratedUserId: string | null
  setMessageDisplay: (v: MessageDisplay) => void
  setFontScale: (v: FontScale) => void
  setSaturation: (v: Saturation) => void
  setThemePreset: (v: ThemePreset) => void
  setReducedMotion: (v: ReducedMotion) => void
  setTimestampFormat: (v: TimestampFormat) => void
  setCustomCss: (v: string) => void
  setFontFamily: (v: FontFamily) => void
  setLineHeight: (v: LineHeight) => void
  setCodeFont: (v: CodeFont) => void
  setColorMode: (v: ColorMode) => void
  setChatBubbleStyle: (v: ChatBubbleStyle) => void
  setMessageGrouping: (v: MessageGrouping) => void
  setEmojiSize: (v: EmojiSize) => void
  setAccentColorOverride: (v: string) => void
  setHighContrast: (v: boolean) => void
  setGifAutoplay: (v: boolean) => void
  setLinkPreviews: (v: boolean) => void
  setImagePreviews: (v: boolean) => void
  setNotificationBadgeStyle: (v: NotificationBadgeStyle) => void
  setFocusIndicator: (v: FocusIndicator) => void
  setSyncToAccount: (v: boolean) => void
  resetToDefaults: () => void
  hydrateFromSettings: (settings?: AppearanceSettings | null, userId?: string | null) => void
  toSettingsPayload: () => Required<AppearanceSettings>
}

const DEFAULTS: Required<AppearanceSettings> = {
  messageDisplay: "cozy",
  fontScale: "normal",
  saturation: "normal",
  themePreset: "twilight",
  reducedMotion: "system",
  timestampFormat: "12h",
  customCss: "",
  fontFamily: "system",
  lineHeight: "normal",
  codeFont: "default",
  colorMode: "dark",
  chatBubbleStyle: "flat",
  messageGrouping: "5min",
  emojiSize: "normal",
  accentColorOverride: "",
  highContrast: false,
  gifAutoplay: true,
  linkPreviews: true,
  imagePreviews: true,
  notificationBadgeStyle: "count",
  focusIndicator: "default",
  syncToAccount: false,
}

const THEME_PRESETS: ThemePreset[] = ["twilight", "midnight-neon", "synthwave", "carbon", "oled-black", "frost", "clarity", "velvet-dusk"]
const MESSAGE_DISPLAY_MODES: MessageDisplay[] = ["cozy", "compact"]
const FONT_SCALES: FontScale[] = ["small", "normal", "large"]
const SATURATION_LEVELS: Saturation[] = ["normal", "reduced"]
const REDUCED_MOTION_MODES: ReducedMotion[] = ["system", "on", "off"]
const TIMESTAMP_FORMATS: TimestampFormat[] = ["12h", "24h"]
const FONT_FAMILIES: FontFamily[] = ["system", "inter", "mono", "dyslexia"]
const LINE_HEIGHTS: LineHeight[] = ["tight", "normal", "relaxed"]
const CODE_FONTS: CodeFont[] = ["default", "fira-code", "jetbrains-mono", "cascadia"]
const COLOR_MODES: ColorMode[] = ["system", "dark", "light"]
const CHAT_BUBBLE_STYLES: ChatBubbleStyle[] = ["flat", "bubble"]
const MESSAGE_GROUPINGS: MessageGrouping[] = ["5min", "10min", "never"]
const EMOJI_SIZES: EmojiSize[] = ["small", "normal", "large"]
const NOTIFICATION_BADGE_STYLES: NotificationBadgeStyle[] = ["dot", "count"]
const FOCUS_INDICATORS: FocusIndicator[] = ["default", "high-contrast", "outline"]

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

function sanitizeAccentColor(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (trimmed === "") return ""
  // Only allow valid hex colors
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  return ""
}

function validateEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function validateBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
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
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setTimestampFormat: (v) => set({ timestampFormat: v }),
      setCustomCss: (v) => set({ customCss: sanitizeCustomCss(v) }),
      setFontFamily: (v) => set({ fontFamily: v }),
      setLineHeight: (v) => set({ lineHeight: v }),
      setCodeFont: (v) => set({ codeFont: v }),
      setColorMode: (v) => set({ colorMode: v }),
      setChatBubbleStyle: (v) => set({ chatBubbleStyle: v }),
      setMessageGrouping: (v) => set({ messageGrouping: v }),
      setEmojiSize: (v) => set({ emojiSize: v }),
      setAccentColorOverride: (v) => set({ accentColorOverride: sanitizeAccentColor(v) }),
      setHighContrast: (v) => set({ highContrast: v }),
      setGifAutoplay: (v) => set({ gifAutoplay: v }),
      setLinkPreviews: (v) => set({ linkPreviews: v }),
      setImagePreviews: (v) => set({ imagePreviews: v }),
      setNotificationBadgeStyle: (v) => set({ notificationBadgeStyle: v }),
      setFocusIndicator: (v) => set({ focusIndicator: v }),
      setSyncToAccount: (v) => set({ syncToAccount: v }),
      resetToDefaults: () => set({ ...DEFAULTS }),
      hydrateFromSettings: (settings, userId = null) => {
        const state = get()
        if (state.hasHydratedFromProfile && state.lastHydratedUserId === userId) return

        set({
          themePreset: validateEnum(settings?.themePreset, THEME_PRESETS, DEFAULTS.themePreset),
          messageDisplay: validateEnum(settings?.messageDisplay, MESSAGE_DISPLAY_MODES, DEFAULTS.messageDisplay),
          fontScale: validateEnum(settings?.fontScale, FONT_SCALES, DEFAULTS.fontScale),
          saturation: validateEnum(settings?.saturation, SATURATION_LEVELS, DEFAULTS.saturation),
          reducedMotion: validateEnum(settings?.reducedMotion, REDUCED_MOTION_MODES, DEFAULTS.reducedMotion),
          timestampFormat: validateEnum(settings?.timestampFormat, TIMESTAMP_FORMATS, DEFAULTS.timestampFormat),
          fontFamily: validateEnum(settings?.fontFamily, FONT_FAMILIES, DEFAULTS.fontFamily),
          lineHeight: validateEnum(settings?.lineHeight, LINE_HEIGHTS, DEFAULTS.lineHeight),
          codeFont: validateEnum(settings?.codeFont, CODE_FONTS, DEFAULTS.codeFont),
          colorMode: validateEnum(settings?.colorMode, COLOR_MODES, DEFAULTS.colorMode),
          chatBubbleStyle: validateEnum(settings?.chatBubbleStyle, CHAT_BUBBLE_STYLES, DEFAULTS.chatBubbleStyle),
          messageGrouping: validateEnum(settings?.messageGrouping, MESSAGE_GROUPINGS, DEFAULTS.messageGrouping),
          emojiSize: validateEnum(settings?.emojiSize, EMOJI_SIZES, DEFAULTS.emojiSize),
          notificationBadgeStyle: validateEnum(settings?.notificationBadgeStyle, NOTIFICATION_BADGE_STYLES, DEFAULTS.notificationBadgeStyle),
          focusIndicator: validateEnum(settings?.focusIndicator, FOCUS_INDICATORS, DEFAULTS.focusIndicator),
          accentColorOverride: sanitizeAccentColor(settings?.accentColorOverride),
          highContrast: validateBool(settings?.highContrast, DEFAULTS.highContrast),
          gifAutoplay: validateBool(settings?.gifAutoplay, DEFAULTS.gifAutoplay),
          linkPreviews: validateBool(settings?.linkPreviews, DEFAULTS.linkPreviews),
          imagePreviews: validateBool(settings?.imagePreviews, DEFAULTS.imagePreviews),
          syncToAccount: validateBool(settings?.syncToAccount, DEFAULTS.syncToAccount),
          customCss: sanitizeCustomCss(settings?.customCss),
          hasHydratedFromProfile: true,
          lastHydratedUserId: userId,
        })
      },
      toSettingsPayload: () => {
        const s = get()
        return {
          messageDisplay: s.messageDisplay,
          fontScale: s.fontScale,
          saturation: s.saturation,
          themePreset: s.themePreset,
          reducedMotion: s.reducedMotion,
          timestampFormat: s.timestampFormat,
          customCss: sanitizeCustomCss(s.customCss),
          fontFamily: s.fontFamily,
          lineHeight: s.lineHeight,
          codeFont: s.codeFont,
          colorMode: s.colorMode,
          chatBubbleStyle: s.chatBubbleStyle,
          messageGrouping: s.messageGrouping,
          emojiSize: s.emojiSize,
          accentColorOverride: sanitizeAccentColor(s.accentColorOverride),
          highContrast: s.highContrast,
          gifAutoplay: s.gifAutoplay,
          linkPreviews: s.linkPreviews,
          imagePreviews: s.imagePreviews,
          notificationBadgeStyle: s.notificationBadgeStyle,
          focusIndicator: s.focusIndicator,
          syncToAccount: s.syncToAccount,
        }
      },
    }),
    {
      name: "vortex:appearance",
      partialize: (state) => ({
        messageDisplay: state.messageDisplay,
        fontScale: state.fontScale,
        saturation: state.saturation,
        themePreset: state.themePreset,
        reducedMotion: state.reducedMotion,
        timestampFormat: state.timestampFormat,
        customCss: state.customCss,
        fontFamily: state.fontFamily,
        lineHeight: state.lineHeight,
        codeFont: state.codeFont,
        colorMode: state.colorMode,
        chatBubbleStyle: state.chatBubbleStyle,
        messageGrouping: state.messageGrouping,
        emojiSize: state.emojiSize,
        accentColorOverride: state.accentColorOverride,
        highContrast: state.highContrast,
        gifAutoplay: state.gifAutoplay,
        linkPreviews: state.linkPreviews,
        imagePreviews: state.imagePreviews,
        notificationBadgeStyle: state.notificationBadgeStyle,
        focusIndicator: state.focusIndicator,
        syncToAccount: state.syncToAccount,
        hasHydratedFromProfile: state.hasHydratedFromProfile,
        lastHydratedUserId: state.lastHydratedUserId,
      }),
    }
  )
)
