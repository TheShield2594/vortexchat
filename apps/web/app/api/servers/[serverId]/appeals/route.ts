import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { aggregateMemberPermissions } from "@/lib/server-auth"

const BAN_MEMBERS = 16
const ADMINISTRATOR = 128

function canModerate(permissions: number) {
  return (permissions & BAN_MEMBERS) !== 0 || (permissions & ADMINISTRATOR) !== 0
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  const permissions = aggregateMemberPermissions((member as any)?.member_roles)
  if (!canModerate(permissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const status = new URL(req.url).searchParams.get("status")
  const statuses = ["submitted", "reviewing", "approved", "denied", "closed"]
  const query = (supabase as any)
    .from("moderation_appeals")
    .select("id, user_id, status, submitted_at, assigned_reviewer_id, anti_abuse_score")
    .eq("server_id", serverId)
    .order("submitted_at", { ascending: true })

  if (status && statuses.includes(status)) query.eq("status", status)
  else query.in("status", ["submitted", "reviewing"])

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
