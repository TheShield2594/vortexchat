import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

function sanitizeIlikeQuery(value: string) {
  return value
    .replace(/[,%]/g, "")
    .replace(/[().]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Allow unauthenticated browsing — public marketplace endpoint.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const query = req.nextUrl.searchParams.get("q")?.trim()
  const category = req.nextUrl.searchParams.get("category")?.trim()

  let builder = supabase
    .from("app_catalog_public")
    .select("id, slug, name, description, category, trust_badge, average_rating, review_count, permissions")
    .eq("is_published", true)
    .order("review_count", { ascending: false })

  if (query) {
    const safeQuery = sanitizeIlikeQuery(query)
    if (safeQuery) {
      builder = builder.or(`name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`)
    }
  }

  if (category && category !== "all") {
    builder = builder.eq("category", category)
  }

  const { data, error } = await builder
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
