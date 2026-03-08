/**
 * Lightweight in-memory TTL cache for server-side data that rarely changes.
 * Runs in the Node.js process, persists across requests in production.
 *
 * Use for: automod rules, server settings, permissions, channel metadata.
 * Do NOT use for: rate limits, user-specific real-time state, nonce checks.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL_MS = 60_000 // 60 seconds

/** Get a cached value, or compute and cache it if missing/expired. */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now()
  const existing = store.get(key) as CacheEntry<T> | undefined

  if (existing && existing.expiresAt > now) {
    return existing.value
  }

  const value = await fetcher()
  store.set(key, { value, expiresAt: now + ttlMs })
  return value
}

/** Invalidate a specific cache key. */
export function invalidate(key: string): void {
  store.delete(key)
}

/** Invalidate all keys matching a prefix (e.g., "automod:serverId"). */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

// Periodic cleanup of expired entries (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key)
    }
  }, 5 * 60_000).unref?.()
}
