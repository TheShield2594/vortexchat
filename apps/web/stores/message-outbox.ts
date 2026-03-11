"use client"

import { create } from "zustand"

export type OutboxStatus = "pending" | "sending" | "failed"

export interface OutboxMessage {
  /** Client-generated ID for tracking */
  clientId: string
  channelId: string
  content: string
  /** ISO timestamp of when the message was queued */
  queuedAt: string
  status: OutboxStatus
  /** Number of retry attempts */
  retries: number
  /** Error message if failed */
  error?: string
}

interface OutboxState {
  messages: OutboxMessage[]
  /** Add a message to the outbox (returns the client ID) */
  enqueue: (channelId: string, content: string) => string
  /** Mark a message as sending */
  markSending: (clientId: string) => void
  /** Mark a message as failed */
  markFailed: (clientId: string, error: string) => void
  /** Remove a successfully sent message */
  markSent: (clientId: string) => void
  /** Cancel / discard a queued or failed message */
  cancel: (clientId: string) => void
  /** Get pending + failed messages for a channel */
  forChannel: (channelId: string) => OutboxMessage[]
}

let counter = 0
function clientId(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  return `outbox-${Date.now()}-${counter}`
}

export const useMessageOutbox = create<OutboxState>((set, get) => ({
  messages: [],

  enqueue(channelId, content) {
    const id = clientId()
    set((s) => ({
      messages: [
        ...s.messages,
        { clientId: id, channelId, content, queuedAt: new Date().toISOString(), status: "pending" as const, retries: 0 },
      ],
    }))
    return id
  },

  markSending(cid) {
    set((s) => ({
      messages: s.messages.map((m) => (m.clientId === cid ? { ...m, status: "sending" as const } : m)),
    }))
  },

  markFailed(cid, error) {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.clientId === cid ? { ...m, status: "failed" as const, error, retries: m.retries + 1 } : m,
      ),
    }))
  },

  markSent(cid) {
    set((s) => ({ messages: s.messages.filter((m) => m.clientId !== cid) }))
  },

  cancel(cid) {
    set((s) => ({ messages: s.messages.filter((m) => m.clientId !== cid) }))
  },

  forChannel(channelId) {
    return get().messages.filter((m) => m.channelId === channelId)
  },
}))

// --- Auto-flush on reconnect ---

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    // Dispatch a custom event that the chat view can listen for to retry pending messages
    window.dispatchEvent(new CustomEvent("vortex:flush-outbox"))
  })
}
