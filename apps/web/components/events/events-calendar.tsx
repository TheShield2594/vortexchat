"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { expandEventOccurrences, formatInTimeZone } from "@/lib/events"

type ViewMode = "month" | "week" | "list"

function toLocalDatetime(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const h = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}T${h}:${min}`
}

export function EventsCalendar({ serverId, channels, canManageEvents = false }: { serverId: string; channels: Array<{ id: string; name: string }>; canManageEvents?: boolean }) {
  const [events, setEvents] = useState<any[]>([])
  const [view, setView] = useState<ViewMode>("month")
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startAt, setStartAt] = useState(() => toLocalDatetime(new Date(Date.now() + 24 * 60 * 60 * 1000)))
  const [endAt, setEndAt] = useState(() => toLocalDatetime(new Date(Date.now() + 25 * 60 * 60 * 1000)))
  const [capacity, setCapacity] = useState("")
  const [linkedChannelId, setLinkedChannelId] = useState(channels[0]?.id ?? "")
  const [creating, setCreating] = useState(false)

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

  function resetForm() {
    setTitle("")
    setDescription("")
    setStartAt(toLocalDatetime(new Date(Date.now() + 24 * 60 * 60 * 1000)))
    setEndAt(toLocalDatetime(new Date(Date.now() + 25 * 60 * 60 * 1000)))
    setCapacity("")
    setLinkedChannelId(channels[0]?.id ?? "")
    setShowForm(false)
  }

  async function createEvent() {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/servers/${serverId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          timezone,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          recurrence: "none",
          capacity: capacity ? parseInt(capacity, 10) : undefined,
          linkedChannelId: linkedChannelId || undefined,
          notifyMembers: true,
        }),
      })
      if (res.ok) {
        resetForm()
        await load()
      }
    } finally {
      setCreating(false)
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
        {canManageEvents && !showForm && (
          <Button onClick={() => setShowForm(true)} className="ml-auto">Create event</Button>
        )}
      </div>

      {canManageEvents && showForm && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">New Event</h3>
            <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-title">Title</Label>
            <Input id="event-title" placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-desc">Description</Label>
            <Input id="event-desc" placeholder="What's this event about?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="event-start">Start</Label>
              <Input id="event-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-end">End</Label>
              <Input id="event-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="event-capacity">Capacity (optional)</Label>
              <Input id="event-capacity" type="number" min="1" placeholder="Unlimited" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-channel">Linked channel</Label>
              <select
                id="event-channel"
                value={linkedChannelId}
                onChange={(e) => setLinkedChannelId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-100"
              >
                <option value="">None</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={createEvent} disabled={creating || !title.trim()}>
            {creating ? "Creating..." : "Create event"}
          </Button>
        </div>
      )}

      <div className="grid gap-3">
        {occurrences.map((occ) => {
          const full = events.find((e) => e.id === occ.eventId)
          return (
            <div key={`${occ.eventId}-${occ.startAt.toISOString()}`} className="rounded border border-zinc-700 bg-zinc-900 p-3">
              <div className="font-semibold">{occ.title}</div>
              {full?.description && <div className="text-sm text-zinc-400 mt-0.5">{full.description}</div>}
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
