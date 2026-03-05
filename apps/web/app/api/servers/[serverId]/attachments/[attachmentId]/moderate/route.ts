import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; attachmentId: string }> }
) {
  const { serverId, attachmentId } = await params
  const supabase = await createServerSupabaseClient()
  const serviceSupabase = await createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, user.id)
  if (!isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
    return NextResponse.json({ error: "Missing moderation permissions" }, { status: 403 })
  }

  let body: { action?: "release" | "delete"; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = body.action
  if (action !== "release" && action !== "delete") {
    return NextResponse.json({ error: "action must be release or delete" }, { status: 400 })
  }

  const { data: attachment, error: attachmentError } = await serviceSupabase
    .from("attachments")
    .select("id, message_id, scan_state, storage_path, filename")
    .eq("id", attachmentId)
    .maybeSingle()

  if (attachmentError) return NextResponse.json({ error: attachmentError.message }, { status: 500 })
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  if (action === "release") {
    const releasedAt = new Date().toISOString()
    const { error: releaseError } = await serviceSupabase
      .from("attachments")
      .update({
        scan_state: "clean",
        released_at: releasedAt,
        released_by: user.id,
        quarantined_reason: null,
      })
      .eq("id", attachmentId)

    if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 })

    await serviceSupabase.from("attachment_scan_metrics").insert({
      attachment_id: attachmentId,
      server_id: serverId,
      metric_key: "false_positive_override",
      metric_value: 1,
      metadata: { moderator_id: user.id, previous_state: attachment.scan_state, reason: body.reason ?? null },
    })

    await serviceSupabase.from("audit_logs").insert({
      server_id: serverId,
      actor_id: user.id,
      action: "attachment_quarantine_released",
      target_id: attachmentId,
      target_type: "attachment",
      changes: {
        reason: body.reason ?? null,
      },
    })

    return NextResponse.json({ ok: true, state: "clean" })
  }

  if (attachment.storage_path) {
    await serviceSupabase.storage.from("attachments").remove([attachment.storage_path]).catch(() => {})
  }

  const { error: deleteError } = await serviceSupabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  await serviceSupabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "attachment_quarantine_deleted",
    target_id: attachmentId,
    target_type: "attachment",
    changes: {
      filename: attachment.filename,
      reason: body.reason ?? null,
    },
  })

  return NextResponse.json({ ok: true, state: "deleted" })
}
