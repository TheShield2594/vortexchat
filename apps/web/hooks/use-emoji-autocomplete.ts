import { useState, useMemo, useEffect } from "react"
import { EMOJI_ENTRIES } from "@/lib/emoji-data"

export interface EmojiMatch {
  shortcode: string
  emoji: string
  /** true for server custom emojis (rendered as images, inserted as :name:) */
  isCustom?: boolean
  imageUrl?: string
}

interface Options {
  content: string
  cursorPosition: number
  /** Optional server custom emojis to include in results */
  serverEmojis?: Array<{ name: string; image_url: string }>
}

interface Result {
  isOpen: boolean
  query: string | null
  matches: EmojiMatch[]
  selectedIndex: number
  selectEmoji: (match: EmojiMatch) => { newContent: string; newCursorPosition: number }
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  close: () => void
}

/** Minimum characters after `:` before showing suggestions */
const MIN_QUERY_LENGTH = 2

function findEmojiQuery(text: string, cursor: number): string | null {
  let i = cursor - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === ":") {
      // `:` must be at start of string or preceded by whitespace
      if (i === 0 || /\s/.test(text[i - 1])) {
        const query = text.slice(i + 1, cursor)
        // Don't trigger if query contains spaces (user typed past the shortcode)
        if (/\s/.test(query)) return null
        return query
      }
      return null
    }
    // Hit whitespace before finding `:` — no active emoji query
    if (/\s/.test(ch)) return null
    i--
  }
  return null
}

export function useEmojiAutocomplete({ content, cursorPosition, serverEmojis = [] }: Options): Result {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = useMemo(
    () => findEmojiQuery(content, cursorPosition),
    [content, cursorPosition]
  )

  const matches = useMemo(() => {
    if (query === null || query.length < MIN_QUERY_LENGTH) return []
    const lower = query.toLowerCase()
    const results: EmojiMatch[] = []

    // Search server custom emojis first
    for (const emoji of serverEmojis) {
      if (emoji.name.toLowerCase().includes(lower)) {
        results.push({ shortcode: emoji.name, emoji: "", isCustom: true, imageUrl: emoji.image_url })
      }
      if (results.length >= 10) return results
    }

    // Then search standard Unicode emojis
    for (const [shortcode, char] of EMOJI_ENTRIES) {
      if (shortcode.includes(lower)) {
        // Prioritize starts-with matches
        results.push({ shortcode, emoji: char })
      }
      if (results.length >= 20) break
    }

    // Sort: starts-with first, then substring matches
    results.sort((a, b) => {
      const aStarts = a.shortcode.startsWith(lower) ? 0 : 1
      const bStarts = b.shortcode.startsWith(lower) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return a.shortcode.localeCompare(b.shortcode)
    })

    return results.slice(0, 10)
  }, [query, serverEmojis])

  const isOpen = query !== null && matches.length > 0 && !dismissed

  useEffect(() => {
    setSelectedIndex(0)
  }, [matches.length, query])

  useEffect(() => {
    setDismissed(false)
  }, [query])

  function selectEmoji(match: EmojiMatch) {
    const colonIndex = content.lastIndexOf(":", cursorPosition - 1)
    const before = content.slice(0, colonIndex)
    const after = content.slice(cursorPosition)

    if (match.isCustom) {
      // Server emoji — insert as :name: so the renderer picks it up
      const replacement = `:${match.shortcode}: `
      return {
        newContent: before + replacement + after,
        newCursorPosition: before.length + replacement.length,
      }
    }

    // Unicode emoji — insert the character directly
    const replacement = match.emoji + " "
    return {
      newContent: before + replacement + after,
      newCursorPosition: before.length + replacement.length,
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): boolean {
    if (!isOpen) return false

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) => (prev <= 0 ? matches.length - 1 : prev - 1))
        return true
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) => (prev >= matches.length - 1 ? 0 : prev + 1))
        return true
      case "Escape":
        e.preventDefault()
        setDismissed(true)
        return true
      default:
        return false
    }
  }

  function close() {
    setDismissed(true)
  }

  return { isOpen, query, matches, selectedIndex, selectEmoji, handleKeyDown, close }
}
