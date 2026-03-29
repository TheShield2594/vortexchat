"use client"

import { createClientSupabaseClient } from "@/lib/supabase/client"

/**
 * Wraps a fetch response check — if 401/403, attempts a session refresh.
 * If refresh fails, redirects to login with a toast-friendly query param.
 */
export async function handleAuthError(response: Response): Promise<Response> {
  if (response.status === 401 || response.status === 403) {
    const supabase = createClientSupabaseClient()
    const { error } = await supabase.auth.refreshSession()
    if (error) {
      // Session is truly expired — redirect to login
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
    return { limited: true, retryAfter: retryAfter ? parseInt(retryAfter, 10) : null }
  }
  return { limited: false, retryAfter: null }
}
