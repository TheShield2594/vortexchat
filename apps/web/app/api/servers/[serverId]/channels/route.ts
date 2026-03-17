import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ serverId: string }> }

/**
 * GET /api/servers/[serverId]/channels
 * Returns all channels in this server the user has access to (via RLS).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("channels")
    .select("id, name, type, position, category_id")
    .eq("server_id", serverId)
    .order("position", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
