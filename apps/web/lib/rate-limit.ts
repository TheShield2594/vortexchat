/**
 * Rate limiter with Redis backend (Upstash) for multi-instance deployments.
 *
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, uses
 * Upstash's sliding window algorithm — safe across Vercel serverless replicas.
 *
 * Falls back to an in-memory sliding window when Redis is not configured
 * (local dev or single-instance deployments).
 *
 * Usage:
 *   const result = await rateLimiter.check(userId, { limit: 5, windowMs: 10_000 })
 *   if (!result.allowed) return 429
 */

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

// ─── Upstash Redis rate limiter ──────────────────────────────────────────────

// Lazily initialized singletons — the Upstash REST client is stateless,
// so a single instance is safe to share across all rate-limit checks.
let _redis: InstanceType<typeof import("@upstash/redis").Redis> | null = null
const _limiterCache = new Map<string, InstanceType<typeof import("@upstash/ratelimit").Ratelimit>>()
const _pendingLimiters = new Map<string, Promise<InstanceType<typeof import("@upstash/ratelimit").Ratelimit>>>()

async function getRedis(): Promise<InstanceType<typeof import("@upstash/redis").Redis>> {
  try {
    if (_redis) return _redis
    const { Redis } = await import("@upstash/redis")
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    return _redis
  } catch (err) {
    throw new Error(`Failed to initialize Upstash Redis client: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function getLimiter(opts: { limit: number; windowMs: number }): Promise<InstanceType<typeof import("@upstash/ratelimit").Ratelimit>> {
  const cacheKey = `${opts.limit}:${opts.windowMs}`
  const cached = _limiterCache.get(cacheKey)
  if (cached) return cached

  // Deduplicate concurrent initialization for the same key
  const pending = _pendingLimiters.get(cacheKey)
  if (pending) return pending

  const initPromise = (async () => {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit")
      const redis = await getRedis()
      const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowMs}ms`),
        prefix: "vortex:rl",
      })
      _limiterCache.set(cacheKey, limiter)
      return limiter
    } finally {
      _pendingLimiters.delete(cacheKey)
    }
  })()

  _pendingLimiters.set(cacheKey, initPromise)
  return initPromise
}

async function checkUpstash(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const limiter = await getLimiter(opts)
  const { success, remaining, reset } = await limiter.limit(key)
  return { allowed: success, remaining, resetAt: reset }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

interface WindowEntry {
  timestamps: number[]
}

class InMemoryRateLimiter {
  private windows = new Map<string, WindowEntry>()

  check(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
    const now = Date.now()
    const cutoff = now - opts.windowMs

    let entry = this.windows.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.windows.set(key, entry)
    }

    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

    const remaining = Math.max(0, opts.limit - entry.timestamps.length)
    const resetAt = entry.timestamps[0] ? entry.timestamps[0] + opts.windowMs : now + opts.windowMs

    if (entry.timestamps.length >= opts.limit) {
      return { allowed: false, remaining: 0, resetAt }
    }

    entry.timestamps.push(now)
    return { allowed: true, remaining: remaining - 1, resetAt }
  }

  cleanup(maxAgeMs = 60_000) {
    const cutoff = Date.now() - maxAgeMs
    this.windows.forEach((entry, key) => {
      if (entry.timestamps.every((t: number) => t < cutoff)) {
        this.windows.delete(key)
      }
    })
  }
}

const inMemory = new InMemoryRateLimiter()

if (typeof setInterval !== "undefined") {
  setInterval(() => inMemory.cleanup(), 5 * 60 * 1000)
}

// ─── Unified interface ───────────────────────────────────────────────────────

const useRedis =
  typeof process !== "undefined" &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

interface CheckOptions {
  limit: number
  windowMs: number
  /** When true, treat rate-limiter infrastructure failures as "blocked" instead of
   *  allowing the request through.  Use for auth endpoints where fail-open would
   *  let attackers bypass brute-force protection when Redis is down. */
  failClosed?: boolean
}

export const rateLimiter = {
  async check(key: string, opts: CheckOptions): Promise<RateLimitResult> {
    try {
      if (useRedis) {
        return await checkUpstash(key, opts)
      }
      return inMemory.check(key, opts)
    } catch (err) {
      if (opts.failClosed) {
        // Structured log import avoided here to prevent circular deps;
        // Sentry will also capture this via global error handling.
        console.error("[rate-limit] Infrastructure failure (fail-closed):", err instanceof Error ? err.message : String(err))
        return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }
      }
      throw err
    }
  },
}
