import { writeFileSync, mkdirSync } from "node:fs"
import { RoomManager } from "./rooms"

function run() {
  const results: Array<{ name: string; pass: boolean; error?: string }> = []

  try {
    const rooms = new RoomManager()
    rooms.join("voice-1", {
      socketId: "socket-a", userId: "user-a", displayName: "A", muted: false, deafened: false, speaking: false, screenSharing: false, joinedAt: new Date(),
    })
    const existing = rooms.join("voice-1", {
      socketId: "socket-b", userId: "user-b", displayName: "B", muted: false, deafened: false, speaking: false, screenSharing: false, joinedAt: new Date(),
    })
    if (existing.length !== 1 || rooms.getRoomSize("voice-1") !== 2) throw new Error("join lifecycle assertion failed")
    results.push({ name: "join lifecycle", pass: true })
  } catch (error) {
    results.push({ name: "join lifecycle", pass: false, error: (error as Error).message })
  }

  try {
    const rooms = new RoomManager()
    rooms.join("voice-1", {
      socketId: "socket-old", userId: "user-a", displayName: "A", muted: false, deafened: false, speaking: true, screenSharing: false, joinedAt: new Date(),
    })
    rooms.leave("voice-1", "socket-old")
    rooms.join("voice-1", {
      socketId: "socket-new", userId: "user-a", displayName: "A", muted: false, deafened: false, speaking: false, screenSharing: false, joinedAt: new Date(),
    })
    if (rooms.getPeer("voice-1", "socket-old") !== undefined) throw new Error("stale socket still exists")
    if (rooms.getPeer("voice-1", "socket-new")?.userId !== "user-a") throw new Error("reconnected socket missing")
    results.push({ name: "reconnect lifecycle", pass: true })
  } catch (error) {
    results.push({ name: "reconnect lifecycle", pass: false, error: (error as Error).message })
  }

  mkdirSync(".reports", { recursive: true })
  writeFileSync(".reports/voice-parity.json", JSON.stringify({ success: results.every((r) => r.pass), results }, null, 2))
  if (results.some((r) => !r.pass)) process.exit(1)
}

run()
