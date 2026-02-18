import { create } from "zustand"
import type { ServerRow, ChannelRow, UserRow } from "@/types/database"

interface AppState {
  // Current user
  currentUser: UserRow | null
  setCurrentUser: (user: UserRow | null) => void

  // Servers
  servers: ServerRow[]
  setServers: (servers: ServerRow[]) => void
  addServer: (server: ServerRow) => void
  updateServer: (id: string, updates: Partial<ServerRow>) => void
  removeServer: (id: string) => void

  // Channels
  channels: Record<string, ChannelRow[]> // serverId -> channels
  setChannels: (serverId: string, channels: ChannelRow[]) => void
  addChannel: (channel: ChannelRow) => void
  updateChannel: (id: string, updates: Partial<ChannelRow>) => void
  removeChannel: (id: string) => void

  // Active state
  activeServerId: string | null
  activeChannelId: string | null
  setActiveServer: (serverId: string | null) => void
  setActiveChannel: (channelId: string | null) => void

  // UI state
  memberListOpen: boolean
  toggleMemberList: () => void

  // Voice state
  voiceChannelId: string | null
  voiceServerId: string | null
  setVoiceChannel: (channelId: string | null, serverId: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  servers: [],
  setServers: (servers) => set({ servers }),
  addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),
  updateServer: (id, updates) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  removeServer: (id) =>
    set((state) => ({ servers: state.servers.filter((s) => s.id !== id) })),

  channels: {},
  setChannels: (serverId, channels) =>
    set((state) => ({ channels: { ...state.channels, [serverId]: channels } })),
  addChannel: (channel) =>
    set((state) => ({
      channels: {
        ...state.channels,
        [channel.server_id]: [
          ...(state.channels[channel.server_id] || []),
          channel,
        ],
      },
    })),
  updateChannel: (id, updates) =>
    set((state) => {
      const newChannels = { ...state.channels }
      for (const serverId in newChannels) {
        newChannels[serverId] = newChannels[serverId].map((c) =>
          c.id === id ? { ...c, ...updates } : c
        )
      }
      return { channels: newChannels }
    }),
  removeChannel: (id) =>
    set((state) => {
      const newChannels = { ...state.channels }
      for (const serverId in newChannels) {
        newChannels[serverId] = newChannels[serverId].filter((c) => c.id !== id)
      }
      return { channels: newChannels }
    }),

  activeServerId: null,
  activeChannelId: null,
  setActiveServer: (serverId) => set({ activeServerId: serverId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  memberListOpen: true,
  toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),

  voiceChannelId: null,
  voiceServerId: null,
  setVoiceChannel: (channelId, serverId) =>
    set({ voiceChannelId: channelId, voiceServerId: serverId }),
}))
