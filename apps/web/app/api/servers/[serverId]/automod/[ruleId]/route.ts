/**
 * GET    /api/servers/[serverId]/automod/[ruleId]  – get a single rule
 * PATCH  /api/servers/[serverId]/automod/[ruleId]  – update a rule
 * DELETE /api/servers/[serverId]/automod/[ruleId]  – delete a rule
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

type Params = { params: Promise<{ serverId: string; ruleId: string }> }

async function requireOwnerWithRule(serverId: string, ruleId: string) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, rule: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).single()
  if (!server) return { supabase, user, rule: null, error: NextResponse.json({ error: "Server not found" }, { status: 404 }) }
  if (server.owner_id !== user.id)
    return { supabase, user, rule: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  const { data: rule } = await supabase
    .from("automod_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("server_id", serverId)
    .single()

  if (!rule) return { supabase, user, rule: null, error: NextResponse.json({ error: "Rule not found" }, { status: 404 }) }

  return { supabase, user, rule, error: null }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId, ruleId } = await params
  const { rule, error } = await requireOwnerWithRule(serverId, ruleId)
  if (error) return error
  return NextResponse.json(rule)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { serverId, ruleId } = await params
  const { supabase, user, rule, error } = await requireOwnerWithRule(serverId, ruleId)
  if (error) return error

  const body = await req.json()
  const allowed = ["name", "config", "actions", "enabled"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  updates.updated_at = new Date().toISOString()

  const { data: updated, error: dbErr } = await supabase
    .from("automod_rules")
    .update(updates)
    .eq("id", ruleId)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user!.id,
    action: "automod_rule_updated",
    target_id: ruleId,
    target_type: "automod_rule",
    changes: updates as unknown as Json,
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { serverId, ruleId } = await params
  const { supabase, user, rule, error } = await requireOwnerWithRule(serverId, ruleId)
  if (error) return error

  const { error: dbErr } = await supabase.from("automod_rules").delete().eq("id", ruleId)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user!.id,
    action: "automod_rule_deleted",
    target_id: ruleId,
    target_type: "automod_rule",
    changes: { name: rule!.name },
  })

  return NextResponse.json({ message: "Rule deleted" })
}
