import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()

  const { data: server } = await supabase
    .from("servers")
    .select("id, name, icon_url, description")
    .eq("invite_code", params.code.toLowerCase())
    .single()

  if (!server) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
  }

  // Get member count
  const { count } = await supabase
    .from("server_members")
    .select("*", { count: "exact", head: true })
    .eq("server_id", server.id)

  return NextResponse.json({ ...server, member_count: count })
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: server } = await supabase
    .from("servers")
    .select("id, name")
    .eq("invite_code", params.code.toLowerCase())
    .single()

  if (!server) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
  }

  const { error } = await supabase
    .from("server_members")
    .insert({ server_id: server.id, user_id: user.id })

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ server_id: server.id, name: server.name })
}
