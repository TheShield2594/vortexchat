import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: roles, error } = await supabase
    .from("roles")
    .select("*")
    .eq("server_id", params.serverId)
    .order("position", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(roles)
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      server_id: params.serverId,
      name: (body.name as string) ?? "New Role",
      color: (body.color as string) ?? "#99aab5",
      permissions: (body.permissions as number) ?? 3,
      position: (body.position as number) ?? 0,
      is_hoisted: (body.is_hoisted as boolean) ?? false,
      mentionable: (body.mentionable as boolean) ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(role, { status: 201 })
}
