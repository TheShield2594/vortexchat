"use client"

import { useEffect } from "react"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import { useShallow } from "zustand/react/shallow"

/**
 * Applies appearance settings from the Zustand store to the <html> element
 * as data-attributes and CSS custom properties so theme CSS selectors work.
 *
 * Must be called in any layout tree where theme changes should take effect
 * (e.g. /channels, /settings).
 */
export function useApplyAppearance(): void {
  const {
    messageDisplay, fontScale, saturation, themePreset, reducedMotion, customCss,
    fontFamily, lineHeight, codeFont, colorMode, chatBubbleStyle, messageGrouping,
    emojiSize, accentColorOverride, highContrast, gifAutoplay, linkPreviews,
    imagePreviews, notificationBadgeStyle, focusIndicator,
  } = useAppearanceStore(
    useShallow((s) => ({
      messageDisplay: s.messageDisplay, fontScale: s.fontScale, saturation: s.saturation,
      themePreset: s.themePreset, reducedMotion: s.reducedMotion, customCss: s.customCss,
      fontFamily: s.fontFamily, lineHeight: s.lineHeight, codeFont: s.codeFont,
      colorMode: s.colorMode, chatBubbleStyle: s.chatBubbleStyle, messageGrouping: s.messageGrouping,
      emojiSize: s.emojiSize, accentColorOverride: s.accentColorOverride, highContrast: s.highContrast,
      gifAutoplay: s.gifAutoplay, linkPreviews: s.linkPreviews, imagePreviews: s.imagePreviews,
      notificationBadgeStyle: s.notificationBadgeStyle, focusIndicator: s.focusIndicator,
    }))
  )

  // Auto-detect OS prefers-contrast: more after store hydration.
  // Waits for zustand persist to finish so we read the real persisted value
  // rather than the pre-hydration default, avoiding overriding an explicit "off".
  const setHighContrast = useAppearanceStore((s) => s.setHighContrast)
  useEffect(() => {
    const unsub = useAppearanceStore.persist.onFinishHydration(() => {
      const { highContrast: persisted } = useAppearanceStore.getState()
      const mq = window.matchMedia("(prefers-contrast: more)")
      if (mq.matches && !persisted) {
        setHighContrast(true)
      }
    })
    return unsub
  }, [setHighContrast])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.messageDisplay = messageDisplay
    root.dataset.fontScale = fontScale
    root.dataset.saturation = saturation
    root.dataset.themePreset = themePreset
    root.dataset.reducedMotion = reducedMotion
    root.dataset.fontFamily = fontFamily
    root.dataset.lineHeight = lineHeight
    root.dataset.codeFont = codeFont
    root.dataset.colorMode = colorMode
    root.dataset.chatBubbleStyle = chatBubbleStyle
    root.dataset.messageGrouping = messageGrouping
    root.dataset.emojiSize = emojiSize
    root.dataset.highContrast = String(highContrast)
    root.dataset.gifAutoplay = String(gifAutoplay)
    root.dataset.linkPreviews = String(linkPreviews)
    root.dataset.imagePreviews = String(imagePreviews)
    root.dataset.notificationBadgeStyle = notificationBadgeStyle
    root.dataset.focusIndicator = focusIndicator

    // Apply accent color override as a CSS variable
    if (accentColorOverride) {
      root.style.setProperty("--theme-accent-override", accentColorOverride)
      root.style.setProperty("--theme-accent", accentColorOverride)
    } else {
      root.style.removeProperty("--theme-accent-override")
      root.style.removeProperty("--theme-accent")
    }

    // ── Theme-specific external stylesheet ─────────────────────────────
    // Some themes ship an extended CSS file in /themes/{preset}.css that
    // adds signature effects (scanlines, glitch animations, custom fonts,
    // etc.) beyond what the globals.css color tokens provide.
    // Only themes whose CSS is fully scoped to [data-theme-preset="..."]
    // are safe to auto-load. Others (terminal, frosthearth, sakura-blossom)
    // still use unscoped selectors and remain manual-paste only for now.
    const THEMES_WITH_EXTERNAL_CSS: ReadonlySet<string> = new Set([
      "night-city-neural",
    ])
    const themeLinkId = "vortex-theme-external-css"
    const existingLink = document.getElementById(themeLinkId) as HTMLLinkElement | null
    if (THEMES_WITH_EXTERNAL_CSS.has(themePreset)) {
      const href = `/themes/${themePreset}.css`
      if (existingLink) {
        if (existingLink.getAttribute("href") !== href) {
          existingLink.href = href
        }
      } else {
        const link = document.createElement("link")
        link.id = themeLinkId
        link.rel = "stylesheet"
        link.href = href
        document.head.appendChild(link)
      }
    } else if (existingLink) {
      existingLink.remove()
    }

    // ── User custom CSS ──────────────────────────────────────────────────
    const customCssStyleId = "vortex-custom-theme-css"
    let styleTag = document.getElementById(customCssStyleId) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement("style")
      styleTag.id = customCssStyleId
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = customCss.trim()

    // Cleanup: remove injected elements on unmount so no orphaned styles remain
    return (): void => {
      const themeLink = document.getElementById(themeLinkId)
      if (themeLink) {
        themeLink.remove()
      }
    }
  }, [
    messageDisplay, fontScale, saturation, themePreset, reducedMotion, customCss,
    fontFamily, lineHeight, codeFont, colorMode, chatBubbleStyle, messageGrouping,
    emojiSize, accentColorOverride, highContrast, gifAutoplay, linkPreviews,
    imagePreviews, notificationBadgeStyle, focusIndicator,
  ])
}
