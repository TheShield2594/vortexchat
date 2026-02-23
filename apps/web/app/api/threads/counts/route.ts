import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/threads/counts?serverId=xxx
// Returns active (non-archived) thread counts keyed by parent channel id.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get("serverId")
  if (!serverId) return NextResponse.json({ error: "serverId required" }, { status: 400 })

  const { data: threads, error } = await supabase
    .from("threads")
    .select("parent_channel_id, channels!inner(server_id)")
    .eq("archived", false)
    .eq("channels.server_id", serverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const thread of threads ?? []) {
    const channelId = (thread as { parent_channel_id: string }).parent_channel_id
    counts[channelId] = (counts[channelId] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
