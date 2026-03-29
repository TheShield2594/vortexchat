/**
 * Shared API route helpers — eliminates the auth-check / JSON-parse / error-response
 * boilerplate duplicated across 100+ route handlers.
 *
 * Usage:
 *   import { requireAuth, parseJsonBody, apiError, dbError, insertAuditLog } from "@/lib/utils/api-helpers"
 */
import { NextResponse, type NextRequest } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { createLogger } from "@/lib/logger"

const log = createLogger("api-helpers")

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export type AuthResult = Awaited<ReturnType<typeof requireAuth>>

/**
 * Authenticate the current request.
 * Returns `{ supabase, user }` on success, or an early `NextResponse` on failure.
 *
 * Replace the 50+ copies of:
 *   const supabase = await createServerSupabaseClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
 */
export async function requireAuth() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError && !user) {
    const status = (authError as { status?: number }).status
    const code = (authError as { code?: string }).code
    const cause = (authError as { cause?: unknown }).cause

    const isNetworkError =
      (typeof status === "number" && (status === 502 || status === 503 || status === 504))
      || (typeof code === "string" && (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT"))
      || (cause instanceof TypeError)
      || /fetch failed|econnrefused|network/i.test(authError.message ?? "")

    if (isNetworkError) {
      return { supabase, user: null, error: apiError("Auth service temporarily unavailable", 502) } as const
    }
  }

  if (!user) {
    return { supabase, user: null, error: unauthorized() } as const
  }

  return { supabase, user, error: null } as const
}

/**
 * Same as `requireAuth` but also returns a service-role client for admin ops.
 */
export async function requireAuthWithServiceRole() {
  const result = await requireAuth()
  if (result.error) return { ...result, serviceSupabase: null } as const

  const serviceSupabase = await createServiceRoleClient()
  return { ...result, serviceSupabase } as const
}

// ---------------------------------------------------------------------------
// JSON body parsing
// ---------------------------------------------------------------------------

/**
 * Safely parse a request body as JSON.
 * Returns `{ data }` on success or `{ data: null, error: NextResponse }` on failure.
 *
 * Replace the 15+ copies of:
 *   let body: unknown
 *   try { body = await req.json() }
 *   catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }) }
 */
export async function parseJsonBody<T = unknown>(
  req: NextRequest
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const data = (await req.json()) as T
    return { data, error: null }
  } catch {
    return { data: null, error: apiError("Malformed JSON", 400) }
  }
}

// ---------------------------------------------------------------------------
// Standardised error responses
// ---------------------------------------------------------------------------

/** 401 Unauthorized */
export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 })
}

/** 403 Forbidden */
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 })
}

/** 404 Not Found */
export function notFound(entity = "Resource") {
  return NextResponse.json({ error: `${entity} not found` }, { status: 404 })
}

/** Generic API error response */
export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

/** Structured context for dbError logging */
export interface DbErrorContext {
  route?: string
  userId?: string
  action?: string
  detail?: string
}

/**
 * Convert a Supabase error into a 500 response.
 * Returns a generic message to avoid leaking DB schema details to clients.
 * The original error message is logged server-side for debugging.
 *
 * Replace the 50+ copies of:
 *   if (error) return NextResponse.json({ error: error.message }, { status: 500 })
 */
export function dbError(error: { message: string } | null, context?: string | DbErrorContext): NextResponse | null {
  if (!error) return null
  if (typeof context === "string") {
    log.error({ context, err: error.message }, "Database operation failed")
  } else if (context) {
    log.error({ ...context, err: error.message }, "Database operation failed")
  } else {
    log.error({ err: error.message }, "Database operation failed (no context)")
  }
  return NextResponse.json({ error: "Database operation failed" }, { status: 500 })
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  server_id: string
  actor_id: string
  action: string
  target_id?: string | null
  target_type?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changes?: Record<string, any> | null
}

/**
 * Insert an audit log row using the provided Supabase client.
 *
 * Replace the 15+ copies of:
 *   await supabase.from("audit_logs").insert({ server_id, actor_id, action, ... })
 */
export async function insertAuditLog(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  entry: AuditLogEntry
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from("audit_logs").insert(entry as any)
}
