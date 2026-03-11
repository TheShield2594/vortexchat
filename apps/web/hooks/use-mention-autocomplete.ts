import { useCallback } from "react"
import type { MemberForMention } from "@/lib/stores/app-store"
import { useAutocomplete } from "./use-autocomplete"

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
  const filter = useCallback(
    (query: string) => {
      const lower = query.toLowerCase()
      return members
        .filter(
          (m) =>
            m.username.toLowerCase().includes(lower) ||
            (m.display_name?.toLowerCase().includes(lower) ?? false) ||
            (m.nickname?.toLowerCase().includes(lower) ?? false)
        )
        .slice(0, 10)
    },
    [members]
  )

  const { isOpen, query, matches, selectedIndex, handleKeyDown, close } = useAutocomplete({
    findQuery: findMentionQuery,
    filter,
    content,
    cursorPosition,
  })

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

  return {
    isOpen,
    query,
    filteredMembers: matches,
    selectedIndex,
    selectMember,
    handleKeyDown,
    close,
  }
}
