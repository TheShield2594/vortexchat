import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, start_at, end_at, external_url, server_id")
    .eq("id", params.eventId)
    .eq("server_id", params.serverId)
    .single()

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 60 * 60 * 1000)
  const uid = `${event.id}@vortexchat`
  const url = event.external_url ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://vortexchat.app"}/channels/${params.serverId}/events`

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VortexChat//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${formatIcalDate(start)}`,
    `DTEND:${formatIcalDate(end)}`,
    `SUMMARY:${escapeIcal(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcal(event.description)}` : "",
    `URL:${url}`,
    `DTSTAMP:${formatIcalDate(new Date())}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(event.title)}.ics"`,
    },
  })
}
