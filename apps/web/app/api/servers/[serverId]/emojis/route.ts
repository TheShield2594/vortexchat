import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/servers/[serverId]/emojis — list server emojis
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("server_emojis")
    .select("id, name, image_url, created_at")
    .eq("server_id", serverId)
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/servers/[serverId]/emojis — upload a new emoji
// Body: FormData with "file" (image) and "name" (slug)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership
  const { data: member } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", serverId)
    .eq("user_id", user.id)
    .single()
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const name = (formData.get("name") as string | null)?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")

  if (!file || !name) return NextResponse.json({ error: "file and name required" }, { status: 400 })
  if (!["image/png", "image/webp", "image/gif"].includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, WebP, and GIF are allowed" }, { status: 415 })
  }
  if (file.size > 256 * 1024) return NextResponse.json({ error: "Emoji must be under 256 KB" }, { status: 413 })

  const ext = file.name.split(".").pop() ?? "png"
  const path = `${serverId}/${name}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from("server-emojis")
    .upload(path, arrayBuffer, { upsert: true, contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from("server-emojis").getPublicUrl(path)

  const { data: emoji, error: insertError } = await supabase
    .from("server_emojis")
    .upsert({ server_id: serverId, name, image_url: urlData.publicUrl, uploader_id: user.id }, { onConflict: "server_id,name" })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json(emoji, { status: 201 })
}

// DELETE /api/servers/[serverId]/emojis?emojiId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const emojiId = req.nextUrl.searchParams.get("emojiId")
  if (!emojiId) return NextResponse.json({ error: "emojiId required" }, { status: 400 })

  const { error } = await supabase
    .from("server_emojis")
    .delete()
    .eq("id", emojiId)
    .eq("server_id", serverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
