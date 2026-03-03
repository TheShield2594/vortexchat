import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { rateLimiter } from "@/lib/rate-limit"
import { computeAntiAbuseScore, sanitizeEvidenceAttachments } from "@/lib/appeals"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await (supabase as any)
    .from("moderation_appeals")
    .select("id, server_id, status, submitted_at, updated_at, assigned_reviewer_id")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const serviceSupabase = await createServiceRoleClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 })
  }

  const body = payload as { serverId?: unknown; statement?: unknown; evidenceAttachments?: unknown }
  const serverId = typeof body.serverId === "string" ? body.serverId : ""
  const statement = typeof body.statement === "string" ? body.statement.trim() : ""

  if (!serverId || statement.length < 20 || statement.length > 4000) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const evidenceAttachments = sanitizeEvidenceAttachments(body.evidenceAttachments)

  const rate = await rateLimiter.check(`appeals:${user.id}:${serverId}`, { limit: 3, windowMs: 60 * 60 * 1000 })
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many submissions, please try later" }, { status: 429 })
  }

  const { data: ban, error: banError } = await serviceSupabase
    .from("server_bans")
    .select("server_id, user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (banError) return NextResponse.json({ error: banError.message }, { status: 500 })
  if (!ban) {
    return NextResponse.json({ error: "Appeal cannot be created" }, { status: 403 })
  }

  const { data: duplicate, error: duplicateError } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .select("id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .in("status", ["submitted", "reviewing"])
    .maybeSingle()

  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicate) {
    return NextResponse.json({ error: "An active appeal already exists" }, { status: 409 })
  }

  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .gte("submitted_at", thirtyDaysAgoIso)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  const antiAbuseScore = computeAntiAbuseScore({
    statement,
    evidenceAttachments,
    recentAppealCount: count ?? 0,
  })

  const { data: appeal, error } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .insert({
      server_id: serverId,
      user_id: user.id,
      appellant_statement: statement,
      evidence_attachments: evidenceAttachments,
      anti_abuse_score: antiAbuseScore,
      status: "submitted",
    })
    .select("id, status, submitted_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: eventError } = await (serviceSupabase as any).from("moderation_appeal_status_events").insert({
    appeal_id: appeal.id,
    server_id: serverId,
    actor_id: user.id,
    previous_status: null,
    new_status: "submitted",
    metadata: { antiAbuseScore },
  })

  if (eventError) {
    console.warn("Failed appeal status event insert", { appealId: appeal.id, moderatorId: user.id, action: "create", error: eventError })
    await (serviceSupabase as any).from("moderation_appeals").delete().eq("id", appeal.id)
    return NextResponse.json({ error: "Failed to create appeal status event" }, { status: 500 })
  }

  const { error: auditError } = await serviceSupabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "appeal_status_changed",
    target_id: appeal.id,
    target_type: "appeal",
    changes: { from: null, to: "submitted" },
  })

  if (auditError) {
    console.warn("Failed appeal audit log insert", { appealId: appeal.id, moderatorId: user.id, action: "create", error: auditError })
    await (serviceSupabase as any).from("moderation_appeal_status_events").delete().eq("appeal_id", appeal.id)
    await (serviceSupabase as any).from("moderation_appeals").delete().eq("id", appeal.id)
    return NextResponse.json({ error: "Failed to write appeal audit log" }, { status: 500 })
  }

  const { error: notificationError } = await (serviceSupabase as any).from("notifications").insert([
    {
      user_id: user.id,
      type: "system",
      title: "Appeal submitted",
      body: "Your appeal has been submitted and is awaiting moderator review.",
      server_id: serverId,
    },
  ])

  if (notificationError) {
    console.warn("Failed appeal notification insert", { appealId: appeal.id, moderatorId: user.id, action: "create", error: notificationError })
    return NextResponse.json({ error: "Failed to create appeal notification" }, { status: 500 })
  }

  return NextResponse.json({
    message: "Appeal submitted",
    trackingId: appeal.id,
    status: appeal.status,
  })
}
