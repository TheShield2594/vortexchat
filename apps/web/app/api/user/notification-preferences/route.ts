import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { UserNotificationPreferences } from "@vortex/shared"

const DEFAULTS: UserNotificationPreferences = {
  mention_notifications: true,
  reply_notifications: true,
  friend_request_notifications: true,
  server_invite_notifications: true,
  system_notifications: true,
  sound_enabled: true,
  notification_volume: 0.5,
  suppress_everyone: false,
  suppress_role_mentions: false,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_timezone: "UTC",
  push_notifications: true,
  show_message_preview: true,
  show_unread_badge: true,
}

// GET /api/user/notification-preferences
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("mention_notifications, reply_notifications, friend_request_notifications, server_invite_notifications, system_notifications, sound_enabled, notification_volume, suppress_everyone, suppress_role_mentions, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, push_notifications, show_message_preview, show_unread_badge")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Failed to load notification preferences" }, { status: 500 })
    }

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
      "suppress_everyone",
      "suppress_role_mentions",
      "quiet_hours_enabled",
      "push_notifications",
      "show_message_preview",
      "show_unread_badge",
    ] as const

    const patch: Record<string, boolean | string | number> = {}
    for (const key of BOOL_KEYS) {
      if (key in body) {
        if (typeof body[key] !== "boolean") {
          return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
        }
        patch[key] = body[key] as boolean
      }
    }

    // Validate notification_volume (float 0–1)
    if ("notification_volume" in body) {
      const vol = body.notification_volume
      if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0 || vol > 1) {
        return NextResponse.json({ error: "notification_volume must be a number between 0 and 1" }, { status: 400 })
      }
      patch.notification_volume = vol
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
