/**
 * GET  /api/servers/[serverId]/moderation  – fetch moderation settings
 * PATCH /api/servers/[serverId]/moderation – update moderation settings
 *
 * Only the server owner may read or change these settings.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

type Params = { params: Promise<{ serverId: string }> }

async function requireOwner(serverId: string) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .single()

  if (!server) return { supabase, user, error: NextResponse.json({ error: "Server not found" }, { status: 404 }) }
  if (server.owner_id !== user.id)
    return { supabase, user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  return { supabase, user, error: null }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, error } = await requireOwner(serverId)
  if (error) return error

  const { data, error: dbErr } = await supabase
    .from("servers")
    .select("verification_level, explicit_content_filter, default_message_notifications, screening_enabled")
    .eq("id", serverId)
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, user, error } = await requireOwner(serverId)
  if (error) return error

  const body = await req.json()
  const allowed = ["verification_level", "explicit_content_filter", "default_message_notifications", "screening_enabled"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

  const { error: dbErr } = await supabase.from("servers").update(updates).eq("id", serverId)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Audit log
  await supabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user!.id,
    action: "moderation_settings_updated",
    target_id: serverId,
    target_type: "server",
    changes: updates as unknown as Json,
  })

  return NextResponse.json({ message: "Moderation settings updated" })
}
