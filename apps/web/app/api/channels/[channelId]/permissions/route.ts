import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/channels/[channelId]/permissions — fetch all role overrides for a channel
export async function GET(
  _req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("channel_permissions")
    .select("*, role:roles(id, name, color)")
    .eq("channel_id", params.channelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT /api/channels/[channelId]/permissions — upsert a role override
// Body: { roleId, allowPermissions, denyPermissions }
export async function PUT(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { roleId, allowPermissions = 0, denyPermissions = 0 } = await req.json()
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

  const { error } = await supabase
    .from("channel_permissions")
    .upsert(
      {
        channel_id: params.channelId,
        role_id: roleId,
        allow_permissions: allowPermissions,
        deny_permissions: denyPermissions,
      },
      { onConflict: "channel_id,role_id" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/channels/[channelId]/permissions?roleId=... — remove a role override
export async function DELETE(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const roleId = searchParams.get("roleId")
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 })

  const { error } = await supabase
    .from("channel_permissions")
    .delete()
    .eq("channel_id", params.channelId)
    .eq("role_id", roleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
