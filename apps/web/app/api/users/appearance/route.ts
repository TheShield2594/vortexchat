import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/utils/api-helpers"

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { supabase, user, error: authError } = await requireAuth()
    if (authError) return authError

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 })
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("appearance_settings" in body)
    ) {
      return NextResponse.json(
        { error: "Missing required field: appearance_settings" },
        { status: 400 }
      )
    }

    const { appearance_settings } = body as {
      appearance_settings: Record<string, unknown> | null
    }

    if (
      appearance_settings !== null &&
      (typeof appearance_settings !== "object" ||
        Array.isArray(appearance_settings))
    ) {
      return NextResponse.json(
        { error: "appearance_settings must be an object or null" },
        { status: 400 }
      )
    }

    const { data, error: updateError } = await supabase
      .from("users")
      .update({ appearance_settings })
      .eq("id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("[PATCH /api/users/appearance]", {
        userId: user.id,
        message: updateError.message,
      })
      return NextResponse.json(
        { error: "Failed to update appearance settings" },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
