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
  try {
    const { serverId } = await params
    const { supabase, error } = await requireServerOwner(serverId)
    if (error) return error

    const { data: secrets } = await supabase
      .from("server_secrets")
      .select("gemini_api_key")
      .eq("server_id", serverId)
      .maybeSingle()

    return NextResponse.json({
      hasGeminiKey: !!secrets?.gemini_api_key,
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
  try {
    const { serverId } = await params
    const { supabase, error } = await requireServerOwner(serverId)
    if (error) return error

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (body === null || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const rawGeminiApiKey = (body as Record<string, unknown>).geminiApiKey
    if (rawGeminiApiKey === undefined) {
      return NextResponse.json({ error: "geminiApiKey is required" }, { status: 400 })
    }

    const geminiApiKey =
      rawGeminiApiKey === null
        ? null
        : typeof rawGeminiApiKey === "string"
          ? rawGeminiApiKey.trim()
          : undefined

    if (geminiApiKey === undefined) {
      return NextResponse.json({ error: "geminiApiKey must be a string or null" }, { status: 400 })
    }

    if (geminiApiKey === "") {
      return NextResponse.json({ error: "geminiApiKey cannot be empty" }, { status: 400 })
    }

    const { error: upsertError } = await supabase
      .from("server_secrets")
      .upsert(
        { server_id: serverId, gemini_api_key: geminiApiKey, updated_at: new Date().toISOString() },
        { onConflict: "server_id" }
      )

    if (upsertError) {
      console.error("[ai-settings PATCH] upsert error:", upsertError)
      return NextResponse.json({ error: "Failed to update AI settings" }, { status: 500 })
    }

    return NextResponse.json({
      hasGeminiKey: !!geminiApiKey,
    })
  } catch (err) {
    console.error("[ai-settings PATCH] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
