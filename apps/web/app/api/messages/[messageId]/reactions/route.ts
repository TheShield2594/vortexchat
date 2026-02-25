import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getChannelPermissions, hasPermission } from "@/lib/permissions"
import { isBlockedBetweenUsers } from "@/lib/blocking"

interface Body {
  emoji?: string
  nonce?: string
}

async function resolveMessageContext(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, messageId: string) {
  return supabase
    .from("messages")
    .select("id, author_id, channel_id, channels(server_id)")
    .eq("id", messageId)
    .is("deleted_at", null)
    .maybeSingle()
}

function normalizeEmoji(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  return value.slice(0, 64)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  const emoji = normalizeEmoji(body.emoji)
  if (!emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 })

  const { data: message, error: messageError } = await resolveMessageContext(supabase, messageId)
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  const channelServerId = (message as any)?.channels?.server_id as string | null
  if (channelServerId) {
    const { isAdmin, permissions } = await getChannelPermissions(supabase, channelServerId, message.channel_id, user.id)
    if (!isAdmin && !hasPermission(permissions, "VIEW_CHANNELS")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (await isBlockedBetweenUsers(supabase as any, user.id, message.author_id)) {
    return NextResponse.json({ error: "Cannot react due to block state" }, { status: 403 })
  }

  const { error } = await supabase
    .from("reactions")
    .upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, emoji, nonce: body.nonce ?? null })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  const emoji = normalizeEmoji(body.emoji)
  if (!emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 })

  const { data: message, error: messageError } = await resolveMessageContext(supabase, messageId)
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  const channelServerId = (message as any)?.channels?.server_id as string | null
  if (channelServerId) {
    const { isAdmin, permissions } = await getChannelPermissions(supabase, channelServerId, message.channel_id, user.id)
    if (!isAdmin && !hasPermission(permissions, "VIEW_CHANNELS")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from("reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, emoji, nonce: body.nonce ?? null })
}
