import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

async function assertMembership(channelId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: membership } = await supabase
    .from("dm_channel_members")
    .select("user_id")
    .eq("dm_channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) return { supabase, user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, user, error: null }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params
  const { supabase, user, error } = await assertMembership(channelId)
  if (error || !user) return error!

  const [{ data: channel }, { data: memberRows }, { data: keyRows }] = await Promise.all([
    (supabase as any).from("dm_channels").select("is_encrypted, encryption_key_version, encryption_membership_epoch").eq("id", channelId).single(),
    supabase.from("dm_channel_members").select("user_id").eq("dm_channel_id", channelId),
    (supabase as any).from("dm_channel_keys")
      .select("key_version, target_user_id, target_device_id, wrapped_key, wrapped_by_user_id, wrapped_by_device_id, sender_public_key")
      .eq("dm_channel_id", channelId)
      .eq("target_user_id", user.id),
  ])

  const memberIds = (memberRows ?? []).map((m) => m.user_id)
  const { data: deviceRows } = memberIds.length
    ? await (supabase as any)
      .from("user_device_keys")
      .select("user_id, device_id, public_key")
      .in("user_id", memberIds)
    : { data: [] }

  return NextResponse.json({
    channel,
    memberDeviceKeys: deviceRows ?? [],
    wrappedKeys: keyRows ?? [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params
  const { supabase, user, error } = await assertMembership(channelId)
  if (error || !user) return error!

  const body = await req.json().catch(() => null)
  const keyVersion = Number.isInteger(body?.keyVersion) ? body.keyVersion : null
  const wrappedKeys = Array.isArray(body?.wrappedKeys) ? body.wrappedKeys : null

  if (!keyVersion || !wrappedKeys?.length) {
    return NextResponse.json({ error: "keyVersion and wrappedKeys[] required" }, { status: 400 })
  }

  const rows = wrappedKeys.map((entry: any) => ({
    dm_channel_id: channelId,
    key_version: keyVersion,
    target_user_id: entry.targetUserId,
    target_device_id: entry.targetDeviceId,
    wrapped_key: entry.wrappedKey,
    wrapped_by_user_id: user.id,
    wrapped_by_device_id: entry.wrappedByDeviceId,
    sender_public_key: entry.senderPublicKey,
  }))

  const { error: upsertError } = await (supabase as any)
    .from("dm_channel_keys")
    .upsert(rows)

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
