import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Verify the requester is a member of this server
  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this server" }, { status: 403 })
  }

  const { data: members, error } = await supabase
    .from("server_members")
    .select(`
      *,
      user:users(*),
      roles:member_roles(role_id, roles(*))
    `)
    .eq("server_id", params.serverId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(members)
}

export async function DELETE(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get("userId")
  if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  // Allow self-removal (leaving a server) or require server ownership
  if (targetUserId !== user.id) {
    const { data: server } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", params.serverId)
      .single()

    if (!server || server.owner_id !== user.id) {
      return NextResponse.json({ error: "Only the server owner can remove members" }, { status: 403 })
    }

    // Prevent owner from removing themselves via this endpoint
    if (targetUserId === server.owner_id) {
      return NextResponse.json({ error: "Cannot remove the server owner" }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", params.serverId)
    .eq("user_id", targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
