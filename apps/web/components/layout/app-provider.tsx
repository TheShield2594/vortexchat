"use client"

import { useEffect } from "react"
import { useAppStore } from "@/lib/stores/app-store"
import { usePresenceSync } from "@/hooks/use-presence-sync"
import type { UserRow, ServerRow } from "@/types/database"

interface AppProviderProps {
  user: UserRow | null
  servers: ServerRow[]
  children: React.ReactNode
}

export function AppProvider({ user, servers, children }: AppProviderProps) {
  const { setCurrentUser, setServers } = useAppStore()

  useEffect(() => {
    setCurrentUser(user)
    setServers(servers)
  }, [user, servers, setCurrentUser, setServers])

  // Auto-sync presence: marks user online on mount, offline on tab close
  usePresenceSync(user?.id ?? null, user?.status ?? "online")

  return <>{children}</>
}
