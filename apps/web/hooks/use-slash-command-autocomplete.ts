import { useState, useMemo, useEffect } from "react"

export interface SlashCommand {
  id: string
  appId: string
  appName: string
  commandName: string
  description: string | null
}

interface Options {
  content: string
  cursorPosition: number
  commands: SlashCommand[]
}

interface Result {
  isOpen: boolean
  query: string | null
  matches: SlashCommand[]
  selectedIndex: number
  selectCommand: (command: SlashCommand) => { newContent: string; newCursorPosition: number }
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  close: () => void
}

/**
 * Detects a `/command` prefix at the start of the message and filters installed
 * app commands. Mirrors the shape of useMentionAutocomplete for easy composition.
 */
function findSlashQuery(text: string, cursor: number): string | null {
  // Only active when `/` is the very first character and cursor is in the first "word"
  if (!text.startsWith("/")) return null
  // No space before the cursor means we're still typing the command name
  const segment = text.slice(1, cursor)
  if (segment.includes(" ")) return null
  return segment
}

export function useSlashCommandAutocomplete({ content, cursorPosition, commands }: Options): Result {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = useMemo(
    () => findSlashQuery(content, cursorPosition),
    [content, cursorPosition]
  )

  const matches = useMemo(() => {
    if (query === null) return []
    const lower = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.commandName.toLowerCase().startsWith(lower) ||
        (cmd.description?.toLowerCase().includes(lower) ?? false)
    ).slice(0, 10)
  }, [query, commands])

  const isOpen = query !== null && matches.length > 0 && !dismissed

  useEffect(() => {
    setSelectedIndex(0)
  }, [matches.length, query])

  useEffect(() => {
    setDismissed(false)
  }, [query])

  function selectCommand(command: SlashCommand) {
    // Replace the /query prefix with the full command invocation token
    const replacement = `/${command.commandName} `
    return {
      newContent: replacement + content.slice(cursorPosition),
      newCursorPosition: replacement.length,
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

  return { isOpen, query, matches, selectedIndex, selectCommand, handleKeyDown, close }
}
