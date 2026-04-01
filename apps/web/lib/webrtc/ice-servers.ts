/**
 * Fetch ephemeral TURN credentials from the server-side endpoint.
 * Falls back to STUN-only if the endpoint is unavailable.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

let cachedServers: RTCIceServer[] | null = null
let cacheExpiresAt = 0

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  // Return cached credentials if still valid (refresh 5 min before expiry)
  if (cachedServers && Date.now() < cacheExpiresAt) {
    return cachedServers
  }

  try {
    const res = await fetch("/api/turn-credentials")
    if (!res.ok) {
      console.warn("[ice-servers] TURN credentials unavailable, using STUN only")
      return STUN_SERVERS
    }

    const data: { iceServers: RTCIceServer[]; ttl: number } = await res.json()
    cachedServers = data.iceServers
    // Refresh 5 minutes before TTL expires
    cacheExpiresAt = Date.now() + (data.ttl - 300) * 1000
    return cachedServers
  } catch (err) {
    console.warn("[ice-servers] Failed to fetch TURN credentials:", err)
    return STUN_SERVERS
  }
}
