import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type UserNotificationPreferences = {
  mention_notifications: boolean
  reply_notifications: boolean
  friend_request_notifications: boolean
  server_invite_notifications: boolean
  system_notifications: boolean
  sound_enabled: boolean
}

const DEFAULTS: UserNotificationPreferences = {
  mention_notifications: true,
  reply_notifications: true,
  friend_request_notifications: true,
  server_invite_notifications: true,
  system_notifications: true,
  sound_enabled: true,
}

// GET /api/user/notification-preferences
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("user_notification_preferences")
    .select("mention_notifications, reply_notifications, friend_request_notifications, server_invite_notifications, system_notifications, sound_enabled")
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json(data ?? DEFAULTS)
}

// PUT /api/user/notification-preferences
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as Record<string, unknown>

  // Validate: only accept boolean values for known keys
  const BOOL_KEYS: (keyof UserNotificationPreferences)[] = [
    "mention_notifications",
    "reply_notifications",
    "friend_request_notifications",
    "server_invite_notifications",
    "system_notifications",
    "sound_enabled",
  ]

  const patch: Partial<UserNotificationPreferences> = {}
  for (const key of BOOL_KEYS) {
    if (key in body) {
      if (typeof body[key] !== "boolean") {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
      }
      patch[key] = body[key] as boolean
    }
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
