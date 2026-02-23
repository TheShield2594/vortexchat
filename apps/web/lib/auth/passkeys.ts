import crypto from "node:crypto"

export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60

export function base64url(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer.toString("base64url")
}

export function randomChallenge() {
  return base64url(crypto.randomBytes(32))
}

export function tokenHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export function getRpId(origin?: string | null) {
  const fallback = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"
  const resolved = new URL(origin || fallback)
  return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || resolved.hostname
}

export function getOrigin() {
  return process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"
}

export type WebAuthnAdapterPayload = {
  challenge: string
  credentialId: string
  response: Record<string, unknown>
  expectedOrigin: string
  expectedRpId: string
  publicKey?: string
  prevCounter?: number
}

export type WebAuthnAdapterResult = {
  verified: boolean
  newCounter?: number
  publicKey?: string
  backedUp?: boolean
  deviceType?: string
}

/**
 * Secure adapter boundary:
 * - Prefer routing verification to a Supabase-compatible endpoint if configured.
 * - Fallback local adapter only validates challenge binding and payload shape in development.
 */
export async function verifyWithAdapter(
  mode: "registration" | "authentication",
  payload: WebAuthnAdapterPayload,
): Promise<WebAuthnAdapterResult> {
  const adapterUrl = process.env.SUPABASE_WEBAUTHN_VERIFY_URL

  if (adapterUrl) {
    const response = await fetch(adapterUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SUPABASE_WEBAUTHN_VERIFY_TOKEN
          ? { authorization: `Bearer ${process.env.SUPABASE_WEBAUTHN_VERIFY_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ mode, ...payload }),
      cache: "no-store",
    })

    if (!response.ok) {
      return { verified: false }
    }

    const data = (await response.json()) as WebAuthnAdapterResult
    return data
  }

  if (process.env.NODE_ENV === "production") {
    return { verified: false }
  }

  const looksValid = Boolean(
    payload.challenge && payload.credentialId && payload.response && payload.expectedOrigin && payload.expectedRpId,
  )

  if (!looksValid) return { verified: false }

  const pseudoCounter = (payload.prevCounter || 0) + 1
  return {
    verified: true,
    newCounter: pseudoCounter,
    publicKey: payload.publicKey || `dev:${payload.credentialId}`,
    backedUp: false,
    deviceType: "singleDevice",
  }
}


export function isChallengeValid(params: { expiresAt: string; usedAt?: string | null; now?: number }) {
  const now = params.now ?? Date.now()
  if (params.usedAt) return false
  return new Date(params.expiresAt).getTime() > now
}

export function isReplayDetected(prevCounter: number, nextCounter: number) {
  return nextCounter <= prevCounter
}
