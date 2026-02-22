/**
 * Simple in-memory sliding window rate limiter.
 * For multi-instance deployments, replace with Redis (e.g. @upstash/ratelimit).
 *
 * Usage:
 *   const result = rateLimiter.check(userId, { limit: 5, windowMs: 10_000 })
 *   if (!result.allowed) return 429
 */

interface WindowEntry {
  timestamps: number[]
}

class RateLimiter {
  private windows = new Map<string, WindowEntry>()

  check(key: string, opts: { limit: number; windowMs: number }): {
    allowed: boolean
    remaining: number
    resetAt: number
  } {
    const now = Date.now()
    const cutoff = now - opts.windowMs

    let entry = this.windows.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.windows.set(key, entry)
    }

    // Evict expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

    const remaining = Math.max(0, opts.limit - entry.timestamps.length)
    const resetAt = entry.timestamps[0] ? entry.timestamps[0] + opts.windowMs : now + opts.windowMs

    if (entry.timestamps.length >= opts.limit) {
      return { allowed: false, remaining: 0, resetAt }
    }

    entry.timestamps.push(now)
    return { allowed: true, remaining: remaining - 1, resetAt }
  }

  // Periodically clean up stale keys (call from a setInterval if needed)
  cleanup(maxAgeMs = 60_000) {
    const cutoff = Date.now() - maxAgeMs
    this.windows.forEach((entry, key) => {
      if (entry.timestamps.every((t: number) => t < cutoff)) {
        this.windows.delete(key)
      }
    })
  }
}

// Singleton — shared across all requests in the same Node.js process
export const rateLimiter = new RateLimiter()

// Clean up every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000)
}
