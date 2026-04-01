"use client"

/**
 * Unified Socket.IO Gateway Hook
 *
 * Provides a single Socket.IO connection to the signal server for all
 * real-time events: messages, reactions, typing, presence, and reconnection
 * catch-up. Replaces multiple Supabase Realtime subscriptions with a single
 * WebSocket transport.
 *
 * Usage:
 *   const { subscribe, unsubscribe, sendTyping, sendPresence, resume, status, lastEventIds } = useGateway()
 *
 * #592: Unified Socket.IO Real-Time Gateway
 * #595: WebSocket-Based Presence & Typing
 * #597: Reconnection Catch-Up Protocol
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type {
  VortexEvent,
  UserStatus,
  GatewayServerEvents,
} from "@vortex/shared"

export type GatewayStatus = "connecting" | "connected" | "disconnected" | "reconnecting"

export interface GatewayEventHandlers {
  onEvent?: (event: VortexEvent) => void
  onTyping?: (data: GatewayServerEvents["gateway:typing"]) => void
  onPresence?: (data: GatewayServerEvents["gateway:presence"]) => void
  onReplay?: (data: GatewayServerEvents["gateway:replay"]) => void
  onResumeComplete?: (data: GatewayServerEvents["gateway:resume-complete"]) => void
}

interface GatewayState {
  socket: Socket | null
  status: GatewayStatus
  subscribedChannels: Set<string>
  lastEventIds: Map<string, string>
}

const SIGNAL_SERVER_URL = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:3001"

export function useGateway(handlers?: GatewayEventHandlers) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const [status, setStatus] = useState<GatewayStatus>("disconnected")
  const socketRef = useRef<Socket | null>(null)
  const stateRef = useRef<GatewayState>({
    socket: null,
    status: "disconnected",
    subscribedChannels: new Set(),
    lastEventIds: new Map(),
  })
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let destroyed = false

    async function connect(): Promise<void> {
      try {
        // Get auth token from Supabase session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token || destroyed) return

        const socket = io(SIGNAL_SERVER_URL, {
          auth: { token: session.access_token },
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000,
          timeout: 20000,
        })

        socketRef.current = socket
        stateRef.current.socket = socket

        socket.on("connect", () => {
          if (destroyed) return
          setStatus("connected")
          stateRef.current.status = "connected"

          // Initialize gateway (sets up presence)
          socket.emit("gateway:init", { status: "online" as UserStatus })

          // Re-subscribe to previously subscribed channels
          const channels = Array.from(stateRef.current.subscribedChannels)
          if (channels.length > 0) {
            socket.emit("gateway:subscribe", { channelIds: channels })
          }

          // If we have lastEventIds, attempt to resume
          if (stateRef.current.lastEventIds.size > 0) {
            const channelMap: Record<string, string> = {}
            for (const [chId, evId] of stateRef.current.lastEventIds) {
              channelMap[chId] = evId
            }
            socket.emit("gateway:resume", { channels: channelMap })
          }

          // Notify connection-status FSM
          window.dispatchEvent(new CustomEvent("vortex:realtime-connect"))
        })

        socket.on("disconnect", () => {
          if (destroyed) return
          setStatus("disconnected")
          stateRef.current.status = "disconnected"
          window.dispatchEvent(new CustomEvent("vortex:realtime-disconnect"))
        })

        socket.io.on("reconnect_attempt", () => {
          if (destroyed) return
          setStatus("reconnecting")
          stateRef.current.status = "reconnecting"
        })

        // ── Event handlers ────────────────────────────────────────────────
        socket.on("gateway:event", (event: VortexEvent) => {
          // Track last event ID per channel for reconnection catch-up
          stateRef.current.lastEventIds.set(event.channelId, event.id)
          handlersRef.current?.onEvent?.(event)
        })

        socket.on("gateway:typing", (data: GatewayServerEvents["gateway:typing"]) => {
          handlersRef.current?.onTyping?.(data)
        })

        socket.on("gateway:presence", (data: GatewayServerEvents["gateway:presence"]) => {
          handlersRef.current?.onPresence?.(data)
        })

        socket.on("gateway:replay", (data: GatewayServerEvents["gateway:replay"]) => {
          handlersRef.current?.onReplay?.(data)
        })

        socket.on("gateway:resume-complete", (data: GatewayServerEvents["gateway:resume-complete"]) => {
          handlersRef.current?.onResumeComplete?.(data)
        })

        socket.on("error", (err: { message: string }) => {
          console.error("[gateway] server error:", err.message)
        })
      } catch (err) {
        console.error("[gateway] connection error:", err)
      }
    }

    connect()

    return () => {
      destroyed = true
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        stateRef.current.socket = null
      }
    }
  }, [supabase])

  // ── Public API ──────────────────────────────────────────────────────────

  const subscribe = useCallback((channelIds: string[]) => {
    const socket = socketRef.current
    if (!socket?.connected) {
      // Queue for when we reconnect
      for (const id of channelIds) {
        stateRef.current.subscribedChannels.add(id)
      }
      return
    }

    const newChannels = channelIds.filter((id) => !stateRef.current.subscribedChannels.has(id))
    if (newChannels.length === 0) return

    for (const id of newChannels) {
      stateRef.current.subscribedChannels.add(id)
    }
    socket.emit("gateway:subscribe", { channelIds: newChannels })
  }, [])

  const unsubscribe = useCallback((channelIds: string[]) => {
    for (const id of channelIds) {
      stateRef.current.subscribedChannels.delete(id)
      stateRef.current.lastEventIds.delete(id)
    }
    socketRef.current?.emit("gateway:unsubscribe", { channelIds })
  }, [])

  const sendTyping = useCallback((channelId: string, isTyping: boolean) => {
    socketRef.current?.emit("gateway:typing", { channelId, isTyping })
  }, [])

  const sendPresence = useCallback((newStatus: UserStatus) => {
    socketRef.current?.emit("gateway:presence", { status: newStatus })
  }, [])

  const getLastEventId = useCallback((channelId: string): string | undefined => {
    return stateRef.current.lastEventIds.get(channelId)
  }, [])

  return {
    status,
    subscribe,
    unsubscribe,
    sendTyping,
    sendPresence,
    getLastEventId,
  }
}
