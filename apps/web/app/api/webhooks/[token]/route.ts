import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/webhooks/[token]
 *
 * Incoming webhook endpoint. Accepts JSON body compatible with Discord webhook format:
 *   { content?: string, username?: string, avatar_url?: string, embeds?: Array<{ title, description, color }> }
 *
 * The webhook token maps to a specific channel in a specific server.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin()
  const { token } = await params

  // Resolve webhook by token
  const { data: webhook, error: whError } = await supabaseAdmin
    .from("webhooks")
    .select("id, channel_id, server_id, name, avatar_url")
    .eq("token", token)
    .single()

  if (whError || !webhook) {
    return NextResponse.json({ error: "Unknown webhook" }, { status: 404 })
  }

  let body: {
    content?: string
    username?: string
    avatar_url?: string
    embeds?: Array<{ title?: string; description?: string; color?: number }>
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { content, username, avatar_url, embeds } = body

  if (!content && (!embeds || embeds.length === 0)) {
    return NextResponse.json({ error: "content or embeds required" }, { status: 400 })
  }

  // Build message content — concatenate embed descriptions if no content
  let messageContent = content?.slice(0, 2000) ?? ""
  if (!messageContent && embeds?.length) {
    const e = embeds[0]
    const parts = []
    if (e.title) parts.push(`**${e.title}**`)
    if (e.description) parts.push(e.description)
    messageContent = parts.join("\n").slice(0, 2000)
  }

  // The webhook display name and avatar override come from the request (like Discord)
  const displayName = username?.slice(0, 80) ?? webhook.name ?? "Webhook"
  const webhookAvatarUrl = avatar_url ?? webhook.avatar_url ?? null

  // Create a system-style message in the channel
  // We store webhook messages as regular messages but mark them with a special author reference.
  // Since we don't have a real user, we use the service role to insert directly.
  // We find the server owner's ID to use as a stand-in author (or use a system marker).
  // A cleaner approach: look up the server owner to satisfy the FK.
  const { data: serverRow } = await supabaseAdmin
    .from("servers")
    .select("owner_id")
    .eq("id", webhook.server_id)
    .single()

  if (!serverRow) return NextResponse.json({ error: "Server not found" }, { status: 404 })

  // Insert the message as the server owner (webhook attribution stored in content prefix)
  const prefix = `**[${displayName}]** `
  const { data: message, error: msgError } = await supabaseAdmin
    .from("messages")
    .insert({
      channel_id: webhook.channel_id,
      author_id: serverRow.owner_id,
      content: prefix + messageContent,
    })
    .select("id")
    .single()

  if (msgError) {
    console.error("Webhook message insert failed:", msgError.message)
    return NextResponse.json({ error: "internal server error" }, { status: 500 })
  }

  return NextResponse.json({ id: message.id }, { status: 200 })
}

// GET — return webhook info (used by management UI to verify token)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin()
  const { token } = await params

  const { data: webhook } = await supabaseAdmin
    .from("webhooks")
    .select("id, name, avatar_url, channel_id, server_id")
    .eq("token", token)
    .single()

  if (!webhook) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 })
  return NextResponse.json({ id: webhook.id, name: webhook.name, channel_id: webhook.channel_id })
}
