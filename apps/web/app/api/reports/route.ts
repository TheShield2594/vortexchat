import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"
import { REPORT_REASON_VALUES, type ReportReason } from "@/lib/report-reasons"

const VALID_REASONS = REPORT_REASON_VALUES

const VALID_STATUSES = ["pending", "reviewed", "resolved", "dismissed"] as const
type ReportStatus = (typeof VALID_STATUSES)[number]

// The reports table is defined in migration 00035_reports.sql but is not yet
// reflected in the generated Supabase types.  We cast through `any` for
// reports table access — the same pattern used elsewhere in the codebase for
// runtime types that differ from TS interfaces.

/**
 * POST /api/reports — submit a report
 *
 * Body: {
 *   reported_user_id: string
 *   reported_message_id?: string
 *   server_id?: string
 *   reason: "spam" | "harassment" | "inappropriate_content" | "other"
 *   description?: string (max 1000 chars)
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    reported_user_id?: string
    reported_message_id?: string
    server_id?: string
    reason?: string
    description?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { reported_user_id, reported_message_id, server_id, reason, description } = body

  if (!reported_user_id || typeof reported_user_id !== "string") {
    return NextResponse.json({ error: "reported_user_id is required" }, { status: 400 })
  }

  if (reported_user_id === user.id) {
    return NextResponse.json({ error: "You cannot report yourself" }, { status: 400 })
  }

  if (!reason || !VALID_REASONS.includes(reason as ReportReason)) {
    return NextResponse.json(
      { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    )
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      return NextResponse.json({ error: "description must be a string" }, { status: 400 })
    }
    if (description.length > 1000) {
      return NextResponse.json(
        { error: "description must not exceed 1000 characters" },
        { status: 400 }
      )
    }
  }

  // Validate server_id if provided — reporter must be a member
  if (server_id) {
    const { data: membership } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("server_id", server_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this server" }, { status: 403 })
    }
  }

  // Validate reported_message_id if provided
  if (reported_message_id) {
    const { data: message } = await supabase
      .from("messages")
      .select("id, author_id")
      .eq("id", reported_message_id)
      .maybeSingle()

    if (!message) {
      return NextResponse.json({ error: "Reported message not found" }, { status: 404 })
    }

    if (message.author_id !== reported_user_id) {
      return NextResponse.json({ error: "Reported user does not match message author" }, { status: 400 })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: report, error } = await (supabase as any)
    .from("reports")
    .insert({
      reporter_id: user.id,
      reported_user_id,
      reported_message_id: reported_message_id || null,
      server_id: server_id || null,
      reason,
      description: description?.trim() || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(report, { status: 201 })
}

/**
 * GET /api/reports?server_id=...&status=...
 *
 * Moderator view: requires MANAGE_MESSAGES or ADMINISTRATOR permission (or owner).
 * Without server_id, returns the caller's own reports.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const serverId = searchParams.get("server_id")
  const statusFilter = searchParams.get("status")

  if (serverId) {
    // Moderator view — requires permission
    const { isOwner, isAdmin, permissions } = await getMemberPermissions(
      supabase,
      serverId,
      user.id
    )

    if (!isOwner && !isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from("reports")
      .select(
        "*, reporter:users!reports_reporter_id_fkey(id, username, display_name, avatar_url), reported_user:users!reports_reported_user_id_fkey(id, username, display_name, avatar_url), reviewer:users!reports_reviewed_by_fkey(id, username, display_name)"
      )
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (statusFilter && VALID_STATUSES.includes(statusFilter as ReportStatus)) {
      query = query.eq("status", statusFilter)
    }

    const { data: reports, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(reports)
  }

  // No server_id — return caller's own reports
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reports, error } = await (supabase as any)
    .from("reports")
    .select("*")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(reports)
}

/**
 * PATCH /api/reports — update a report status (moderator action)
 *
 * Body: {
 *   report_id: string
 *   server_id: string
 *   status: "reviewed" | "resolved" | "dismissed"
 * }
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { report_id?: string; server_id?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { report_id, server_id, status } = body

  if (!report_id || !server_id || !status) {
    return NextResponse.json(
      { error: "report_id, server_id, and status are required" },
      { status: 400 }
    )
  }

  const validTransitions: ReportStatus[] = ["reviewed", "resolved", "dismissed"]
  if (!validTransitions.includes(status as ReportStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${validTransitions.join(", ")}` },
      { status: 400 }
    )
  }

  // Permission check
  const { isOwner, isAdmin, permissions } = await getMemberPermissions(
    supabase,
    server_id,
    user.id
  )

  if (!isOwner && !isAdmin && !hasPermission(permissions, "MANAGE_MESSAGES")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Fetch current status before updating for accurate audit trail
  const { data: existingReport } = await (supabase as any)
    .from("reports")
    .select("status")
    .eq("id", report_id)
    .eq("server_id", server_id)
    .single()

  const previousStatus = (existingReport as any)?.status ?? "pending"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: report, error } = await (supabase as any)
    .from("reports")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", report_id)
    .eq("server_id", server_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  // Audit log the moderator action on this report
  await supabase.from("audit_logs").insert({
    server_id,
    actor_id: user.id,
    action: `report_${status}`,
    target_id: (report as any).reported_user_id,
    target_type: "user",
    changes: {
      report_id,
      previous_status: previousStatus,
      new_status: status,
      reason: (report as any).reason,
    },
  })

  return NextResponse.json(report)
}
