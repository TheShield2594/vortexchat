import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// POST /api/dm/channels/[channelId]/messages — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership
  const { data: membership } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", params.channelId)
    .eq("user_id", user.id)
    .single()

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 })

  const { data: message, error } = await supabase
    .from("direct_messages")
    .insert({
      dm_channel_id: params.channelId,
      sender_id: user.id,
      content,
    })
    .select("*, sender:users!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, status)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(message, { status: 201 })
}
