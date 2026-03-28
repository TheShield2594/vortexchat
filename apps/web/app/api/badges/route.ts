/**
 * GET /api/badges — list all badge definitions (public catalog)
 */
import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: badges, error } = await supabase
      .from("badge_definitions")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch badges" }, { status: 500 })
    }

    return NextResponse.json(badges)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
