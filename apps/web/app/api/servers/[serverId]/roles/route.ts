import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: roles, error } = await supabase
    .from("roles")
    .select("*")
    .eq("server_id", serverId)
    .order("position", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(roles)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      server_id: serverId,
      name: body.name ?? "New Role",
      color: body.color ?? "#99aab5",
      permissions: body.permissions ?? 3,
      position: body.position ?? 0,
      is_hoisted: body.is_hoisted ?? false,
      mentionable: body.mentionable ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(role, { status: 201 })
}
