import crypto from "node:crypto"
import { cookies } from "next/headers"

const STEP_UP_COOKIE = "vtx_step_up"
const STEP_UP_TTL_MS = 10 * 60 * 1000

function stepUpSecret() {
  return process.env.STEP_UP_SECRET || process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-step-up-secret"
}

function sign(payload: string) {
  return crypto.createHmac("sha256", stepUpSecret()).update(payload).digest("hex")
}

export async function issueStepUpToken(userId: string) {
  const issuedAt = Date.now()
  const payload = `${userId}:${issuedAt}`
  const signature = sign(payload)
  const cookieStore = await cookies()
  cookieStore.set(STEP_UP_COOKIE, `${payload}:${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(issuedAt + STEP_UP_TTL_MS),
    path: "/",
  })
}

export async function clearStepUpToken() {
  const cookieStore = await cookies()
  cookieStore.delete(STEP_UP_COOKIE)
}

export async function hasValidStepUpToken(userId: string) {
  const cookieStore = await cookies()
  const raw = cookieStore.get(STEP_UP_COOKIE)?.value
  if (!raw) return false

  const [cookieUserId, issuedAtRaw, signature] = raw.split(":")
  if (!cookieUserId || !issuedAtRaw || !signature) return false
  if (cookieUserId !== userId) return false

  const payload = `${cookieUserId}:${issuedAtRaw}`
  const expected = sign(payload)
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false

  const issuedAt = Number(issuedAtRaw)
  if (!Number.isFinite(issuedAt)) return false
  return Date.now() - issuedAt <= STEP_UP_TTL_MS
}

export const STEP_UP_WINDOW_SECONDS = STEP_UP_TTL_MS / 1000
