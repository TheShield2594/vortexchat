/**
 * GET    /api/servers/[serverId]/screening  – get screening config
 * PUT    /api/servers/[serverId]/screening  – upsert screening config (owner only)
 * DELETE /api/servers/[serverId]/screening  – remove screening config (owner only)
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ serverId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Any server member can view the screening config (needed to show the rules on join)
  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  const { data, error } = await supabase
    .from("screening_configs")
    .select("*")
    .eq("server_id", serverId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also return whether the current user has already accepted
  const { data: accepted } = await supabase
    .from("member_screening")
    .select("accepted_at")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({ config: data, accepted: !!accepted, accepted_at: accepted?.accepted_at ?? null })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (server.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { title, description, rules_text, require_acceptance } = await req.json()

  const { data, error } = await supabase
    .from("screening_configs")
    .upsert(
      {
        server_id: serverId,
        title: title ?? "Server Rules",
        description: description ?? null,
        rules_text: rules_text ?? "",
        require_acceptance: require_acceptance ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "server_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (server.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await supabase.from("screening_configs").delete().eq("server_id", serverId)
  return NextResponse.json({ message: "Screening config removed" })
}
