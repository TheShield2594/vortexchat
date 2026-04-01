import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/utils/api-helpers"

/**
 * GET /api/turn-credentials
 *
 * Returns time-limited TURN credentials generated via HMAC-based auth
 * (RFC 8489 long-term credentials with shared secret).
 *
 * Requires an authenticated user session. Credentials expire after 24 hours.
 */

const TURN_TTL_SECONDS = 24 * 60 * 60 // 24 hours

export async function GET(): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth()
    if (authError) return authError

    const turnUrl = process.env.TURN_URL
    const turnsUrl = process.env.TURNS_URL
    const turnSecret = process.env.TURN_SECRET

    if (!turnUrl || !turnSecret) {
      return NextResponse.json({ error: "TURN not configured" }, { status: 503 })
    }

    const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS
    // coturn ephemeral credential format: "<expiry>:<userId>"
    const username = `${expiry}:${user.id}`
    const credential = crypto
      .createHmac("sha1", turnSecret)
      .update(username)
      .digest("base64")

    const urls: string[] = [turnUrl]
    if (turnsUrl) urls.push(turnsUrl)

    return NextResponse.json({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls, username, credential },
      ],
      ttl: TURN_TTL_SECONDS,
    })
  } catch (err) {
    console.error("[turn-credentials GET] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
