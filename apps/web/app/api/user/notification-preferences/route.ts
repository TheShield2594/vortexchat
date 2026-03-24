import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type UserNotificationPreferences = {
  mention_notifications: boolean
  reply_notifications: boolean
  friend_request_notifications: boolean
  server_invite_notifications: boolean
  system_notifications: boolean
  sound_enabled: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  quiet_hours_timezone: string
}

const DEFAULTS: UserNotificationPreferences = {
  mention_notifications: true,
  reply_notifications: true,
  friend_request_notifications: true,
  server_invite_notifications: true,
  system_notifications: true,
  sound_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_timezone: "UTC",
}

// GET /api/user/notification-preferences
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data } = await supabase
      .from("user_notification_preferences")
      .select("mention_notifications, reply_notifications, friend_request_notifications, server_invite_notifications, system_notifications, sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
      .eq("user_id", user.id)
      .maybeSingle()

    return NextResponse.json(data ?? DEFAULTS)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT /api/user/notification-preferences
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json() as Record<string, unknown>

    // Validate: only accept boolean values for known boolean keys
    const BOOL_KEYS = [
      "mention_notifications",
      "reply_notifications",
      "friend_request_notifications",
      "server_invite_notifications",
      "system_notifications",
      "sound_enabled",
      "quiet_hours_enabled",
    ] as const

    const patch: Record<string, boolean | string> = {}
    for (const key of BOOL_KEYS) {
      if (key in body) {
        if (typeof body[key] !== "boolean") {
          return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
        }
        patch[key] = body[key] as boolean
      }
    }

    // Validate quiet hours time fields (HH:MM format)
    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
    for (const key of ["quiet_hours_start", "quiet_hours_end"] as const) {
      if (key in body) {
        if (typeof body[key] !== "string" || !TIME_RE.test(body[key] as string)) {
          return NextResponse.json({ error: `${key} must be HH:MM format` }, { status: 400 })
        }
        patch[key] = body[key] as string
      }
    }

    // Validate timezone using Intl API
    if ("quiet_hours_timezone" in body) {
      const tz = body.quiet_hours_timezone
      if (typeof tz !== "string" || !tz || tz.length > 64) {
        return NextResponse.json({ error: "quiet_hours_timezone must be a valid IANA timezone string" }, { status: 400 })
      }
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz })
      } catch {
        return NextResponse.json({ error: "quiet_hours_timezone must be a valid IANA timezone string" }, { status: 400 })
      }
      patch.quiet_hours_timezone = tz
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
    }

    const { error } = await supabase
      .from("user_notification_preferences")
      .upsert(
        { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )

    if (error) return NextResponse.json({ error: "Failed to save notification preferences" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
