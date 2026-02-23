import { describe, expect, it } from "vitest"
import { expandEventOccurrences, formatInTimeZone } from "./events"

describe("event recurrence", () => {
  it("expands weekly recurrences inside a range", () => {
    const occurrences = expandEventOccurrences(
      [
        {
          id: "evt_1",
          title: "Weekly standup",
          description: null,
          timezone: "UTC",
          start_at: "2026-01-01T10:00:00.000Z",
          end_at: "2026-01-01T10:30:00.000Z",
          recurrence: "weekly",
          recurrence_until: "2026-01-31T23:59:59.000Z",
          capacity: null,
          cancelled_at: null,
        },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-31T23:59:59.000Z")
    )

    expect(occurrences).toHaveLength(5)
    expect(occurrences[0].startAt.toISOString()).toBe("2026-01-01T10:00:00.000Z")
    expect(occurrences[4].startAt.toISOString()).toBe("2026-01-29T10:00:00.000Z")
  })
})

describe("timezone formatting", () => {
  it("handles DST edge consistently", () => {
    const formatted = formatInTimeZone("2026-03-08T10:30:00.000Z", "America/Los_Angeles")
    expect(formatted).toContain("03:30")
  })
})
