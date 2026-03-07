import Redis from "ioredis"
import type { PeerInfo, IRoomManager } from "./rooms"

/**
 * Redis-backed room manager.
 *
 * Key schema
 * ──────────
 *   vortex:room:{channelId}        Redis Hash  field=socketId  value=JSON(PeerInfo)
 *   vortex:socket:{socketId}       Redis Set   members=channelIds this socket joined
 *
 * Room state is therefore durable across process restarts and shared across
 * multiple signal-server replicas pointing at the same Redis instance.
 *
 * Note: after a restart all existing WebSocket connections are dropped and
 * clients must reconnect.  Stale socket entries left in Redis from the
 * previous process are cleaned up automatically when those sockets call
 * join-room or disconnect again, and are ignored by new peers (they won't
 * receive WebRTC offers because the old socket IDs no longer exist in
 * Socket.IO).  For a production deployment you may additionally set a TTL
 * on room keys via REDIS_ROOM_TTL_SECONDS if you want automatic eviction.
 */
export class RedisRoomManager implements IRoomManager {
  private readonly redis: Redis
  private readonly roomPrefix = "vortex:room"
  private readonly socketPrefix = "vortex:socket"

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })
  }

  private roomKey(channelId: string): string {
    return `${this.roomPrefix}:${channelId}`
  }

  private socketKey(socketId: string): string {
    return `${this.socketPrefix}:${socketId}`
  }

  private serialize(info: PeerInfo): string {
    return JSON.stringify({ ...info, joinedAt: info.joinedAt.toISOString() })
  }

  private deserialize(raw: string): PeerInfo {
    const parsed = JSON.parse(raw) as PeerInfo & { joinedAt: string }
    return { ...parsed, joinedAt: new Date(parsed.joinedAt) }
  }

  async join(channelId: string, info: PeerInfo): Promise<PeerInfo[]> {
    const rKey = this.roomKey(channelId)
    const sKey = this.socketKey(info.socketId)

    // Fetch existing peers before adding the new one
    const existing = await this.getRoomPeers(channelId)

    // Persist peer into the room hash and record the socket→channel mapping
    await Promise.all([
      this.redis.hset(rKey, info.socketId, this.serialize(info)),
      this.redis.sadd(sKey, channelId),
    ])

    return existing
  }

  async leave(channelId: string, socketId: string): Promise<void> {
    const rKey = this.roomKey(channelId)
    const sKey = this.socketKey(socketId)

    await Promise.all([
      this.redis.hdel(rKey, socketId),
      this.redis.srem(sKey, channelId),
    ])

    // Clean up the room key when empty
    const remaining = await this.redis.hlen(rKey)
    if (remaining === 0) await this.redis.del(rKey)
  }

  async leaveAll(socketId: string): Promise<{ channelId: string; userId: string }[]> {
    const sKey = this.socketKey(socketId)
    const channelIds = await this.redis.smembers(sKey)

    const left: { channelId: string; userId: string }[] = []

    await Promise.all(
      channelIds.map(async (channelId) => {
        const rKey = this.roomKey(channelId)
        const raw = await this.redis.hget(rKey, socketId)
        if (raw) {
          const peer = this.deserialize(raw)
          left.push({ channelId, userId: peer.userId })
          await this.redis.hdel(rKey, socketId)
          const remaining = await this.redis.hlen(rKey)
          if (remaining === 0) await this.redis.del(rKey)
        }
      })
    )

    await this.redis.del(sKey)
    return left
  }

  async updatePeer(channelId: string, socketId: string, updates: Partial<PeerInfo>): Promise<void> {
    const rKey = this.roomKey(channelId)
    const raw = await this.redis.hget(rKey, socketId)
    if (!raw) return
    const peer = this.deserialize(raw)
    await this.redis.hset(rKey, socketId, this.serialize({ ...peer, ...updates }))
  }

  async getPeer(channelId: string, socketId: string): Promise<PeerInfo | undefined> {
    const raw = await this.redis.hget(this.roomKey(channelId), socketId)
    return raw ? this.deserialize(raw) : undefined
  }

  async getRoomPeers(channelId: string): Promise<PeerInfo[]> {
    const hash = await this.redis.hgetall(this.roomKey(channelId))
    return Object.values(hash ?? {}).map((v) => this.deserialize(v))
  }

  async getRoomSize(channelId: string): Promise<number> {
    return this.redis.hlen(this.roomKey(channelId))
  }

  async getStats(): Promise<Record<string, number>> {
    const keys = await this.redis.keys(`${this.roomPrefix}:*`)
    const stats: Record<string, number> = {}
    await Promise.all(
      keys.map(async (key) => {
        const channelId = key.slice(this.roomPrefix.length + 1)
        stats[channelId] = await this.redis.hlen(key)
      })
    )
    return stats
  }
}
