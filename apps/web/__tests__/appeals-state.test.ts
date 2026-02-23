import { describe, expect, it } from "vitest"
import { isValidAppealTransition, isValidAppealStatus } from "../lib/appeals"

describe("appeal state transitions", () => {
  it("allows submitted -> reviewing", () => {
    expect(isValidAppealTransition("submitted", "reviewing")).toBe(true)
  })

  it("blocks submitted -> approved", () => {
    expect(isValidAppealTransition("submitted", "approved")).toBe(false)
  })

  it("allows reviewing -> denied/approved/closed", () => {
    expect(isValidAppealTransition("reviewing", "denied")).toBe(true)
    expect(isValidAppealTransition("reviewing", "approved")).toBe(true)
    expect(isValidAppealTransition("reviewing", "closed")).toBe(true)
  })

  it("blocks closed -> any", () => {
    expect(isValidAppealTransition("closed", "reviewing")).toBe(false)
  })

  it("validates status enum", () => {
    expect(isValidAppealStatus("submitted")).toBe(true)
    expect(isValidAppealStatus("invalid")).toBe(false)
  })
})
