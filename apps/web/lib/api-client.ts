"use client"

import { createClientSupabaseClient } from "@/lib/supabase/client"

/**
 * Wraps a fetch response check — if 401/403, attempts a session refresh.
 * If refresh fails, redirects to login with a toast-friendly query param.
 */
export async function handleAuthError(response: Response): Promise<Response> {
  if (response.status === 401) {
    try {
      const supabase = createClientSupabaseClient()
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        // Session is truly expired — redirect to login
        if (typeof window !== "undefined") {
          window.location.href = "/login?expired=true"
        }
      }
    } catch {
      // refreshSession threw — treat as expired
      if (typeof window !== "undefined") {
        window.location.href = "/login?expired=true"
      }
    }
  }
  return response
}

/**
 * Checks if a response is rate-limited and returns retry info.
 */
export function isRateLimited(response: Response): { limited: boolean; retryAfter: number | null } {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After")
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10)
      if (!Number.isNaN(parsed)) {
        return { limited: true, retryAfter: parsed }
      }
      const dateMs = Date.parse(retryAfter)
      if (!Number.isNaN(dateMs)) {
        return { limited: true, retryAfter: Math.max(0, Math.ceil((dateMs - Date.now()) / 1000)) }
      }
    }
    return { limited: true, retryAfter: null }
  }
  return { limited: false, retryAfter: null }
}
