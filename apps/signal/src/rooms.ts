export interface PeerInfo {
  socketId: string
  userId: string
  displayName?: string
  avatarUrl?: string
  muted: boolean
  deafened: boolean
  speaking: boolean
  screenSharing: boolean
  joinedAt: Date
}

/**
 * Async interface satisfied by both InMemoryRoomManager and RedisRoomManager.
 * index.ts always works against IRoomManager so it is backend-agnostic.
 */
export interface IRoomManager {
  join(channelId: string, info: PeerInfo): Promise<PeerInfo[]>
  leave(channelId: string, socketId: string): Promise<void>
  leaveAll(socketId: string): Promise<{ channelId: string; userId: string }[]>
  updatePeer(channelId: string, socketId: string, updates: Partial<PeerInfo>): Promise<void>
  getPeer(channelId: string, socketId: string): Promise<PeerInfo | undefined>
  getRoomPeers(channelId: string): Promise<PeerInfo[]>
  getRoomSize(channelId: string): Promise<number>
  getStats(): Promise<Record<string, number>>
}

/**
 * Pure in-memory implementation — used when REDIS_URL is not set.
 * Wraps the synchronous logic in Promises to satisfy IRoomManager without
 * introducing any I/O latency when Redis is not available.
 */
export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Map<string, PeerInfo>>()

  async join(channelId: string, info: PeerInfo): Promise<PeerInfo[]> {
    if (!this.rooms.has(channelId)) this.rooms.set(channelId, new Map())
    const room = this.rooms.get(channelId)!
    const existing = Array.from(room.values())
    room.set(info.socketId, info)
    return existing
  }

  async leave(channelId: string, socketId: string): Promise<void> {
    const room = this.rooms.get(channelId)
    if (room) {
      room.delete(socketId)
      if (room.size === 0) this.rooms.delete(channelId)
    }
  }

  async leaveAll(socketId: string): Promise<{ channelId: string; userId: string }[]> {
    const left: { channelId: string; userId: string }[] = []
    for (const [channelId, room] of this.rooms.entries()) {
      const peer = room.get(socketId)
      if (peer) {
        left.push({ channelId, userId: peer.userId })
        room.delete(socketId)
        if (room.size === 0) this.rooms.delete(channelId)
      }
    }
    return left
  }

  async updatePeer(channelId: string, socketId: string, updates: Partial<PeerInfo>): Promise<void> {
    const room = this.rooms.get(channelId)
    if (room) {
      const peer = room.get(socketId)
      if (peer) room.set(socketId, { ...peer, ...updates })
    }
  }

  async getPeer(channelId: string, socketId: string): Promise<PeerInfo | undefined> {
    return this.rooms.get(channelId)?.get(socketId)
  }

  async getRoomPeers(channelId: string): Promise<PeerInfo[]> {
    return Array.from(this.rooms.get(channelId)?.values() ?? [])
  }

  async getRoomSize(channelId: string): Promise<number> {
    return this.rooms.get(channelId)?.size ?? 0
  }

  async getStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {}
    for (const [channelId, room] of this.rooms.entries()) stats[channelId] = room.size
    return stats
  }
}

/**
 * Legacy synchronous class — kept so rooms.parity-check.ts compiles and runs
 * without modification.
 */
export class RoomManager {
  // channelId → Map<socketId, PeerInfo>
  private rooms = new Map<string, Map<string, PeerInfo>>()

  join(channelId: string, info: PeerInfo): PeerInfo[] {
    if (!this.rooms.has(channelId)) {
      this.rooms.set(channelId, new Map())
    }
    const room = this.rooms.get(channelId)!
    const existing = Array.from(room.values())
    room.set(info.socketId, info)
    return existing
  }

  leave(channelId: string, socketId: string): void {
    const room = this.rooms.get(channelId)
    if (room) {
      room.delete(socketId)
      if (room.size === 0) {
        this.rooms.delete(channelId)
      }
    }
  }

  leaveAll(socketId: string): { channelId: string; userId: string }[] {
    const left: { channelId: string; userId: string }[] = []
    for (const [channelId, room] of this.rooms.entries()) {
      const peer = room.get(socketId)
      if (peer) {
        left.push({ channelId, userId: peer.userId })
        room.delete(socketId)
        if (room.size === 0) this.rooms.delete(channelId)
      }
    }
    return left
  }

  updatePeer(channelId: string, socketId: string, updates: Partial<PeerInfo>): void {
    const room = this.rooms.get(channelId)
    if (room) {
      const peer = room.get(socketId)
      if (peer) room.set(socketId, { ...peer, ...updates })
    }
  }

  getPeer(channelId: string, socketId: string): PeerInfo | undefined {
    return this.rooms.get(channelId)?.get(socketId)
  }

  getRoomPeers(channelId: string): PeerInfo[] {
    return Array.from(this.rooms.get(channelId)?.values() ?? [])
  }

  getRoomSize(channelId: string): number {
    return this.rooms.get(channelId)?.size ?? 0
  }

  getStats() {
    const stats: Record<string, number> = {}
    for (const [channelId, room] of this.rooms.entries()) {
      stats[channelId] = room.size
    }
    return stats
  }
}
