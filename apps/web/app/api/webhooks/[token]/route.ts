import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimiter } from "@/lib/rate-limit"
import { getClientIp } from "@vortex/shared"

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
  try {
    const { token } = await params

    // Coarse IP-level rate limit — 60 webhook calls per minute per IP
    const ip = getClientIp(req.headers) ?? "unknown"
    try {
      const ipRl = await rateLimiter.check(`webhook_ip:${ip}`, { limit: 60, windowMs: 60_000 })
      if (!ipRl.allowed) {
        return NextResponse.json({ error: "Rate limited" }, { status: 429 })
      }
    } catch {
      // Fail open — don't block webhooks if rate limiter is down
    }

    // Rate limit per webhook token — 30 messages per minute
    try {
      const rl = await rateLimiter.check(`webhook:${token}`, { limit: 30, windowMs: 60_000 })
      if (!rl.allowed) {
        return NextResponse.json({ error: "Rate limited" }, { status: 429 })
      }
    } catch {
      // Fail open — don't block webhook delivery if rate limiter is down
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Resolve webhook by token
    const { data: webhook, error: whError } = await supabaseAdmin
      .from("webhooks")
      .select("id, channel_id, server_id, name, avatar_url")
      .eq("token", token)
      .maybeSingle()

    if (whError) {
      console.error("[webhook POST] DB error resolving webhook:", whError.message)
      return NextResponse.json({ error: "internal server error" }, { status: 500 })
    }
    if (!webhook) {
      return NextResponse.json({ error: "Unknown webhook" }, { status: 404 })
    }

    let body: unknown

    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { content, username, avatar_url, embeds } = body as {
      content?: unknown
      username?: unknown
      avatar_url?: unknown
      embeds?: unknown
    }

    // Runtime type validation
    if (content !== undefined && typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 })
    }
    if (username !== undefined && typeof username !== "string") {
      return NextResponse.json({ error: "username must be a string" }, { status: 400 })
    }
    if (avatar_url !== undefined && typeof avatar_url !== "string") {
      return NextResponse.json({ error: "avatar_url must be a string" }, { status: 400 })
    }
    if (embeds !== undefined && !Array.isArray(embeds)) {
      return NextResponse.json({ error: "embeds must be an array" }, { status: 400 })
    }

    if (!content && (!embeds || embeds.length === 0)) {
      return NextResponse.json({ error: "content or embeds required" }, { status: 400 })
    }

    // Build message content — concatenate embed descriptions if no content
    let messageContent = content?.slice(0, 2000) ?? ""
    if (!messageContent && embeds?.length) {
      const e = embeds[0]
      if (typeof e === "object" && e !== null) {
        const parts: string[] = []
        if (typeof e.title === "string") parts.push(`**${e.title}**`)
        if (typeof e.description === "string") parts.push(e.description)
        messageContent = parts.join("\n").slice(0, 2000)
      }
    }

    // The webhook display name and avatar override come from the request (like Discord)
    const displayName = username?.slice(0, 80) ?? webhook.name ?? "Webhook"
    const webhookAvatarUrl = avatar_url ?? webhook.avatar_url ?? null

    // Look up the server owner to satisfy the FK.
    const { data: serverRow, error: serverError } = await supabaseAdmin
      .from("servers")
      .select("owner_id")
      .eq("id", webhook.server_id)
      .maybeSingle()

    if (serverError) {
      console.error("[webhook POST] DB error resolving server:", serverError.message)
      return NextResponse.json({ error: "internal server error" }, { status: 500 })
    }
    if (!serverRow) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }

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

    if (msgError || !message) {
      console.error("Webhook message insert failed:", msgError?.message)
      return NextResponse.json({ error: "internal server error" }, { status: 500 })
    }

    return NextResponse.json({ id: message.id }, { status: 200 })
  } catch (err) {
    console.error("Webhook handler error:", err instanceof Error ? err.message : "Unknown error")
    return NextResponse.json({ error: "internal server error" }, { status: 500 })
  }
}

// GET — return webhook info (used by management UI to verify token)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { token } = await params

    const { data: webhook, error } = await supabaseAdmin
      .from("webhooks")
      .select("id, name, avatar_url, channel_id, server_id")
      .eq("token", token)
      .maybeSingle()

    if (error) {
      console.error("[webhook GET] DB error:", error.message)
      return NextResponse.json({ error: "internal server error" }, { status: 500 })
    }
    if (!webhook) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 })
    return NextResponse.json({ id: webhook.id, name: webhook.name, channel_id: webhook.channel_id })
  } catch (err) {
    console.error("[webhook GET]", err instanceof Error ? err.message : "Unknown error")
    return NextResponse.json({ error: "internal server error" }, { status: 500 })
  }
}
