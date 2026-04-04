/**
 * AI Router — resolves the correct provider adapter for a given server + function.
 *
 * Resolution order:
 *   1. Per-function routing (ai_function_routing table)
 *   2. Server default provider (ai_provider_configs.is_default = true)
 *   3. Legacy Gemini key (server_secrets.gemini_api_key) — backwards compat
 *
 * If none of these yield a provider, returns null so the caller can return
 * a friendly "AI not configured" message.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AiFunction, AiProvider, ResolvedAiProvider } from "@vortex/shared"
import { AI_PROVIDER_META } from "@vortex/shared"
import { createAdapter, type AiProviderAdapter } from "./providers"

interface ProviderConfigRow {
  id: string
  provider: AiProvider
  api_key: string | null
  base_url: string | null
  model: string | null
  is_default: boolean
}

interface FunctionRoutingRow {
  provider_config_id: string
}

/**
 * Resolve which AI provider to use for a given server + function.
 * Returns null when no provider is configured.
 */
export async function resolveProviderConfig(
  supabase: SupabaseClient,
  serverId: string,
  aiFunction: AiFunction
): Promise<ResolvedAiProvider | null> {
  try {
    // 1. Check per-function routing
    const { data: routing } = await supabase
      .from("ai_function_routing")
      .select("provider_config_id")
      .eq("server_id", serverId)
      .eq("ai_function", aiFunction)
      .maybeSingle<FunctionRoutingRow>()

    if (routing?.provider_config_id) {
      const config = await fetchProviderConfig(supabase, routing.provider_config_id)
      if (config) return config
    }

    // 2. Check server default provider
    const { data: defaultConfig } = await supabase
      .from("ai_provider_configs")
      .select("id, provider, api_key, base_url, model, is_default")
      .eq("server_id", serverId)
      .eq("is_default", true)
      .maybeSingle<ProviderConfigRow>()

    if (defaultConfig) {
      return configRowToResolved(defaultConfig)
    }

    // 3. Legacy fallback: server_secrets.gemini_api_key
    const { data: secrets } = await supabase
      .from("server_secrets")
      .select("gemini_api_key")
      .eq("server_id", serverId)
      .maybeSingle<{ gemini_api_key: string | null }>()

    if (secrets?.gemini_api_key) {
      return {
        provider: "gemini",
        apiKey: secrets.gemini_api_key,
        baseUrl: null,
        model: AI_PROVIDER_META.gemini.defaultModel,
      }
    }

    return null
  } catch (error) {
    console.error("[ai-router] resolveProviderConfig failed", { serverId, aiFunction, error })
    return null
  }
}

/**
 * Convenience: resolve + create the adapter in one call.
 * Returns null when no provider is configured for the server/function.
 */
export async function resolveAdapter(
  supabase: SupabaseClient,
  serverId: string,
  aiFunction: AiFunction
): Promise<AiProviderAdapter | null> {
  const config = await resolveProviderConfig(supabase, serverId, aiFunction)
  if (!config) return null

  try {
    return createAdapter(config)
  } catch (error) {
    console.error("[ai-router] createAdapter failed", { serverId, aiFunction, provider: config.provider, error })
    return null
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function fetchProviderConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<ResolvedAiProvider | null> {
  const { data } = await supabase
    .from("ai_provider_configs")
    .select("id, provider, api_key, base_url, model, is_default")
    .eq("id", configId)
    .maybeSingle<ProviderConfigRow>()

  if (!data) return null
  return configRowToResolved(data)
}

function configRowToResolved(row: ProviderConfigRow): ResolvedAiProvider {
  return {
    provider: row.provider,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    model: row.model ?? AI_PROVIDER_META[row.provider].defaultModel,
  }
}
