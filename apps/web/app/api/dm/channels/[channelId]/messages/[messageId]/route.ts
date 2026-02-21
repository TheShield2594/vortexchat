import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// PATCH /api/dm/channels/[channelId]/messages/[messageId] — edit a DM message
export async function PATCH(
  req: NextRequest,
  { params }: { params: { channelId: string; messageId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 })

  const { data, error } = await supabase
    .from("direct_messages")
    .update({ content: content.trim(), edited_at: new Date().toISOString() })
    .eq("id", params.messageId)
    .eq("sender_id", user.id)
    .eq("dm_channel_id", params.channelId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 })

  return NextResponse.json(data)
}

// DELETE /api/dm/channels/[channelId]/messages/[messageId] — soft-delete a DM message
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { channelId: string; messageId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await supabase
    .from("direct_messages")
    .update({ deleted_at: new Date().toISOString(), content: null })
    .eq("id", params.messageId)
    .eq("sender_id", user.id)
    .eq("dm_channel_id", params.channelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
