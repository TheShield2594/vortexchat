import { NextResponse } from "next/server"
import { requireAuth, parseJsonBody } from "@/lib/utils/api-helpers"

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  const { data: roles, error } = await supabase
    .from("roles")
    .select("*")
    .eq("server_id", params.serverId)
    .order("position", { ascending: false })

  if (error) return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 })

  return NextResponse.json(roles)
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ serverId: string }> }
) {
  const params = await paramsPromise
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: body, error: parseError } = await parseJsonBody<any>(request as any)
  if (parseError) return parseError

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

  if (error) return NextResponse.json({ error: "Failed to create role" }, { status: 500 })

  return NextResponse.json(role, { status: 201 })
}
