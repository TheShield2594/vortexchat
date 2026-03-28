/**
 * GET /api/servers/[serverId]/admin/health
 *
 * Returns community health metrics for the server dashboard:
 * - Active member counts and trends
 * - Message activity
 * - Moderation action frequency
 * - Top channels by activity
 * - Unresolved appeals
 * - Permission conflict warnings
 *
 * Requires ADMINISTRATOR permission.
 */
import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions } from "@/lib/permissions"
import { PERMISSIONS } from "@vortex/shared"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
): Promise<NextResponse> {
  const { serverId } = await params

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { isAdmin } = await getMemberPermissions(supabase, serverId, user.id)
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

    // Active members (posted in last 7 days vs previous 7 days)
    const { count: activeNow } = await supabase
      .from("messages")
      .select("author_id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", sevenDaysAgo)
    const { count: activePrev } = await supabase
      .from("messages")
      .select("author_id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", fourteenDaysAgo)
      .lt("created_at", sevenDaysAgo)

    const currentActive = activeNow ?? 0
    const previousActive = activePrev ?? 0
    const activeTrend = previousActive === 0 ? 0 : Math.round(((currentActive - previousActive) / previousActive) * 100)

    // Messages today
    const { count: messagesToday } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", todayStart)

    // Messages this week
    const { count: messagesWeek } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", sevenDaysAgo)

    // Moderation actions (last 7 days vs previous 7)
    const { count: modNow } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", sevenDaysAgo)
    const { count: modPrev } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .gte("created_at", fourteenDaysAgo)
      .lt("created_at", sevenDaysAgo)

    const modActions = modNow ?? 0
    const modPrevActions = modPrev ?? 0
    const modTrend = modPrevActions === 0 ? 0 : Math.round(((modActions - modPrevActions) / modPrevActions) * 100)

    // Top channels by message count (this week)
    const { data: channelActivity } = await supabase
      .rpc("top_channels_by_messages", { p_server_id: serverId, p_since: sevenDaysAgo, p_limit: 5 })

    const topChannels = (channelActivity ?? []).map((ch: { id: string; name: string; message_count: number }) => ({
      id: ch.id,
      name: ch.name,
      message_count: ch.message_count,
    }))

    // Unresolved appeals
    const { count: unresolvedAppeals } = await supabase
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .eq("status", "pending")

    // Permission warnings — detect conflicting overwrites
    const warnings: string[] = []
    const { data: roles } = await supabase
      .from("roles")
      .select("id, name, permissions")
      .eq("server_id", serverId)

    if (roles) {
      // Check for roles with ADMINISTRATOR that aren't the top role
      const adminRoles = roles.filter((r: { id: string; name: string; permissions: number }) => (r.permissions & PERMISSIONS.ADMINISTRATOR) !== 0)
      if (adminRoles.length > 2) {
        warnings.push(`${adminRoles.length} roles have Administrator permission — consider reducing to minimize risk`)
      }

      // Check for channel overwrites that deny VIEW_CHANNELS on @everyone
      const { data: overwrites } = await supabase
        .from("channel_overwrites")
        .select("channel_id, role_id, deny")
        .eq("server_id", serverId)

      if (overwrites) {
        const defaultRole = roles.find((r: { id: string; name: string; permissions: number }) => r.name === "@everyone" || r.name === "everyone")
        if (defaultRole) {
          const deniedChannels = overwrites.filter(
            (ow: { channel_id: string; role_id: string; deny: number | null }) => ow.role_id === defaultRole.id && ((ow.deny ?? 0) & PERMISSIONS.VIEW_CHANNELS) !== 0
          )
          if (deniedChannels.length > 0) {
            warnings.push(`${deniedChannels.length} channel(s) hide from @everyone — verify this is intentional`)
          }
        }
      }
    }

    return NextResponse.json({
      active_members: {
        current: currentActive,
        previous: previousActive,
        trend: activeTrend,
      },
      messages_today: messagesToday ?? 0,
      messages_this_week: messagesWeek ?? 0,
      moderation_actions_7d: modActions,
      moderation_actions_trend: modTrend,
      top_channels: topChannels,
      unresolved_appeals: unresolvedAppeals ?? 0,
      permission_warnings: warnings,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
