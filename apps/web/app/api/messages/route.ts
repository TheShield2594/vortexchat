import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get("channelId")
  const before = searchParams.get("before")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 })
  }

  let query = supabase
    .from("messages")
    .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt("created_at", before)
  }

  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((messages ?? []).reverse())
}
