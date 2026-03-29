import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolve the Gemini API key for a server.
 * Priority: server-level key → instance-level env var → null.
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

  if (server?.gemini_api_key) {
    return server.gemini_api_key
  }

  return process.env.GEMINI_API_KEY ?? null
}
