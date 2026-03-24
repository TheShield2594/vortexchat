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

    const customCssStyleId = "vortex-custom-theme-css"
    let styleTag = document.getElementById(customCssStyleId) as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement("style")
      styleTag.id = customCssStyleId
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = customCss.trim()
  }, [
    messageDisplay, fontScale, saturation, themePreset, reducedMotion, customCss,
    fontFamily, lineHeight, codeFont, colorMode, chatBubbleStyle, messageGrouping,
    emojiSize, accentColorOverride, highContrast, gifAutoplay, linkPreviews,
    imagePreviews, notificationBadgeStyle, focusIndicator,
  ])
}
