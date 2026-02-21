import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const partnerId = searchParams.get("partnerId")

  if (!partnerId) {
    // Return all DM conversations (latest message per partner)
    const { data: sent } = await supabase
      .from("direct_messages")
      .select("receiver_id, created_at")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false })

    const { data: received } = await supabase
      .from("direct_messages")
      .select("sender_id, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })

    const partnerIds = new Set([
      ...(sent?.map((m) => m.receiver_id) ?? []),
      ...(received?.map((m) => m.sender_id) ?? []),
    ])

    if (partnerIds.size === 0) return NextResponse.json([])

    const { data: partners } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, status, status_message")
      .in("id", Array.from(partnerIds))

    return NextResponse.json(partners ?? [])
  }

  // Validate partnerId is a valid UUID to prevent PostgREST filter injection
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(partnerId)) {
    return NextResponse.json({ error: "Invalid partnerId" }, { status: 400 })
  }

  // Get messages with specific partner
  const { data: messages, error } = await supabase
    .from("direct_messages")
    .select("*")
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(messages ?? [])
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { receiverId, content } = await request.json()

  if (!receiverId || !content?.trim()) {
    return NextResponse.json({ error: "receiverId and content required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({ sender_id: user.id, receiver_id: receiverId, content: content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
