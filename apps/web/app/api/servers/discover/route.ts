import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const PAGE_SIZE = 24

type SortOption = "members" | "newest"

// GET /api/servers/discover?q=search&sort=members|newest&cursor=uuid
// Lists public servers with search, sorting, and cursor pagination
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const sort = (searchParams.get("sort") as SortOption) || "members"
  const cursor = searchParams.get("cursor")?.trim()

  // Determine sort column and direction
  const orderCol = sort === "newest" ? "created_at" : "member_count"
  const ascending = false

  let query = supabase
    .from("servers")
    .select("id, name, description, icon_url, member_count, invite_code, created_at")
    .eq("is_public", true)
    .order(orderCol, { ascending })
    .limit(PAGE_SIZE + 1) // fetch one extra to detect next page

  // Search across name and description
  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
  }

  // Cursor-based pagination: fetch the cursor row to get its sort value
  if (cursor) {
    const { data: cursorRow } = await supabase
      .from("servers")
      .select("member_count, created_at")
      .eq("id", cursor)
      .single()

    if (cursorRow) {
      if (sort === "newest") {
        query = query.lt("created_at", cursorRow.created_at)
      } else {
        // For member_count ties, use id as tiebreaker
        query = query.or(
          `member_count.lt.${cursorRow.member_count},and(member_count.eq.${cursorRow.member_count},id.lt.${cursor})`
        )
      }
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = data ?? []
  const hasMore = items.length > PAGE_SIZE
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items
  const nextCursor = hasMore ? page[page.length - 1].id : null

  return NextResponse.json({ servers: page, nextCursor })
}
