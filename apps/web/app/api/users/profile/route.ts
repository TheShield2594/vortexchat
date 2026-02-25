import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sanitizeBannerColor } from "@/lib/banner-color"
import type { UserRow } from "@/types/database"

type ProfileUpdatePayload = Partial<Pick<UserRow,
  "display_name" | "username" | "bio" | "custom_tag" | "status_message" | "status" | "banner_color" | "avatar_url" | "appearance_settings"
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
