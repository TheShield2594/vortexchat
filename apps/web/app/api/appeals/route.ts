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

  const body = await req.json()
  const serverId = typeof body.serverId === "string" ? body.serverId : ""
  const statement = typeof body.statement === "string" ? body.statement.trim() : ""
  const evidenceAttachments = sanitizeEvidenceAttachments(body.evidenceAttachments)

  if (!serverId || statement.length < 20) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const rate = rateLimiter.check(`appeals:${user.id}:${serverId}`, { limit: 3, windowMs: 60 * 60 * 1000 })
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many submissions, please try later" }, { status: 429 })
  }

  const { data: ban } = await supabase
    .from("server_bans")
    .select("server_id, user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!ban) {
    return NextResponse.json({ error: "Appeal cannot be created" }, { status: 403 })
  }

  const { data: duplicate } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .select("id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .in("status", ["submitted", "reviewing"])
    .maybeSingle()

  if (duplicate) {
    return NextResponse.json({ error: "An active appeal already exists" }, { status: 409 })
  }

  const { count } = await (serviceSupabase as any)
    .from("moderation_appeals")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("user_id", user.id)

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
      ban_server_id: serverId,
      ban_user_id: user.id,
      appellant_statement: statement,
      evidence_attachments: evidenceAttachments,
      anti_abuse_score: antiAbuseScore,
      status: "submitted",
    })
    .select("id, status, submitted_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (serviceSupabase as any).from("moderation_appeal_status_events").insert({
    appeal_id: appeal.id,
    server_id: serverId,
    actor_id: user.id,
    previous_status: null,
    new_status: "submitted",
    metadata: { antiAbuseScore },
  })

  await serviceSupabase.from("audit_logs").insert({
    server_id: serverId,
    actor_id: user.id,
    action: "appeal_status_changed",
    target_id: appeal.id,
    target_type: "appeal",
    changes: { from: null, to: "submitted" },
  })

  await (serviceSupabase as any).from("notifications").insert([
    {
      user_id: user.id,
      type: "system",
      title: "Appeal submitted",
      body: "Your appeal has been submitted and is awaiting moderator review.",
      server_id: serverId,
    },
  ])

  return NextResponse.json({
    message: "Appeal submitted",
    trackingId: appeal.id,
    status: appeal.status,
  })
}
