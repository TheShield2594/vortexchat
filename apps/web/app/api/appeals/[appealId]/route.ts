import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { aggregateMemberPermissions } from "@/lib/server-auth"
import { isValidAppealStatus, isValidAppealTransition } from "@/lib/appeals"

const BAN_MEMBERS = 16
const ADMINISTRATOR = 128

function canModerate(permissions: number) {
  return (permissions & BAN_MEMBERS) !== 0 || (permissions & ADMINISTRATOR) !== 0
}

async function getRequester() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appealId: string }> }
) {
  const { appealId } = await params
  const { supabase, user } = await getRequester()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: appeal, error } = await (supabase as any)
    .from("moderation_appeals")
    .select("*")
    .eq("id", appealId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!appeal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let isModerator = false
  if (appeal.user_id !== user.id) {
    const { data: member } = await supabase
      .from("server_members")
      .select("member_roles(roles(permissions))")
      .eq("server_id", appeal.server_id)
      .eq("user_id", user.id)
      .maybeSingle()

    const permissions = aggregateMemberPermissions((member as any)?.member_roles)
    isModerator = canModerate(permissions)

    if (!isModerator) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const serviceSupabase = await createServiceRoleClient()
  const notesPromise = isModerator
    ? (serviceSupabase as any)
        .from("moderation_appeal_internal_notes")
        .select("id, author_id, note, created_at")
        .eq("appeal_id", appealId)
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [] as any[] })

  const eventsPromise = (serviceSupabase as any)
    .from("moderation_appeal_status_events")
    .select("id, actor_id, previous_status, new_status, metadata, created_at")
    .eq("appeal_id", appealId)
    .order("created_at", { ascending: false })

  const [notesResult, eventsResult] = await Promise.all([notesPromise, eventsPromise])

  return NextResponse.json({
    appeal,
    internalNotes: notesResult.data ?? [],
    statusEvents: eventsResult.data ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appealId: string }> }
) {
  const { appealId } = await params
  const { supabase, user } = await getRequester()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const serviceSupabase = await createServiceRoleClient()
  const { data: appeal, error } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .select("id, server_id, user_id, status")
    .eq("id", appealId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!appeal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", appeal.server_id)
    .eq("user_id", user.id)
    .maybeSingle()

  const permissions = aggregateMemberPermissions((member as any)?.member_roles)
  if (!canModerate(permissions)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const nextStatus = body.status as string | undefined
  const assignReviewerId = body.assignReviewerId as string | undefined
  const internalNote = typeof body.internalNote === "string" ? body.internalNote.trim() : ""
  const decisionTemplateId = typeof body.decisionTemplateId === "string" ? body.decisionTemplateId : null
  const decisionReason = typeof body.decisionReason === "string" ? body.decisionReason : null

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (assignReviewerId) updatePayload.assigned_reviewer_id = assignReviewerId

  if (nextStatus) {
    if (!isValidAppealStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    if (!isValidAppealTransition(appeal.status, nextStatus)) {
      return NextResponse.json({ error: "Invalid state transition" }, { status: 409 })
    }

    updatePayload.status = nextStatus
    if (nextStatus === "closed") updatePayload.closed_at = new Date().toISOString()
    if (decisionTemplateId) updatePayload.decision_template_id = decisionTemplateId
    if (decisionReason) updatePayload.decision_reason = decisionReason
  }

  const { error: updateError } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .update(updatePayload)
    .eq("id", appealId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (internalNote) {
    await (serviceSupabase as any).from("moderation_appeal_internal_notes").insert({
      appeal_id: appealId,
      server_id: appeal.server_id,
      author_id: user.id,
      note: internalNote,
    })
  }

  if (nextStatus) {
    await (serviceSupabase as any).from("moderation_appeal_status_events").insert({
      appeal_id: appealId,
      server_id: appeal.server_id,
      actor_id: user.id,
      previous_status: appeal.status,
      new_status: nextStatus,
      metadata: {
        decisionTemplateId,
      },
    })

    await serviceSupabase.from("audit_logs").insert({
      server_id: appeal.server_id,
      actor_id: user.id,
      action: "appeal_status_changed",
      target_id: appealId,
      target_type: "appeal",
      changes: { from: appeal.status, to: nextStatus },
    })

    await (serviceSupabase as any).from("notifications").insert([
      {
        user_id: appeal.user_id,
        type: "system",
        title: "Appeal updated",
        body: `Your appeal status is now ${nextStatus}.`,
        server_id: appeal.server_id,
      },
      {
        user_id: user.id,
        type: "system",
        title: "Appeal status changed",
        body: `Appeal ${appealId} moved to ${nextStatus}.`,
        server_id: appeal.server_id,
      },
    ])
  }

  return NextResponse.json({ message: "Appeal updated" })
}
