export type TaskStatus = "todo" | "in_progress" | "blocked" | "done"

export interface TaskDraft {
  title: string
  description: string | null
  dueAt: string | null
}

/**
 * Heuristic parser for converting a message into a task.
 * Supports patterns:
 * - [ ] title
 * - TODO: title
 * - title #due:2026-02-01
 */
export function parseMessageToTask(content: string): TaskDraft {
  const trimmed = content.trim()
  const withoutCheckbox = trimmed.replace(/^\[\s?\]\s*/i, "")
  const withoutTodoPrefix = withoutCheckbox.replace(/^todo\s*:\s*/i, "")

  const dueMatch = withoutTodoPrefix.match(/(?:#due:|due:)\s*(\d{4}-\d{2}-\d{2})/i)
  const dueAt = dueMatch ? `${dueMatch[1]}T23:59:59.000Z` : null

  const title = withoutTodoPrefix
    .replace(/(?:#due:|due:)\s*\d{4}-\d{2}-\d{2}/ig, "")
    .trim()
    .slice(0, 200)

  return {
    title: title || "Untitled task",
    description: trimmed.length > title.length ? trimmed : null,
    dueAt,
  }
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "todo": return "To do"
    case "in_progress": return "In progress"
    case "blocked": return "Blocked"
    case "done": return "Done"
  }
}
