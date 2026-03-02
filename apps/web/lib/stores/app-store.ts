import { create } from "zustand"
import type { ServerRow, ChannelRow, UserRow } from "@/types/database"

const MEMBER_LIST_STORAGE_KEY = "vortexchat:ui:member-list-open"
const THREAD_PANEL_STORAGE_KEY = "vortexchat:ui:thread-panel-open"
const WORKSPACE_PANEL_STORAGE_KEY = "vortexchat:ui:workspace-panel-open"

function loadMemberListOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    const stored = window.localStorage.getItem(MEMBER_LIST_STORAGE_KEY)
    return stored == null ? true : stored === "true"
  } catch {
    return true
  }
}

function persistMemberListOpen(open: boolean) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MEMBER_LIST_STORAGE_KEY, String(open))
  } catch {
    // Best effort only. Ignore storage failures (private mode / restricted environments).
  }
}

function loadBooleanStorage(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored == null ? fallback : stored === "true"
  } catch {
    return fallback
  }
}

function persistBooleanStorage(key: string, value: boolean) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Best effort only. Ignore storage failures (private mode / restricted environments).
  }
}

export interface MemberForMention {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  nickname: string | null
}

interface AppState {
  // Current user
  currentUser: UserRow | null
  setCurrentUser: (user: UserRow | null) => void

  // Servers
  servers: ServerRow[]
  isLoadingServers: boolean
  setIsLoadingServers: (isLoading: boolean) => void
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

  // Members (for mention autocomplete)
  members: Record<string, MemberForMention[]> // serverId -> members
  setMembers: (serverId: string, members: MemberForMention[]) => void

  // Active state
  activeServerId: string | null
  activeChannelId: string | null
  setActiveServer: (serverId: string | null) => void
  setActiveChannel: (channelId: string | null) => void

  // UI state
  memberListOpen: boolean
  toggleMemberList: () => void
  threadPanelOpen: boolean
  toggleThreadPanel: () => void
  setThreadPanelOpen: (open: boolean) => void
  workspaceOpen: boolean
  toggleWorkspacePanel: () => void
  setWorkspaceOpen: (open: boolean) => void

  // Per-server unread indicator (true = at least one unread channel in this server)
  serverHasUnread: Record<string, boolean>
  setServerHasUnread: (serverId: string, hasUnread: boolean) => void

  // Voice state
  voiceChannelId: string | null
  voiceServerId: string | null
  setVoiceChannel: (channelId: string | null, serverId: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  servers: [],
  isLoadingServers: true,
  setIsLoadingServers: (isLoadingServers) => set({ isLoadingServers }),
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
    set((state) => {
      const existing = state.channels[channel.server_id] || []
      if (existing.some((c) => c.id === channel.id)) return state
      return {
        channels: {
          ...state.channels,
          [channel.server_id]: [...existing, channel],
        },
      }
    }),
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

  members: {},
  setMembers: (serverId, members) =>
    set((state) => ({ members: { ...state.members, [serverId]: members } })),

  activeServerId: null,
  activeChannelId: null,
  setActiveServer: (serverId) => set({ activeServerId: serverId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  memberListOpen: loadMemberListOpen(),
  toggleMemberList: () => set((state) => {
    const next = !state.memberListOpen
    persistMemberListOpen(next)
    return { memberListOpen: next }
  }),
  threadPanelOpen: loadBooleanStorage(THREAD_PANEL_STORAGE_KEY, true),
  toggleThreadPanel: () => set((state) => {
    const next = !state.threadPanelOpen
    persistBooleanStorage(THREAD_PANEL_STORAGE_KEY, next)
    return { threadPanelOpen: next }
  }),
  setThreadPanelOpen: (open) => set(() => {
    persistBooleanStorage(THREAD_PANEL_STORAGE_KEY, open)
    return { threadPanelOpen: open }
  }),
  workspaceOpen: loadBooleanStorage(WORKSPACE_PANEL_STORAGE_KEY, false),
  toggleWorkspacePanel: () => set((state) => {
    const next = !state.workspaceOpen
    persistBooleanStorage(WORKSPACE_PANEL_STORAGE_KEY, next)
    return { workspaceOpen: next }
  }),
  setWorkspaceOpen: (open) => set(() => {
    persistBooleanStorage(WORKSPACE_PANEL_STORAGE_KEY, open)
    return { workspaceOpen: open }
  }),

  serverHasUnread: {},
  setServerHasUnread: (serverId, hasUnread) =>
    set((state) => {
      if (state.serverHasUnread[serverId] === hasUnread) return state
      return { serverHasUnread: { ...state.serverHasUnread, [serverId]: hasUnread } }
    }),

  voiceChannelId: null,
  voiceServerId: null,
  setVoiceChannel: (channelId, serverId) =>
    set({ voiceChannelId: channelId, voiceServerId: serverId }),
}))
