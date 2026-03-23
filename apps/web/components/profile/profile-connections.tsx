"use client"

import { useCallback, useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
import { SteamIcon, YouTubeIcon } from "@/components/icons/social-icons"

interface ConnectionRow {
  id: string
  provider: string
  provider_user_id: string
  username: string | null
  display_name: string | null
  profile_url: string | null
  metadata: Record<string, unknown>
}

const PROVIDER_CONFIG: Record<string, { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string; color: string }> = {
  steam: { icon: SteamIcon, label: "Steam", color: "#171a21" },
  youtube: { icon: YouTubeIcon, label: "YouTube", color: "#FF0000" },
}

interface ProfileConnectionsProps {
  userId: string
}

export function ProfileConnections({ userId }: ProfileConnectionsProps): React.ReactElement | null {
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadConnections = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/users/connections/public?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
      if (!res.ok) return
      const payload = await res.json()
      setConnections(payload.connections ?? [])
    } catch {
      // silently ignore
    } finally {
      setLoaded(true)
    }
  }, [userId])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  if (!loaded || connections.length === 0) return null

  return (
    <section className="rounded-xl bg-secondary/60 p-3">
      <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">CONNECTIONS</h4>
      <div className="space-y-2">
        {connections.map((connection) => {
          const config = PROVIDER_CONFIG[connection.provider]
          const Icon = config?.icon
          const gameCount = connection.provider === "steam" && connection.metadata?.game_count != null
            ? Number(connection.metadata.game_count)
            : null

          return (
            <div
              key={connection.id}
              className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary"
              style={{ background: "rgba(0,0,0,0.15)" }}
            >
              {Icon && (
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
                  style={{ background: config.color }}
                >
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {connection.display_name || connection.username || connection.provider_user_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {config?.label ?? connection.provider}
                  {gameCount !== null && ` · ${gameCount.toLocaleString()} games`}
                </p>
              </div>
              {connection.profile_url && (
                <a
                  href={connection.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label={`Visit ${config?.label ?? connection.provider} profile`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
