import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import {
  applyTimelineFilters,
  deriveIncidentKey,
  mapActionType,
  paginateTimeline,
  timelineToCsv,
  type TimelineActionType,
  type TimelineCursor,
  type TimelineEvent,
} from "@/lib/mod-ledger"

function parseActionTypes(raw: string | null): TimelineActionType[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token): token is TimelineActionType =>
      ["ban", "kick", "timeout", "message_action", "automod", "appeal", "role_change", "settings", "other"].includes(token)
    )
}

function parseCursor(raw: string | null): TimelineCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as TimelineCursor
    if (!parsed?.created_at || !parsed?.id) return null
    return parsed
  } catch {
    return null
  }
}

function encodeCursor(cursor: TimelineCursor | null): string | null {
  if (!cursor) return null
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  if (server?.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 200)
  const cursor = parseCursor(searchParams.get("cursor"))

  const filters = {
    actorId: searchParams.get("actor_id"),
    targetId: searchParams.get("target_id"),
    actionTypes: parseActionTypes(searchParams.get("action_types")),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  }

  // Reuse existing audit_logs as the primary data source.
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, action, actor_id, target_id, target_type, changes, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: "Failed to fetch moderation timeline" }, { status: 500 })

  const entries: TimelineEvent[] = (logs ?? []).map((log) => {
    const metadata = (log.changes ?? null) as Record<string, unknown> | null
    const action_type = mapActionType(log.action)
    const base = {
      id: log.id,
      action: log.action,
      action_type,
      created_at: log.created_at,
      actor_id: log.actor_id,
      target_id: log.target_id,
      target_type: log.target_type,
      reason: (metadata?.reason as string | undefined) ?? null,
      metadata,
      actor: null,
      target: null,
    } satisfies Omit<TimelineEvent, "incident_key">

    return {
      ...base,
      incident_key: deriveIncidentKey({
        action_type,
        target_id: base.target_id,
        metadata,
        created_at: base.created_at,
      }),
    }
  })

  const filtered = applyTimelineFilters(entries, filters)
  const { data: page, nextCursor } = paginateTimeline(filtered, limit, cursor)

  const userIds = new Set<string>()
  for (const event of page) {
    if (event.actor_id) userIds.add(event.actor_id)
    if (event.target_id && event.target_type === "user") userIds.add(event.target_id)
  }

  let users: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }> = []
  if (userIds.size) {
    const { data: fetchedUsers } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", Array.from(userIds))
    users = (fetchedUsers ?? []) as typeof users
  }

  const userMap = Object.fromEntries((users ?? []).map((row) => [row.id, row]))
  const hydrated = page.map((event) => ({
    ...event,
    actor: event.actor_id ? userMap[event.actor_id] ?? null : null,
    target: event.target_id && event.target_type === "user" ? userMap[event.target_id] ?? null : null,
  }))

  const format = (searchParams.get("format") ?? "json").toLowerCase()
  if (format === "csv") {
    const csv = timelineToCsv(hydrated)
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mod-ledger-${serverId}.csv"`,
      },
    })
  }

  const grouped = hydrated.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    if (!acc[event.incident_key]) acc[event.incident_key] = []
    acc[event.incident_key].push(event)
    return acc
  }, {})

  return NextResponse.json({
    data: hydrated,
    incidents: Object.entries(grouped).map(([incident_key, incidentEvents]) => ({
      incident_key,
      count: incidentEvents.length,
      started_at: incidentEvents[incidentEvents.length - 1]?.created_at ?? null,
      latest_at: incidentEvents[0]?.created_at ?? null,
      events: incidentEvents,
    })),
    next_cursor: encodeCursor(nextCursor),
  })
}
