/**
 * GET  /api/servers/[serverId]/moderation  – fetch moderation settings
 * PATCH /api/servers/[serverId]/moderation – update moderation settings
 *
 * Only the server owner may read or change these settings.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireServerOwner } from "@/lib/server-auth"
import type { Json } from "@/types/database"

type Params = { params: Promise<{ serverId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, error } = await requireServerOwner(serverId)
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
  const { supabase, user, error } = await requireServerOwner(serverId)
  if (error) return error

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  // Validate each field against its expected type and range before persisting.
  if ("verification_level" in body) {
    const v = body.verification_level
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 4) {
      return NextResponse.json({ error: "verification_level must be an integer 0–4" }, { status: 400 })
    }
    updates.verification_level = v
  }
  if ("explicit_content_filter" in body) {
    const v = body.explicit_content_filter
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 2) {
      return NextResponse.json({ error: "explicit_content_filter must be an integer 0–2" }, { status: 400 })
    }
    updates.explicit_content_filter = v
  }
  if ("default_message_notifications" in body) {
    const v = body.default_message_notifications
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 1) {
      return NextResponse.json({ error: "default_message_notifications must be an integer 0–1" }, { status: 400 })
    }
    updates.default_message_notifications = v
  }
  if ("screening_enabled" in body) {
    const v = body.screening_enabled
    if (typeof v !== "boolean") {
      return NextResponse.json({ error: "screening_enabled must be a boolean" }, { status: 400 })
    }
    updates.screening_enabled = v
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
