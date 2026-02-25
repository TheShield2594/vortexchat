import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sanitizeBannerColor } from "@/lib/banner-color"
import type { UserRow } from "@/types/database"

type ProfileUpdatePayload = Partial<Pick<UserRow,
  "display_name" | "username" | "bio" | "custom_tag" | "status_message" | "status_emoji" | "status_expires_at" | "status" | "banner_color" | "avatar_url" | "appearance_settings"
>>

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json()) as ProfileUpdatePayload

  if (body.banner_color !== undefined && body.banner_color !== null) {
    const normalized = sanitizeBannerColor(body.banner_color)
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid banner_color. Use a hex color (e.g. #5865f2) or an allowed named color." },
        { status: 422 }
      )
    }
    body.banner_color = normalized
  }

  if (body.status_expires_at !== undefined && body.status_expires_at !== null) {
    const expiryTime = new Date(body.status_expires_at).getTime()
    if (Number.isNaN(expiryTime)) {
      return NextResponse.json(
        { error: "Invalid status_expires_at. Use an ISO-8601 datetime." },
        { status: 422 }
      )
    }
  }

  if (body.status_emoji !== undefined && body.status_emoji !== null && body.status_emoji.length > 8) {
    return NextResponse.json(
      { error: "status_emoji must be 8 characters or fewer." },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from("users")
    .update(body)
    .eq("id", user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
