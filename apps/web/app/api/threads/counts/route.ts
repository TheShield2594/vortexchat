import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/threads/counts?serverId=xxx
// Returns active (non-archived) thread counts keyed by parent channel id.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get("serverId")
  if (!serverId) return NextResponse.json({ error: "serverId required" }, { status: 400 })

  const { data: membership, error: membershipError } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle()

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
  if (!membership) return NextResponse.json({ error: "Not a member of this server" }, { status: 403 })

  const { data, error } = await supabase.rpc("get_thread_counts_by_channel", {
    p_server_id: serverId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.parent_channel_id] = Number(row.count)
  }

  return NextResponse.json(counts, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
  })
}
