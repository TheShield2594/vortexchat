"use client"

import { useEffect, useState } from "react"
import { Calendar, Clock, ExternalLink, Mic, Repeat, Trash2, Users, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { formatInTimeZone } from "@/lib/events"
import type { EventOccurrence } from "@/lib/events"

type RsvpStatus = "going" | "maybe" | "not_going" | "waitlist" | null

interface EventCardProps {
  event: any
  occurrence: EventOccurrence
  timezone: string
  serverId: string
  onRsvp: (eventId: string, status: "going" | "maybe" | "not_going") => Promise<void>
  compact?: boolean
  canEdit?: boolean
  onDelete?: (eventId: string) => Promise<void>
  onCancel?: (eventId: string) => Promise<void>
}

function useCountdown(startAt: Date): string {
  const [label, setLabel] = useState(() => computeLabel(startAt))

  useEffect(() => {
    setLabel(computeLabel(startAt))
    const id = setInterval(() => setLabel(computeLabel(startAt)), 30_000)
    return () => clearInterval(id)
  }, [startAt])

  return label
}

function computeLabel(startAt: Date): string {
  const diffMs = startAt.getTime() - Date.now()
  if (diffMs < 0) {
    const endedMsAgo = Math.abs(diffMs)
    if (endedMsAgo < 2 * 60 * 60 * 1000) return "\uD83D\uDD34 Live now"
    return "Ended"
  }
  const totalMinutes = Math.floor(diffMs / 60_000)
  if (totalMinutes < 60) return `Starts in ${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours < 24) return mins > 0 ? `Starts in ${hours}h ${mins}m` : `Starts in ${hours}h`
  const days = Math.floor(hours / 24)
  return `Starts in ${days}d`
}

export function EventCard({ event, occurrence, timezone, serverId, onRsvp, compact = false, canEdit = false, onDelete, onCancel }: EventCardProps) {
  const router = useRouter()
  const countdown = useCountdown(occurrence.startAt)
  const myStatus: RsvpStatus = event?.myRsvp?.status ?? null
  const interestedCount = (event?.stats?.going ?? 0) + (event?.stats?.maybe ?? 0)

  const isLive = countdown === "\uD83D\uDD34 Live now"
  const isEnded = countdown === "Ended"

  function handleAddToCalendar() {
    window.open(`/api/servers/${serverId}/events/${event.id}/ical`, "_blank")
  }

  function handleJoinVoice() {
    if (event.voice_channel_id) {
      router.push(`/channels/${serverId}/${event.voice_channel_id}`)
    }
  }

  if (compact) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-zinc-700/50 bg-zinc-900/60 p-2.5 hover:bg-zinc-800/60 transition-colors">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600/20 text-blue-400">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{occurrence.title}</p>
          <p className="text-xs text-zinc-400">
            {occurrence.startAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} &middot; {interestedCount} interested
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${isLive ? "text-red-400" : "text-zinc-500"}`}>{countdown}</span>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-md">
      {/* Banner */}
      {event.banner_url ? (
        <div className="h-32 w-full overflow-hidden">
          <img src={event.banner_url} alt={occurrence.title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-20 w-full bg-gradient-to-br from-blue-900/60 via-indigo-900/40 to-zinc-900" />
      )}

      <div className="p-4 space-y-3">
        {/* Title + countdown */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-zinc-100 leading-tight">{occurrence.title}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isLive
                ? "bg-red-500/20 text-red-400"
                : isEnded
                ? "bg-zinc-700/40 text-zinc-500"
                : "bg-blue-600/20 text-blue-300"
            }`}
          >
            {countdown}
          </span>
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-sm text-zinc-400 line-clamp-2">{event.description}</p>
        )}

        {/* Date/time */}
        <div className="flex items-center gap-1.5 text-sm text-zinc-300">
          <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span>{formatInTimeZone(occurrence.startAt.toISOString(), timezone)}</span>
          {occurrence.endAt && (
            <span className="text-zinc-500">
              {" "}&rarr; {formatInTimeZone(occurrence.endAt.toISOString(), timezone)}
            </span>
          )}
        </div>

        {/* Recurrence badge */}
        {event.recurrence && event.recurrence !== "none" && (
          <div className="flex items-center gap-1 text-xs text-indigo-400">
            <Repeat className="h-3 w-3" />
            <span className="capitalize">Repeats {event.recurrence}</span>
            {event.recurrence_until && (
              <span className="text-zinc-500">
                until {new Date(event.recurrence_until).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {interestedCount} interested
          </span>
          {event.capacity && (
            <span className="text-zinc-500">
              {event.stats?.going ?? 0} / {event.capacity} going
            </span>
          )}
          {myStatus === "waitlist" && (
            <span className="text-yellow-400">You&apos;re on the waitlist</span>
          )}
        </div>

        {/* RSVP buttons */}
        {!isEnded && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={myStatus === "going" ? "default" : "secondary"}
              onClick={() => onRsvp(event.id, "going")}
              className="h-7 text-xs"
            >
              {myStatus === "going" ? "\u2713 Going" : "Going"}
            </Button>
            <Button
              size="sm"
              variant={myStatus === "maybe" ? "default" : "secondary"}
              onClick={() => onRsvp(event.id, "maybe")}
              className="h-7 text-xs"
            >
              {myStatus === "maybe" ? "\u2713 Maybe" : "Maybe"}
            </Button>
            <Button
              size="sm"
              variant={myStatus === "not_going" ? "default" : "secondary"}
              onClick={() => onRsvp(event.id, "not_going")}
              className="h-7 text-xs"
            >
              {myStatus === "not_going" ? "\u2713 Not going" : "Not going"}
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-700/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAddToCalendar}
            className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Add to calendar
          </Button>

          {event.voice_channel_id && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleJoinVoice}
              className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
            >
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              Join Voice
            </Button>
          )}

          {event.event_type === "external" && event.external_url && (
            <a
              href={event.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Join Event
            </a>
          )}

          {canEdit && (
            <div className="ml-auto flex gap-1">
              {!event.cancelled_at && onCancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCancel(event.id)}
                  className="h-7 text-xs text-yellow-500 hover:text-yellow-400"
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}
              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(event.id)}
                  className="h-7 text-xs text-red-500 hover:text-red-400"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
