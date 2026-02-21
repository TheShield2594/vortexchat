import { useState, useMemo, useEffect } from "react"
import type { MemberForMention } from "@/lib/stores/app-store"

interface Options {
  content: string
  cursorPosition: number
  members: MemberForMention[]
}

interface Result {
  isOpen: boolean
  query: string | null
  filteredMembers: MemberForMention[]
  selectedIndex: number
  selectMember: (member: MemberForMention) => { newContent: string; newCursorPosition: number }
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  close: () => void
}

function findMentionQuery(text: string, cursor: number): string | null {
  let i = cursor - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === "@") {
      // @ must be at start of string or preceded by whitespace
      if (i === 0 || /\s/.test(text[i - 1])) {
        return text.slice(i + 1, cursor)
      }
      return null
    }
    // Hit whitespace before finding @ — no active mention
    if (/\s/.test(ch)) return null
    i--
  }
  return null
}

export function useMentionAutocomplete({ content, cursorPosition, members }: Options): Result {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = useMemo(
    () => findMentionQuery(content, cursorPosition),
    [content, cursorPosition]
  )

  const filteredMembers = useMemo(() => {
    if (query === null) return []
    const lower = query.toLowerCase()
    return members
      .filter(
        (m) =>
          m.username.toLowerCase().includes(lower) ||
          (m.display_name?.toLowerCase().includes(lower) ?? false) ||
          (m.nickname?.toLowerCase().includes(lower) ?? false)
      )
      .slice(0, 10)
  }, [query, members])

  const isOpen = query !== null && filteredMembers.length > 0 && !dismissed

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredMembers.length, query])

  // Un-dismiss when query changes (user keeps typing after Escape)
  useEffect(() => {
    setDismissed(false)
  }, [query])

  function selectMember(member: MemberForMention) {
    const atIndex = content.lastIndexOf("@", cursorPosition - 1)
    const before = content.slice(0, atIndex)
    const after = content.slice(cursorPosition)
    const mention = `<@${member.username}> `
    return {
      newContent: before + mention + after,
      newCursorPosition: before.length + mention.length,
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): boolean {
    if (!isOpen) return false

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredMembers.length - 1 : prev - 1
        )
        return true
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev >= filteredMembers.length - 1 ? 0 : prev + 1
        )
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

  return {
    isOpen,
    query,
    filteredMembers,
    selectedIndex,
    selectMember,
    handleKeyDown,
    close,
  }
}
