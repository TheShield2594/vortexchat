"use client"

import { useCallback, useState, lazy, Suspense } from "react"
import { useRouter } from "next/navigation"
import { Plus, Compass, Users, Search } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"
import { CreateServerModal } from "@/components/modals/create-server-modal"
import { cn } from "@/lib/utils/cn"
import { perfMarkNavStart } from "@/lib/perf"
import { useMobileLayout } from "@/hooks/use-mobile-layout"

const QuickSwitcherModal = lazy(() =>
  import("@/components/modals/quickswitcher-modal").then((m) => ({ default: m.QuickSwitcherModal }))
)

export default function ServersPage() {
  const { servers, isLoadingServers, channels, setActiveServer, serverHasUnread } = useAppStore(
    useShallow((s) => ({
      servers: s.servers,
      isLoadingServers: s.isLoadingServers,
      channels: s.channels,
      setActiveServer: s.setActiveServer,
      serverHasUnread: s.serverHasUnread,
    }))
  )
  const router = useRouter()
  const isMobile = useMobileLayout()
  const [showCreate, setShowCreate] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const navigateToServer = useCallback(
    (serverId: string) => {
      perfMarkNavStart(`server:${serverId.slice(0, 8)}`)
      setActiveServer(serverId)

      // On mobile, always go to the server root so the channel sidebar is shown
      if (isMobile) {
        router.push(`/channels/${serverId}`)
        return
      }

      // Prefer persisted last-visited channel
      try {
        const stored = localStorage.getItem(`vortexchat:last-channel:${serverId}`)
        if (stored) {
          // Validate against cached channels if available
          const cached = channels[serverId]
          if (!cached || cached.some((c) => c.id === stored)) {
            router.push(`/channels/${serverId}/${stored}`)
            return
          }
        }
      } catch {}

      // Fall back to first text channel from cache
      const cached = channels[serverId]
      if (cached && cached.length > 0) {
        const firstText = [...cached]
          .filter((c) => c.type === "text")
          .sort((a, b) => a.position - b.position)[0]
        if (firstText) {
          router.push(`/channels/${serverId}/${firstText.id}`)
          return
        }
      }

      router.push(`/channels/${serverId}`)
    },
    [channels, isMobile, router, setActiveServer]
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--theme-bg-tertiary)" }}
      >
        <span className="font-semibold text-white">Servers</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors md:hidden"
            style={{ color: "var(--theme-text-muted)" }}
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/channels/discover")}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            title="Discover servers"
          >
            <Compass className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: "var(--theme-accent)" }}
            title="Create server"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {isLoadingServers && servers.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoadingServers && servers.length === 0 && (
          <div className="px-2 py-8">
            <BrandedEmptyState
              icon={Users}
              title="No servers yet"
              description="Join or create a server to start chatting with communities."
              hint="Tap the + button above or explore public servers."
            />
          </div>
        )}

        {servers.map((server) => {
          const initials = server.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
          const hasUnread = serverHasUnread[server.id] ?? false

          return (
            <button
              type="button"
              key={server.id}
              onClick={() => navigateToServer(server.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                "hover:bg-white/5 active:bg-white/10"
              )}
            >
              <div className="relative flex-shrink-0">
                <Avatar className="w-10 h-10 rounded-2xl">
                  {server.icon_url && <AvatarImage src={server.icon_url} />}
                  <AvatarFallback
                    className="rounded-2xl text-xs font-bold"
                    style={{ background: "var(--theme-accent)", color: "white" }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {hasUnread && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{ background: "var(--theme-accent)", borderColor: "var(--theme-bg-primary)" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn("text-sm truncate block", hasUnread ? "font-semibold text-white" : "text-gray-300")}>
                  {server.name}
                </span>
                {hasUnread && <span className="sr-only">, unread</span>}
                {server.description && (
                  <span className="text-xs truncate block" style={{ color: "var(--theme-text-muted)" }}>
                    {server.description}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <CreateServerModal open={showCreate} onClose={() => setShowCreate(false)} />
      {showSearch && (
        <Suspense fallback={null}>
          <QuickSwitcherModal onClose={() => setShowSearch(false)} />
        </Suspense>
      )}
    </div>
  )
}
