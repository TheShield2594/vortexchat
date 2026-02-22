/**
 * GET    /api/servers/[serverId]/automod/[ruleId]  – get a single rule
 * PATCH  /api/servers/[serverId]/automod/[ruleId]  – update a rule
 * DELETE /api/servers/[serverId]/automod/[ruleId]  – delete a rule
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireServerOwner } from "@/lib/server-auth"
import { validateConfigAndActions } from "@/lib/automod"
import type { Json } from "@/types/database"

type Params = { params: Promise<{ serverId: string; ruleId: string }> }

async function requireOwnerWithRule(serverId: string, ruleId: string) {
  const { supabase, user, error } = await requireServerOwner(serverId)
  if (error) return { supabase, user, rule: null, error }

  const { data: rule } = await supabase
    .from("automod_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("server_id", serverId)
    .single()

  if (!rule)
    return { supabase, user, rule: null, error: NextResponse.json({ error: "Rule not found" }, { status: 404 }) }

  return { supabase, user, rule, error: null }
}

// GET uses a membership check (consistent with the list endpoint) so any
// server member can read an individual rule, not just the owner.
export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId, ruleId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  const { data: rule, error } = await supabase
    .from("automod_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("server_id", serverId)
    .single()

  if (error || !rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 })
  return NextResponse.json(rule)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { serverId, ruleId } = await params
  const { supabase, user, rule, error } = await requireOwnerWithRule(serverId, ruleId)
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const allowed = ["name", "config", "actions", "enabled"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Validate config and actions when either is being updated
  if ("config" in updates || "actions" in updates) {
    const newTriggerType = rule!.trigger_type as string
    const newConfig = "config" in updates ? updates.config : rule!.config
    const newActions = "actions" in updates ? updates.actions : rule!.actions

    if (newConfig === null || typeof newConfig !== "object" || Array.isArray(newConfig)) {
      return NextResponse.json({ error: "config must be a non-null object" }, { status: 400 })
    }
    if (!Array.isArray(newActions)) {
      return NextResponse.json({ error: "actions must be an array" }, { status: 400 })
    }

    const validationError = validateConfigAndActions(newTriggerType, newConfig, newActions)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
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
