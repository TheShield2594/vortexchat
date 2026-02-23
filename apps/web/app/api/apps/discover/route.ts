import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const query = req.nextUrl.searchParams.get("q")?.trim()
  const category = req.nextUrl.searchParams.get("category")?.trim()

  let builder = db
    .from("app_catalog")
    .select("id, slug, name, description, category, trust_badge, average_rating, review_count, permissions")
    .eq("is_published", true)
    .order("review_count", { ascending: false })

  if (query) {
    builder = builder.or(`name.ilike.%${query}%,description.ilike.%${query}%`)
  }
  if (category && category !== "all") {
    builder = builder.eq("category", category)
  }

  const { data, error } = await builder
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
