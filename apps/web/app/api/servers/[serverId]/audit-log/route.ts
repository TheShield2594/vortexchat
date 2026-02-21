import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/servers/[serverId]/audit-log?limit=50&before=timestamp
export async function GET(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Only server owner can view audit log
  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  if (server?.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)
  const before = searchParams.get("before")

  let query = supabase
    .from("audit_logs")
    .select(`
      id, action, target_user_id, reason, metadata, created_at,
      actor:users!audit_logs_actor_id_fkey(id, username, display_name, avatar_url),
      target:users!audit_logs_target_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("server_id", params.serverId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) query = query.lt("created_at", before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
