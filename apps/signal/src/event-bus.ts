/**
 * Redis Streams–backed Event Bus implementation.
 *
 * Implements the IEventBus interface from @vortex/shared using Redis Streams
 * for durable event storage and replay, plus Redis pub/sub for real-time
 * fan-out across signal server replicas.
 *
 * Key schema:
 *   vortex:stream:{channelId}  — Redis Stream (capped at EVENT_STREAM_MAXLEN)
 *   vortex:pubsub:events       — Redis pub/sub channel for real-time fan-out
 *
 * #592: Unified Socket.IO Real-Time Gateway
 * #597: Reconnection Catch-Up Protocol
 */

import { randomUUID } from "crypto"
import Redis from "ioredis"
import pino from "pino"
import type {
  IEventBus,
  VortexEvent,
  VortexEventType,
  EventSubscription,
  SubscribeOptions,
} from "@vortex/shared"
import {
  EVENT_STREAM_PREFIX,
  EVENT_STREAM_MAXLEN,
  PERSISTED_EVENT_TYPES,
} from "@vortex/shared"

const log = pino({ name: "event-bus" })

const PUBSUB_CHANNEL = "vortex:pubsub:events"

type EventCallback = (event: VortexEvent) => void

interface Subscription {
  id: string
  options: SubscribeOptions
  callback: EventCallback
}

export class RedisEventBus implements IEventBus {
  private readonly redis: Redis
  private readonly pubClient: Redis
  private readonly subClient: Redis
  private subscriptions = new Map<string, Subscription>()
  private destroyed = false

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
    this.pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
    this.subClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 })

    this.subClient.subscribe(PUBSUB_CHANNEL, (err: Error | null) => {
      if (err) {
        log.error({ err }, "failed to subscribe to event bus pub/sub channel")
      } else {
        log.info("event bus subscribed to pub/sub channel")
      }
    })

    this.subClient.on("message", (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as VortexEvent
        this.dispatchToSubscribers(event)
      } catch (err) {
        log.error({ err }, "failed to parse event bus pub/sub message")
      }
    })
  }

  private streamKey(channelId: string): string {
    return `${EVENT_STREAM_PREFIX}:${channelId}`
  }

  private dispatchToSubscribers(event: VortexEvent): void {
    for (const sub of this.subscriptions.values()) {
      if (this.matchesFilter(event, sub.options)) {
        try {
          sub.callback(event)
        } catch (err) {
          log.error({ err, subscriptionId: sub.id }, "subscriber callback threw")
        }
      }
    }
  }

  private matchesFilter(event: VortexEvent, options: SubscribeOptions): boolean {
    if (options.channelId && event.channelId !== options.channelId) return false
    if (options.types && options.types.length > 0 && !options.types.includes(event.type)) return false
    return true
  }

  async publish(partial: Omit<VortexEvent, "id" | "timestamp">): Promise<string> {
    if (this.destroyed) throw new Error("EventBus is destroyed")

    const event: VortexEvent = {
      ...partial,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    }

    try {
      // Persist to Redis Stream if this is a persistable event type
      if (PERSISTED_EVENT_TYPES.has(partial.type)) {
        const key = this.streamKey(event.channelId)
        await this.redis.xadd(
          key,
          "MAXLEN",
          "~",
          String(EVENT_STREAM_MAXLEN),
          "*",
          "event",
          JSON.stringify(event),
        )
      }

      // Fan out to all replicas via pub/sub (always, for real-time delivery)
      await this.pubClient.publish(PUBSUB_CHANNEL, JSON.stringify(event))
    } catch (err) {
      log.error({ err, eventType: event.type, channelId: event.channelId }, "event publish failed")
      throw err
    }

    return event.id
  }

  subscribe(
    options: SubscribeOptions,
    callback: (event: VortexEvent) => void,
  ): EventSubscription {
    const id = randomUUID()
    this.subscriptions.set(id, { id, options, callback })

    return {
      unsubscribe: () => {
        this.subscriptions.delete(id)
      },
    }
  }

  async replay(options: {
    channelId: string
    afterEventId: string
    limit?: number
  }): Promise<VortexEvent[]> {
    if (this.destroyed) return []

    const key = this.streamKey(options.channelId)
    const limit = options.limit ?? 500

    try {
      // Find the stream entry ID corresponding to afterEventId.
      // We search for the event by scanning the stream. Since events are
      // stored chronologically and we cap at EVENT_STREAM_MAXLEN, this is bounded.
      const allEntries = await this.redis.xrange(key, "-", "+")
      if (!allEntries || allEntries.length === 0) return []

      let foundAfterIndex = -1
      for (let i = 0; i < allEntries.length; i++) {
        const [, fields] = allEntries[i]
        if (!fields || fields.length < 2) continue
        try {
          const event = JSON.parse(fields[1]) as VortexEvent
          if (event.id === options.afterEventId) {
            foundAfterIndex = i
            break
          }
        } catch {
          continue
        }
      }

      // If we couldn't find the afterEventId, the gap is too large — return
      // everything (the caller can decide what to do with this).
      const startIndex = foundAfterIndex >= 0 ? foundAfterIndex + 1 : 0
      const events: VortexEvent[] = []

      for (let i = startIndex; i < allEntries.length && events.length < limit; i++) {
        const [, fields] = allEntries[i]
        if (!fields || fields.length < 2) continue
        try {
          events.push(JSON.parse(fields[1]) as VortexEvent)
        } catch {
          continue
        }
      }

      return events
    } catch (err) {
      log.error({ err, channelId: options.channelId }, "event replay failed")
      return []
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    this.subscriptions.clear()

    try {
      this.subClient.disconnect()
      this.pubClient.disconnect()
      this.redis.disconnect()
    } catch {
      // Best-effort cleanup
    }
  }
}
