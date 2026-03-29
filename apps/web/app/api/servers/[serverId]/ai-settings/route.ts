import { NextRequest, NextResponse } from "next/server"
import { requireServerOwner } from "@/lib/server-auth"

type Params = { params: Promise<{ serverId: string }> }

/**
 * GET /api/servers/{serverId}/ai-settings
 *
 * Returns whether a server-level Gemini API key is configured (not the key itself).
 * Owner only.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, error } = await requireServerOwner(serverId)
  if (error) return error

  try {
    const { data: server } = await supabase
      .from("servers")
      .select("gemini_api_key")
      .eq("id", serverId)
      .single()

    return NextResponse.json({
      hasGeminiKey: !!server?.gemini_api_key,
      hasInstanceKey: !!process.env.GEMINI_API_KEY,
    })
  } catch (err) {
    console.error("[ai-settings GET] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/servers/{serverId}/ai-settings
 *
 * Set or clear the server-level Gemini API key.
 * Owner only. Accepts { geminiApiKey: string | null }.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, error } = await requireServerOwner(serverId)
  if (error) return error

  let body: { geminiApiKey?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (body.geminiApiKey !== undefined && body.geminiApiKey !== null && typeof body.geminiApiKey !== "string") {
    return NextResponse.json({ error: "geminiApiKey must be a string or null" }, { status: 400 })
  }

  // Basic format validation — Gemini keys are non-empty strings
  if (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim().length === 0) {
    return NextResponse.json({ error: "geminiApiKey cannot be empty" }, { status: 400 })
  }

  try {
    const { error: updateError } = await supabase
      .from("servers")
      .update({ gemini_api_key: body.geminiApiKey ?? null })
      .eq("id", serverId)

    if (updateError) {
      console.error("[ai-settings PATCH] update error:", updateError)
      return NextResponse.json({ error: "Failed to update AI settings" }, { status: 500 })
    }

    return NextResponse.json({
      hasGeminiKey: !!body.geminiApiKey,
    })
  } catch (err) {
    console.error("[ai-settings PATCH] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
