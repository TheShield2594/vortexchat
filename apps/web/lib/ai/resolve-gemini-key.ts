import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolve the Gemini API key for a server.
 * Each server owner provides their own key via server settings.
 * Returns null when no key is configured.
 */
export async function resolveGeminiApiKey(
  supabase: SupabaseClient,
  serverId: string
): Promise<string | null> {
  const { data: server } = await supabase
    .from("servers")
    .select("gemini_api_key")
    .eq("id", serverId)
    .single()

  return server?.gemini_api_key ?? null
}
