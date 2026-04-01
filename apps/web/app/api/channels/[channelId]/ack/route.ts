import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/utils/api-helpers"

/**
 * POST /api/channels/[channelId]/ack
 *
 * Acknowledge (mark as read) a channel up to a given message.
 * Updates the read_states row for the authenticated user, resetting
 * mention_count to zero. If no body is sent, marks as read at the
 * current time.
 *
 * Body (optional): { messageId?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
): Promise<NextResponse> {
  try {
    const { channelId } = await params
    const { supabase, user, error: authError } = await requireAuth()
    if (authError) return authError

    // Validate channelId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(channelId)) {
      return NextResponse.json({ error: "Invalid channel ID" }, { status: 400 })
    }

    // Optional body with messageId for acknowledging up to a specific message
    let lastReadAt = new Date().toISOString()
    try {
      const body = await req.json().catch(() => null)
      if (body && typeof body === "object" && typeof body.messageId === "string") {
        // Look up the message's created_at to use as the read position
        const { data: message, error: msgError } = await supabase
          .from("messages")
          .select("created_at")
          .eq("id", body.messageId)
          .eq("channel_id", channelId)
          .maybeSingle()

        if (msgError) {
          return NextResponse.json({ error: "Failed to look up message" }, { status: 500 })
        }
        if (message) {
          lastReadAt = message.created_at
        }
      }
    } catch {
      // No body or invalid JSON — use current time
    }

    // Upsert read state
    const { error: upsertError } = await supabase
      .from("read_states")
      .upsert(
        {
          user_id: user.id,
          channel_id: channelId,
          last_read_at: lastReadAt,
          mention_count: 0,
        },
        { onConflict: "user_id,channel_id" }
      )

    if (upsertError) {
      console.error("[ack] Failed to upsert read state:", {
        userId: user.id,
        channelId,
        error: upsertError.message,
      })
      return NextResponse.json({ error: "Failed to update read state" }, { status: 500 })
    }

    return NextResponse.json({ acknowledged: true, lastReadAt })
  } catch (err) {
    console.error("[ack] Unexpected error:", err instanceof Error ? err.message : "Unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
