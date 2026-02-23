import { describe, expect, it } from "vitest"
import {
  AppInteractionRuntime,
  redactCredentials,
  validateInstallPermissions,
} from "@/lib/apps/runtime"

describe("apps runtime", () => {
  it("registers and executes slash-like commands", async () => {
    const runtime = new AppInteractionRuntime()
    runtime.registerCommand({
      name: "/status",
      appId: "app-1",
      execute: ({ payload }) => ({ ok: true, message: String(payload?.text ?? "ok") }),
    })

    const result = await runtime.executeCommand("/status", {
      appId: "app-1",
      serverId: "server-1",
      actorId: "user-1",
      payload: { text: "green" },
    })

    expect(result.ok).toBe(true)
    expect(result.message).toBe("green")
  })

  it("tracks event subscriptions", () => {
    const runtime = new AppInteractionRuntime()
    runtime.subscribeToEvent({
      appInstallId: "install-1",
      appId: "app-1",
      eventKey: "message.created",
      enabled: true,
    })

    expect(runtime.getSubscribers("message.created")).toHaveLength(1)
  })

  it("enforces per-app rate limits", async () => {
    const runtime = new AppInteractionRuntime()
    runtime.registerCommand({
      name: "/ping",
      appId: "app-1",
      execute: () => ({ ok: true, message: "pong" }),
    })

    const rule = { requestsPerMinute: 1 }
    const first = await runtime.executeCommand("/ping", { appId: "app-1", serverId: "s1", actorId: "u1" }, rule)
    const second = await runtime.executeCommand("/ping", { appId: "app-1", serverId: "s1", actorId: "u1" }, rule)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(second.message).toContain("Rate limit")
  })

  it("validates install permissions and redacts credentials for webhook compatibility", () => {
    expect(validateInstallPermissions(["SEND_MESSAGES"], ["SEND_MESSAGES", "MANAGE_MESSAGES"]))
      .toBe(true)
    expect(validateInstallPermissions(["ADMINISTRATOR"], ["SEND_MESSAGES"]))
      .toBe(false)

    expect(redactCredentials({ webhook_token: "secret", api_key: "abc" })).toEqual({
      webhook_token: "••••••",
      api_key: "••••••",
    })
  })
})
