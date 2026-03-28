/**
 * GET/PATCH /api/servers/[serverId]/settings/theme
 *
 * Manage the server's recommended theme setting.
 * GET: returns the current recommended theme.
 * PATCH: updates the recommended theme (requires MANAGE_CHANNELS or ADMINISTRATOR).
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions } from "@/lib/permissions"

const VALID_THEMES = [
  "twilight", "midnight-neon", "synthwave", "carbon", "oled-black",
  "frost", "clarity", "velvet-dusk", "terminal", "sakura-blossom", "frosthearth",
]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
): Promise<NextResponse> {
  const { serverId } = await params

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Any member can read the recommended theme
    const { isMember } = await getMemberPermissions(supabase, serverId, user.id)
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: server } = await supabase
      .from("servers")
      .select("recommended_theme")
      .eq("id", serverId)
      .single()

    return NextResponse.json({
      recommended_theme: server?.recommended_theme ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
): Promise<NextResponse> {
  const { serverId } = await params

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { isAdmin } = await getMemberPermissions(supabase, serverId, user.id)
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json() as { recommended_theme?: string | null }
    const theme = body.recommended_theme

    if (theme !== null && theme !== undefined && theme !== "" && !VALID_THEMES.includes(theme)) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from("servers")
      .update({ recommended_theme: theme || null })
      .eq("id", serverId)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update theme" }, { status: 500 })
    }

    return NextResponse.json({ recommended_theme: theme || null })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
