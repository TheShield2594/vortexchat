"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { expandEventOccurrences, formatInTimeZone } from "@/lib/events"

type ViewMode = "month" | "week" | "list"

export function EventsCalendar({ serverId, channels }: { serverId: string; channels: Array<{ id: string; name: string }> }) {
  const [events, setEvents] = useState<any[]>([])
  const [view, setView] = useState<ViewMode>("month")
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [title, setTitle] = useState("")

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/events`, { cache: "no-store" })
    if (res.ok) setEvents(await res.json())
  }

  useEffect(() => { void load() }, [serverId])

  const range = useMemo(() => {
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + (view === "month" ? 31 : view === "week" ? 7 : 90))
    return { start, end }
  }, [view])

  const occurrences = useMemo(
    () => expandEventOccurrences(events, range.start, range.end),
    [events, range]
  )

  async function createEvent() {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const res = await fetch(`/api/servers/${serverId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "New event",
        timezone,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        recurrence: "none",
        linkedChannelId: channels[0]?.id,
        notifyMembers: true,
      }),
    })
    if (res.ok) {
      setTitle("")
      await load()
    }
  }

  async function rsvp(eventId: string, status: "going" | "maybe" | "not_going") {
    await fetch(`/api/servers/${serverId}/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-zinc-100">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={view === "month" ? "default" : "secondary"} onClick={() => setView("month")}>Month</Button>
        <Button variant={view === "week" ? "default" : "secondary"} onClick={() => setView("week")}>Week</Button>
        <Button variant={view === "list" ? "default" : "secondary"} onClick={() => setView("list")}>List</Button>
        <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-64" />
        <a className="text-sm underline" href={`/api/servers/${serverId}/events/ical`}>Export iCal</a>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-sm" />
        <Button onClick={createEvent}>Create event</Button>
      </div>

      <div className="grid gap-3">
        {occurrences.map((occ) => {
          const full = events.find((e) => e.id === occ.eventId)
          return (
            <div key={`${occ.eventId}-${occ.startAt.toISOString()}`} className="rounded border border-zinc-700 bg-zinc-900 p-3">
              <div className="font-semibold">{occ.title}</div>
              <div className="text-sm text-zinc-300">{formatInTimeZone(occ.startAt.toISOString(), timezone)} → {formatInTimeZone(occ.endAt.toISOString(), timezone)}</div>
              <div className="mt-1 text-xs text-zinc-400">Capacity: {full?.capacity ?? "unlimited"} | Going: {full?.stats?.going ?? 0} | Waitlist: {full?.stats?.waitlist ?? 0}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => rsvp(occ.eventId, "going")}>Going</Button>
                <Button size="sm" variant="secondary" onClick={() => rsvp(occ.eventId, "maybe")}>Maybe</Button>
                <Button size="sm" variant="secondary" onClick={() => rsvp(occ.eventId, "not_going")}>Not going</Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
