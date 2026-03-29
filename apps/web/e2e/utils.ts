/**
 * Shared E2E test utilities.
 */

/** True when a real (non-placeholder) Supabase backend is available. */
export const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
