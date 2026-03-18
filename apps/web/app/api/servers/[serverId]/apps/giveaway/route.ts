import { NextRequest, NextResponse } from "next/server"
import { requireServerPermission } from "@/lib/server-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SYSTEM_BOT_ID } from "@/lib/server-auth"

type Params = { params: Promise<{ serverId: string }> }

/**
 * GET /api/servers/[serverId]/apps/giveaway
 * Returns giveaway config + active giveaways for the server.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, error } = await requireServerPermission(serverId, "SEND_MESSAGES")
  if (error) return error

  const [configResult, giveawaysResult] = await Promise.all([
    supabase
      .from("giveaway_app_configs")
      .select("*")
      .eq("server_id", serverId)
      .maybeSingle(),
    supabase
      .from("giveaways")
      .select("*, giveaway_entries(count)")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (configResult.error) return NextResponse.json({ error: configResult.error.message }, { status: 500 })

  return NextResponse.json({
    config: configResult.data,
    giveaways: giveawaysResult.data ?? [],
  })
}

/**
 * POST /api/servers/[serverId]/apps/giveaway
 * Create a new giveaway or update giveaway config.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, user, error } = await requireServerPermission(serverId, "MANAGE_CHANNELS")
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = body.action as string

  // Update giveaway channel config
  if (action === "set_channel") {
    const channelId = body.channel_id as string | null

    if (channelId) {
      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("id", channelId)
        .eq("server_id", serverId)
        .single()
      if (!channel) return NextResponse.json({ error: "Channel not found in this server" }, { status: 400 })
    }

    const { data, error: upsertError } = await supabase
      .from("giveaway_app_configs")
      .upsert({ server_id: serverId, channel_id: channelId, enabled: true }, { onConflict: "server_id" })
      .select("*")
      .single()

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Create a new giveaway
  if (action === "create_giveaway") {
    const { title, description, prize, winners_count, duration_minutes, channel_id } = body as {
      title?: string
      description?: string
      prize?: string
      winners_count?: number
      duration_minutes?: number
      channel_id?: string
    }

    if (!prize) return NextResponse.json({ error: "prize is required" }, { status: 400 })
    if (!duration_minutes || duration_minutes < 1 || duration_minutes > 43200) {
      return NextResponse.json({ error: "duration_minutes must be between 1 and 43200 (30 days)" }, { status: 400 })
    }

    // Determine channel — use explicit channel_id or fall back to configured giveaway channel
    let targetChannelId = channel_id
    if (!targetChannelId) {
      const { data: config } = await supabase
        .from("giveaway_app_configs")
        .select("channel_id")
        .eq("server_id", serverId)
        .maybeSingle()
      targetChannelId = config?.channel_id ?? undefined
    }

    if (!targetChannelId) {
      return NextResponse.json({ error: "No giveaway channel configured. Set one first." }, { status: 400 })
    }

    const endsAt = new Date(Date.now() + duration_minutes * 60 * 1000).toISOString()
    const giveawayTitle = title || prize

    const { data: giveaway, error: insertError } = await supabase
      .from("giveaways")
      .insert({
        server_id: serverId,
        channel_id: targetChannelId,
        title: giveawayTitle,
        description: description || null,
        prize,
        winners_count: Math.min(Math.max(winners_count ?? 1, 1), 20),
        ends_at: endsAt,
        created_by: user!.id,
      })
      .select("*")
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    // Post announcement message in the giveaway channel
    const serviceClient = await createServiceRoleClient()
    const announceContent = [
      `**GIVEAWAY**`,
      `**${giveawayTitle}**`,
      description ? `\n${description}` : "",
      `\nPrize: **${prize}**`,
      `Winners: **${giveaway.winners_count}**`,
      `Ends: <t:${Math.floor(new Date(endsAt).getTime() / 1000)}:R>`,
      `\nUse \`/genter ${giveaway.id.slice(0, 8)}\` to enter!`,
    ].filter(Boolean).join("\n")

    await serviceClient.from("messages").insert({
      channel_id: targetChannelId,
      author_id: SYSTEM_BOT_ID,
      content: announceContent,
    })

    return NextResponse.json(giveaway, { status: 201 })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
