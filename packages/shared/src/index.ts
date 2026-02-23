// Shared types for Vortex

export const PERMISSIONS = {
  // General
  VIEW_CHANNELS:             1 << 0,   // 1
  SEND_MESSAGES:             1 << 1,   // 2
  MANAGE_MESSAGES:           1 << 2,   // 4
  KICK_MEMBERS:              1 << 3,   // 8
  BAN_MEMBERS:               1 << 4,   // 16
  MANAGE_ROLES:              1 << 5,   // 32
  MANAGE_CHANNELS:           1 << 6,   // 64
  ADMINISTRATOR:             1 << 7,   // 128
  // Voice
  CONNECT_VOICE:             1 << 8,   // 256
  SPEAK:                     1 << 9,   // 512
  MUTE_MEMBERS:              1 << 10,  // 1024
  STREAM:                    1 << 11,  // 2048
  // Extended — Discord-level parity
  MANAGE_WEBHOOKS:           1 << 12,  // 4096
  MANAGE_EVENTS:             1 << 13,  // 8192
  MODERATE_MEMBERS:          1 << 14,  // 16384 — timeout users
  CREATE_PUBLIC_THREADS:     1 << 15,  // 32768
  CREATE_PRIVATE_THREADS:    1 << 16,  // 65536
  SEND_MESSAGES_IN_THREADS:  1 << 17,  // 131072
  USE_APPLICATION_COMMANDS:  1 << 18,  // 262144
  MENTION_EVERYONE:          1 << 19,  // 524288
} as const

export type Permission = keyof typeof PERMISSIONS

/** Return the effective combined permission bitmask from a list of role bitmasks. */
export function computePermissions(roleBitmasks: number[]): number {
  return roleBitmasks.reduce((acc, p) => acc | p, 0)
}

export function hasPermission(permissions: number, permission: Permission): boolean {
  if (permissions & PERMISSIONS.ADMINISTRATOR) return true
  return !!(permissions & PERMISSIONS[permission])
}

export function addPermission(permissions: number, permission: Permission): number {
  return permissions | PERMISSIONS[permission]
}

export function removePermission(permissions: number, permission: Permission): number {
  return permissions & ~PERMISSIONS[permission]
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'

export type ChannelType = 'text' | 'voice' | 'category' | 'forum' | 'stage' | 'announcement' | 'media'

export interface SignalingEvents {
  'join-room': { channelId: string; userId: string; displayName: string; avatarUrl?: string }
  'leave-room': { channelId: string }
  'offer': { to: string; offer: RTCSessionDescriptionInit }
  'answer': { to: string; answer: RTCSessionDescriptionInit }
  'ice-candidate': { to: string; candidate: RTCIceCandidateInit }
  'toggle-mute': { muted: boolean }
  'toggle-deafen': { deafened: boolean }
  'speaking': { speaking: boolean }
}

export interface SignalingServerEvents {
  'room-peers': Array<{ peerId: string; userId: string; displayName: string; avatarUrl?: string; muted: boolean }>
  'peer-joined': { peerId: string; userId: string; displayName: string; avatarUrl?: string }
  'peer-left': { peerId: string; userId: string }
  'offer': { from: string; offer: RTCSessionDescriptionInit }
  'answer': { from: string; answer: RTCSessionDescriptionInit }
  'ice-candidate': { from: string; candidate: RTCIceCandidateInit }
  'peer-muted': { peerId: string; muted: boolean }
  'peer-deafened': { peerId: string; deafened: boolean }
  'peer-speaking': { peerId: string; speaking: boolean }
}
