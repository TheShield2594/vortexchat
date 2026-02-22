import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/servers/discover?q=search&cursor=uuid
// Lists public servers, optionally filtered by name
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  // Allow unauthenticated browsing
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const limit = 24

  let query = supabase
    .from("servers")
    .select("id, name, description, icon_url, member_count, invite_code")
    .eq("is_public", true)
    .order("member_count", { ascending: false })
    .limit(limit)

  if (q) {
    query = query.ilike("name", `%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
