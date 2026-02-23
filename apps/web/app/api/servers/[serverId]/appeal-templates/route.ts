import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { aggregateMemberPermissions } from "@/lib/server-auth"

const BAN_MEMBERS = 16
const ADMINISTRATOR = 128

function canModerate(permissions: number) {
  return (permissions & BAN_MEMBERS) !== 0 || (permissions & ADMINISTRATOR) !== 0
}

async function requireModerator(serverId: string) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null, supabase }

  const { data: member } = await supabase
    .from("server_members")
    .select("member_roles(roles(permissions))")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  const permissions = aggregateMemberPermissions((member as any)?.member_roles)
  if (!canModerate(permissions)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), user: null, supabase }
  }

  return { error: null, user, supabase }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const auth = await requireModerator(serverId)
  if (auth.error) return auth.error

  const { data, error } = await (auth.supabase as any)
    .from("moderation_decision_templates")
    .select("id, title, body, decision, created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const auth = await requireModerator(serverId)
  if (auth.error || !auth.user) return auth.error!

  const { title, body, decision } = await req.json()
  if (!["approved", "denied", "closed"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
  }

  const serviceSupabase = await createServiceRoleClient()
  const { data, error } = await (serviceSupabase as any)
    .from("moderation_decision_templates")
    .insert({
      server_id: serverId,
      title,
      body,
      decision,
      created_by: auth.user.id,
    })
    .select("id, title, body, decision")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
