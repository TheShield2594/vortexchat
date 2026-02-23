import { describe, expect, it } from "vitest"
import { parseMessageToTask, taskStatusLabel } from "@/lib/workspace"

describe("parseMessageToTask", () => {
  it("parses markdown checkbox style", () => {
    const parsed = parseMessageToTask("[ ] Finish release notes")
    expect(parsed.title).toBe("Finish release notes")
    expect(parsed.dueAt).toBeNull()
  })

  it("extracts due date tokens", () => {
    const parsed = parseMessageToTask("TODO: ship v1 #due:2026-05-12")
    expect(parsed.title).toBe("ship v1")
    expect(parsed.dueAt).toContain("2026-05-12")
  })

  it("falls back to untitled task", () => {
    const parsed = parseMessageToTask("  ")
    expect(parsed.title).toBe("Untitled task")
  })
})

describe("taskStatusLabel", () => {
  it("maps statuses", () => {
    expect(taskStatusLabel("todo")).toBe("To do")
    expect(taskStatusLabel("in_progress")).toBe("In progress")
    expect(taskStatusLabel("blocked")).toBe("Blocked")
    expect(taskStatusLabel("done")).toBe("Done")
  })
})
