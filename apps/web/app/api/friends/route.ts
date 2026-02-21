import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// GET /api/friends
// Returns { accepted: FriendWithUser[], pending_received: FriendWithUser[], pending_sent: FriendWithUser[], blocked: FriendWithUser[] }
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch all friendships where the current user is involved
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      updated_at,
      requester:users!friendships_requester_id_fkey(*),
      addressee:users!friendships_addressee_id_fkey(*)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const accepted: any[] = []
  const pending_received: any[] = []
  const pending_sent: any[] = []
  const blocked: any[] = []

  for (const row of data ?? []) {
    const isRequester = row.requester_id === user.id
    const friend = isRequester ? row.addressee : row.requester
    const entry = { ...row, friend }

    if (row.status === "accepted") {
      accepted.push(entry)
    } else if (row.status === "pending") {
      if (isRequester) pending_sent.push(entry)
      else pending_received.push(entry)
    } else if (row.status === "blocked" && isRequester) {
      // Only show blocks the current user initiated
      blocked.push(entry)
    }
  }

  return NextResponse.json({ accepted, pending_received, pending_sent, blocked })
}

// POST /api/friends  { username: string }
// Send a friend request by username
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { username } = await req.json()
  if (!username?.trim()) return NextResponse.json({ error: "Username required" }, { status: 400 })

  // Find target user
  const { data: target, error: targetErr } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, status")
    .ilike("username", username.trim())
    .single()

  if (targetErr || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  if (target.id === user.id) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 })
  }

  // Check if friendship already exists in either direction
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status, requester_id")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`
    )
    .maybeSingle()

  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 })
    }
    if (existing.status === "pending") {
      if (existing.requester_id === target.id) {
        // They already sent us a request — auto-accept
        const { error: updateErr } = await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", existing.id)
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
        return NextResponse.json({ message: "Friend request accepted" })
      }
      return NextResponse.json({ error: "Friend request already sent" }, { status: 409 })
    }
    if (existing.status === "blocked") {
      return NextResponse.json({ error: "Cannot send request" }, { status: 403 })
    }
  }

  const { error: insertErr } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id: target.id, status: "pending" })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ message: "Friend request sent" }, { status: 201 })
}

// PATCH /api/friends  { friendshipId: string, action: "accept" | "decline" | "block" }
export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { friendshipId, action } = await req.json()
  if (!friendshipId || !action) {
    return NextResponse.json({ error: "friendshipId and action required" }, { status: 400 })
  }

  const { data: row, error: fetchErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isInvolved = row.requester_id === user.id || row.addressee_id === user.id
  if (!isInvolved) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (action === "accept") {
    if (row.addressee_id !== user.id || row.status !== "pending") {
      return NextResponse.json({ error: "Cannot accept this request" }, { status: 400 })
    }
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: "Friend request accepted" })
  }

  if (action === "decline") {
    if (row.addressee_id !== user.id || row.status !== "pending") {
      return NextResponse.json({ error: "Cannot decline this request" }, { status: 400 })
    }
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: "Friend request declined" })
  }

  if (action === "block") {
    // Blocker must be the current user — update requester_id/addressee_id so blocked is always addressee
    if (row.requester_id === user.id) {
      // Already requester, just flip status
      const { error } = await supabase
        .from("friendships")
        .update({ status: "blocked" })
        .eq("id", friendshipId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // addressee is blocking the requester — need to swap direction so current user is requester
      const { error } = await supabase
        .from("friendships")
        .update({ status: "blocked", requester_id: user.id, addressee_id: row.requester_id })
        .eq("id", friendshipId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ message: "User blocked" })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// DELETE /api/friends?id=<friendshipId>
// Unfriend or unblock
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const friendshipId = searchParams.get("id")
  if (!friendshipId) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: row } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("id", friendshipId)
    .single()

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isInvolved = row.requester_id === user.id || row.addressee_id === user.id
  if (!isInvolved) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message: "Removed" })
}
