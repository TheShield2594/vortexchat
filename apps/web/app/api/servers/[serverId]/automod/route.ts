/**
 * GET  /api/servers/[serverId]/automod  – list all automod rules
 * POST /api/servers/[serverId]/automod  – create a new rule
 *
 * Server members may read rules; only owners may create/modify/delete.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { VALID_TRIGGER_TYPES, validateConfigAndActions } from "@/lib/automod"

type Params = { params: Promise<{ serverId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Must be a member to view rules
  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  const { data, error } = await supabase
    .from("automod_rules")
    .select("*")
    .eq("server_id", serverId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 })
  if (server.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let name: string, trigger_type: string, config: unknown, actions: unknown, enabled: unknown
  try {
    ;({ name, trigger_type, config, actions, enabled } = await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!(VALID_TRIGGER_TYPES as readonly string[]).includes(trigger_type))
    return NextResponse.json({ error: `trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(", ")}` }, { status: 400 })

  const validationError = validateConfigAndActions(trigger_type, config, actions)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const { data: rule, error } = await supabase
    .from("automod_rules")
    .insert({
      server_id: serverId,
      name: name.trim(),
      trigger_type,
      config: config as any,
      actions: actions as any,
      enabled: enabled ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit
  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "automod_rule_created",
    target_id: rule.id,
    target_type: "automod_rule",
    changes: { name: rule.name, trigger_type: rule.trigger_type },
  })

  return NextResponse.json(rule, { status: 201 })
}
