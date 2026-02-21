import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get("userId")
  if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", params.serverId)
    .eq("user_id", targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
