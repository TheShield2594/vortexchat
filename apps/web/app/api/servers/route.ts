import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * POST /api/servers
 *
 * Creates a plain (non-template) server. Returns the created row directly
 * using the service-role client to avoid the PostgREST RLS timing issue
 * where INSERT RETURNING can't read back the row before the AFTER INSERT
 * trigger adds the owner to server_members.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: { name?: string; iconUrl?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (name.length > 100) {
      return NextResponse.json({ error: "name must be 100 characters or fewer" }, { status: 400 })
    }

    const iconUrl = typeof body.iconUrl === "string" ? body.iconUrl : null

    // Use the service-role client for insert+select to bypass the RLS timing
    // issue. The AFTER INSERT trigger on servers adds the owner to
    // server_members, but PostgREST's RETURNING clause runs before AFTER
    // triggers, so the SELECT RLS policy (which checks server_members) would
    // reject the row. Service-role bypasses RLS entirely.
    const serviceClient = await createServiceRoleClient()
    const { data: server, error: insertError } = await serviceClient
      .from("servers")
      .insert({
        name,
        owner_id: user.id,
        icon_url: iconUrl || undefined,
      })
      .select()
      .single()

    if (insertError) {
      console.error("Server creation failed:", { userId: user.id, error: insertError.message })
      return NextResponse.json({ error: "Failed to create server" }, { status: 500 })
    }

    return NextResponse.json({ server }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
