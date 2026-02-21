import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let code = ""
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  for (const byte of arr) code += chars[byte % chars.length]
  return code
}

// GET /api/servers/[serverId]/invites — list all invites
export async function GET(
  _req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: invites, error } = await supabase
    .from("invites")
    .select("*, creator:users!invites_created_by_fkey(id, username, display_name, avatar_url)")
    .eq("server_id", params.serverId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(invites)
}

// POST /api/servers/[serverId]/invites — create invite
export async function POST(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Check member
  const { data: member } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .single()

  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { maxUses, expiresIn, temporary } = body
  // expiresIn in hours (null = never)

  let code: string
  let attempts = 0
  do {
    code = generateCode()
    attempts++
    if (attempts > 10) return NextResponse.json({ error: "Could not generate unique code" }, { status: 500 })
    const { data: existing } = await supabase.from("invites").select("code").eq("code", code).single()
    if (!existing) break
  } while (true)

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 3600 * 1000).toISOString() : null

  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      code,
      server_id: params.serverId,
      created_by: user.id,
      max_uses: maxUses ?? null,
      expires_at: expiresAt,
      temporary: temporary ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(invite, { status: 201 })
}

// DELETE /api/servers/[serverId]/invites?code= — revoke invite
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 })

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", params.serverId)
    .single()

  const { data: invite } = await supabase
    .from("invites")
    .select("created_by")
    .eq("code", code)
    .single()

  const isOwner = server?.owner_id === user.id
  const isCreator = invite?.created_by === user.id

  if (!isOwner && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase.from("invites").delete().eq("code", code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: "Invite revoked" })
}
