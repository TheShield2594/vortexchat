import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("passkey_credentials")
    .select("id,name,created_at,last_used_at,device_type,backed_up,revoked_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ credentials: data })
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, name } = (await request.json()) as { id?: string; name?: string }
  if (!id || !name?.trim()) return NextResponse.json({ error: "id and name are required" }, { status: 400 })

  const { error } = await db
    .from("passkey_credentials")
    .update({ name: name.trim() })
    .eq("id", id)
    .eq("user_id", auth.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const db = supabase as any
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = (await request.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const { error } = await db
    .from("passkey_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
