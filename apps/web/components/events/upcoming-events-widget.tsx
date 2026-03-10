"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, ChevronRight } from "lucide-react"
import { EventCard } from "./event-card"
import type { EventOccurrence } from "@/lib/events"
import { expandOccurrences } from "@/lib/events"

interface UpcomingEventsWidgetProps {
  serverId: string
  timezone?: string
}

export function UpcomingEventsWidget({ serverId, timezone = "UTC" }: UpcomingEventsWidgetProps) {
  const [events, setEvents] = useState<any[]>([])
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    fetch(
      `/api/servers/${serverId}/events?from=${now.toISOString()}&to=${thirtyDaysLater.toISOString()}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return
        setEvents(data)
        const occs = expandOccurrences(data, now, thirtyDaysLater).slice(0, 3)
        setOccurrences(occs)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [serverId])

  async function handleRsvp(eventId: string, status: "going" | "maybe" | "not_going") {
    await fetch(`/api/servers/${serverId}/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    // Refresh
    const now = new Date()
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const res = await fetch(
      `/api/servers/${serverId}/events?from=${now.toISOString()}&to=${thirtyDaysLater.toISOString()}`
    )
    const data = await res.json()
    if (Array.isArray(data)) {
      setEvents(data)
      setOccurrences(expandOccurrences(data, now, thirtyDaysLater).slice(0, 3))
    }
  }

  if (loading) return null
  if (occurrences.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Calendar className="h-4 w-4 text-blue-400" />
          Upcoming Events
        </div>
        <Link
          href={`/channels/${serverId}/events`}
          className="flex items-center gap-0.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View all
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-2">
        {occurrences.map((occ) => {
          const event = events.find((e) => e.id === occ.eventId)
          if (!event) return null
          return (
            <EventCard
              key={`${occ.eventId}-${occ.startAt.toISOString()}`}
              event={event}
              occurrence={occ}
              timezone={timezone}
              serverId={serverId}
              onRsvp={handleRsvp}
              compact
            />
          )
        })}
      </div>
    </div>
  )
}
