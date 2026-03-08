"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { expandEventOccurrences, formatInTimeZone } from "@/lib/events"
import type { EventOccurrence } from "@/lib/events"

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
  const [popover, setPopover] = useState<{ eventId: string; rect: DOMRect } | null>(null)
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

  const [anchor, setAnchor] = useState(() => new Date())

  const range = useMemo(() => {
    if (view === "month") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59)
      return { start, end }
    }
    if (view === "week") {
      const start = new Date(anchor)
      start.setDate(start.getDate() - start.getDay())
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59)
      return { start, end }
    }
    // list: 90 days from today
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + 90)
    return { start, end }
  }, [view, anchor])

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

        {view !== "list" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => {
              setAnchor((a) => {
                const d = new Date(a)
                if (view === "month") d.setMonth(d.getMonth() - 1)
                else d.setDate(d.getDate() - 7)
                return d
              })
            }} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {view === "month"
                ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                : `Week of ${range.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => {
              setAnchor((a) => {
                const d = new Date(a)
                if (view === "month") d.setMonth(d.getMonth() + 1)
                else d.setDate(d.getDate() + 7)
                return d
              })
            }} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <a className="text-sm underline text-zinc-400" href={`/api/servers/${serverId}/events/ical`}>Export iCal</a>
          {canManageEvents && !showForm && (
            <Button onClick={() => setShowForm(true)}>Create event</Button>
          )}
        </div>
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

      {view === "month" && <MonthView occurrences={occurrences} events={events} anchor={anchor} timezone={timezone} rsvp={rsvp} onClickEvent={(eventId, rect) => setPopover(popover?.eventId === eventId ? null : { eventId, rect })} />}
      {view === "week" && <WeekView occurrences={occurrences} events={events} range={range} timezone={timezone} rsvp={rsvp} onClickEvent={(eventId, rect) => setPopover(popover?.eventId === eventId ? null : { eventId, rect })} />}
      {view === "list" && <ListView occurrences={occurrences} events={events} timezone={timezone} rsvp={rsvp} />}

      {popover && (
        <EventPopover
          eventId={popover.eventId}
          anchorRect={popover.rect}
          occurrences={occurrences}
          events={events}
          timezone={timezone}
          rsvp={rsvp}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

// ── Shared types for sub-views ───────────────────────────────────────────────

type RsvpFn = (eventId: string, status: "going" | "maybe" | "not_going") => Promise<void>

type ViewProps = {
  occurrences: EventOccurrence[]
  events: any[]
  timezone: string
  rsvp: RsvpFn
  onClickEvent: (eventId: string, rect: DOMRect) => void
}

function formatTime12h(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
}

// ── Popover (portaled, positioned near the clicked pill) ─────────────────────

const POPOVER_W = 340
const POPOVER_GAP = 8

function EventPopover({ eventId, anchorRect, occurrences, events, timezone, rsvp, onClose }: {
  eventId: string
  anchorRect: DOMRect
  occurrences: EventOccurrence[]
  events: any[]
  timezone: string
  rsvp: RsvpFn
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const occ = occurrences.find((o) => o.eventId === eventId)
  const full = events.find((e) => e.id === eventId)

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Escape to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  if (!occ || !full) return null

  // Position: prefer right of the anchor, fall back left, then center below
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = anchorRect.right + POPOVER_GAP
  let top = anchorRect.top

  // If overflows right, try left side
  if (left + POPOVER_W > vw - POPOVER_GAP) {
    left = anchorRect.left - POPOVER_W - POPOVER_GAP
  }
  // If still overflows left, center horizontally below the anchor
  if (left < POPOVER_GAP) {
    left = Math.max(POPOVER_GAP, anchorRect.left + anchorRect.width / 2 - POPOVER_W / 2)
    top = anchorRect.bottom + POPOVER_GAP
  }
  // Clamp vertically
  top = Math.max(POPOVER_GAP, Math.min(top, vh - 300))

  const myStatus: string | null = full?.myRsvp?.status ?? null

  return createPortal(
    <div
      ref={ref}
      data-event-popover
      style={{ position: "fixed", top, left, width: POPOVER_W, zIndex: 50 }}
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">{occ.title}</h3>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-200 shrink-0 mt-0.5" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {full.description && <p className="text-sm text-zinc-400 mt-1">{full.description}</p>}

      <div className="text-sm text-zinc-300 mt-2">
        {formatInTimeZone(occ.startAt.toISOString(), timezone)} → {formatInTimeZone(occ.endAt.toISOString(), timezone)}
      </div>

      <div className="mt-1.5 text-xs text-zinc-400">
        Capacity: {full.capacity ?? "unlimited"} &middot; Going: {full.stats?.going ?? 0} &middot; Waitlist: {full.stats?.waitlist ?? 0}
      </div>

      {myStatus === "waitlist" && (
        <div className="mt-1.5 text-xs text-yellow-400">You are on the waitlist</div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant={myStatus === "going" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "going")}>
          {myStatus === "going" ? "\u2713 Going" : "Going"}
        </Button>
        <Button size="sm" variant={myStatus === "maybe" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "maybe")}>
          {myStatus === "maybe" ? "\u2713 Maybe" : "Maybe"}
        </Button>
        <Button size="sm" variant={myStatus === "not_going" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "not_going")}>
          {myStatus === "not_going" ? "\u2713 Not going" : "Not going"}
        </Button>
      </div>
    </div>,
    document.body
  )
}

// ── Month view ───────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function MonthView({ occurrences, anchor, onClickEvent }: ViewProps & { anchor: Date }) {
  const today = new Date()
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<{ day: number | null }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d })

  function eventsForDay(day: number) {
    return occurrences.filter((occ) => {
      const d = occ.startAt
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700">
        {DAY_NAMES.map((name) => (
          <div key={name} className="bg-zinc-900 px-2 py-1.5 text-xs font-medium text-zinc-400 text-center">{name}</div>
        ))}
        {cells.map((cell, i) => {
          const dayEvents = cell.day ? eventsForDay(cell.day) : []
          return (
            <div
              key={i}
              className={`bg-zinc-950 min-h-[100px] p-1.5 ${cell.day ? "" : "opacity-30"}`}
            >
              {cell.day && (
                <>
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday(cell.day) ? "bg-blue-600 text-white" : "text-zinc-400"}`}>
                    {cell.day}
                  </div>
                  {dayEvents.map((occ) => (
                    <button
                      key={`${occ.eventId}-${occ.startAt.toISOString()}`}
                      type="button"
                      onClick={(e) => onClickEvent(occ.eventId, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                      className="text-xs w-full text-left rounded px-1.5 py-0.5 mb-0.5 truncate border cursor-pointer transition-colors bg-blue-900/40 text-blue-200 border-blue-800/50 hover:bg-blue-800/50"
                    >
                      {occ.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week view ────────────────────────────────────────────────────────────────

function WeekView({ occurrences, events, range, onClickEvent }: ViewProps & { range: { start: Date; end: Date } }) {
  const today = new Date()
  const days: Date[] = []
  const d = new Date(range.start)
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }

  function eventsForDay(day: Date) {
    return occurrences.filter((occ) =>
      occ.startAt.getFullYear() === day.getFullYear() &&
      occ.startAt.getMonth() === day.getMonth() &&
      occ.startAt.getDate() === day.getDate()
    )
  }

  const isToday = (day: Date) =>
    day.getDate() === today.getDate() && day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear()

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700">
        {days.map((day) => (
          <div key={day.toISOString()} className="bg-zinc-900 px-2 py-1.5 text-center">
            <div className="text-xs text-zinc-400">{DAY_NAMES[day.getDay()]}</div>
            <div className={`text-sm font-medium mt-0.5 w-7 h-7 flex items-center justify-center rounded-full mx-auto ${isToday(day) ? "bg-blue-600 text-white" : "text-zinc-200"}`}>
              {day.getDate()}
            </div>
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = eventsForDay(day)
          return (
            <div key={`body-${day.toISOString()}`} className="bg-zinc-950 min-h-[200px] p-1.5">
              {dayEvents.map((occ) => {
                const full = events.find((e) => e.id === occ.eventId)
                return (
                  <button
                    key={`${occ.eventId}-${occ.startAt.toISOString()}`}
                    type="button"
                    onClick={(e) => onClickEvent(occ.eventId, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                    className="text-xs w-full text-left rounded p-1.5 mb-1 border cursor-pointer transition-colors bg-blue-900/40 text-blue-200 border-blue-800/50 hover:bg-blue-800/50"
                  >
                    <div className="font-medium truncate">{occ.title}</div>
                    <div className="text-blue-300/70 mt-0.5">
                      {formatTime12h(occ.startAt)}
                    </div>
                    {full && (
                      <div className="text-blue-300/50 mt-0.5">
                        {full.stats?.going ?? 0} going
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── List view ────────────────────────────────────────────────────────────────

function ListView({ occurrences, events, timezone, rsvp }: Omit<ViewProps, "onClickEvent">) {
  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>()
    for (const occ of occurrences) {
      const key = occ.startAt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(occ)
    }
    return Array.from(map.entries())
  }, [occurrences])

  if (occurrences.length === 0) {
    return <div className="text-center text-zinc-500 py-8">No upcoming events</div>
  }

  return (
    <div className="flex-1 overflow-auto space-y-4">
      {grouped.map(([dateLabel, dayOccurrences]) => (
        <div key={dateLabel}>
          <div className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">{dateLabel}</div>
          <div className="grid gap-3">
            {dayOccurrences.map((occ) => {
              const full = events.find((e) => e.id === occ.eventId)
              const myStatus: string | null = full?.myRsvp?.status ?? null
              return (
                <div key={`${occ.eventId}-${occ.startAt.toISOString()}`} className="rounded border border-zinc-700 bg-zinc-900 p-3">
                  <div className="font-semibold">{occ.title}</div>
                  {full?.description && <p className="text-sm text-zinc-400 mt-0.5">{full.description}</p>}
                  <div className="text-sm text-zinc-300 mt-1">
                    {formatInTimeZone(occ.startAt.toISOString(), timezone)} → {formatInTimeZone(occ.endAt.toISOString(), timezone)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Capacity: {full?.capacity ?? "unlimited"} &middot; Going: {full?.stats?.going ?? 0} &middot; Waitlist: {full?.stats?.waitlist ?? 0}
                  </div>
                  {myStatus === "waitlist" && (
                    <div className="mt-1 text-xs text-yellow-400">You are on the waitlist</div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant={myStatus === "going" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "going")}>
                      {myStatus === "going" ? "\u2713 Going" : "Going"}
                    </Button>
                    <Button size="sm" variant={myStatus === "maybe" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "maybe")}>
                      {myStatus === "maybe" ? "\u2713 Maybe" : "Maybe"}
                    </Button>
                    <Button size="sm" variant={myStatus === "not_going" ? "default" : "secondary"} onClick={() => rsvp(occ.eventId, "not_going")}>
                      {myStatus === "not_going" ? "\u2713 Not going" : "Not going"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
