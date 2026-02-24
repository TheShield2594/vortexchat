import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const id = searchParams.get("id")
  if (!type || !id) return NextResponse.json({ error: "type and id required" }, { status: 400 })

  if (type === "task") {
    const { data, error } = await supabase.from("channel_tasks").select("id, title, status, due_date, channel_id").eq("id", id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ reference: data })
  }

  if (type === "doc") {
    const { data, error } = await supabase.from("channel_docs").select("id, title, updated_at, channel_id").eq("id", id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ reference: data })
  }

  return NextResponse.json({ error: "unsupported type" }, { status: 400 })
}
