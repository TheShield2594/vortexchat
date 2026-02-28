"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Compass, Clipboard, LogOut, UserPlus } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import { CreateServerModal } from "@/components/modals/create-server-modal"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useState, useMemo, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils/cn"
import type { ServerRow } from "@/types/database"
import { VortexLogo } from "@/components/ui/vortex-logo"
import { Skeleton } from "@/components/ui/skeleton"
import Image from "next/image"

/** Vertical icon strip listing joined servers, DM shortcut, and create/discover actions. */
export function ServerSidebar() {
  const { servers, isLoadingServers, activeServerId, setActiveServer, removeServer, currentUser, channels } = useAppStore(
    useShallow((s) => ({ servers: s.servers, isLoadingServers: s.isLoadingServers, activeServerId: s.activeServerId, setActiveServer: s.setActiveServer, removeServer: s.removeServer, currentUser: s.currentUser, channels: s.channels }))
  )
  const [showCreateServer, setShowCreateServer] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  const navigateToServer = useCallback((serverId: string) => {
    setActiveServer(serverId)

    // Check Zustand store for cached channels (populated after any visit this session)
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

    // Check localStorage for last-visited channel (cross-session)
    try {
      const stored = localStorage.getItem(`vortexchat:last-channel:${serverId}`)
      if (stored) {
        router.push(`/channels/${serverId}/${stored}`)
        return
      }
    } catch {}

    // Fallback: redirect page handles first-ever visit
    router.push(`/channels/${serverId}`)
  }, [channels, router, setActiveServer])

  async function handleLeaveServer(server: ServerRow) {
    if (!currentUser) return
    try {
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("server_id", server.id)
        .eq("user_id", currentUser.id)
      if (error) throw error
      removeServer(server.id)
      toast({ title: `Left ${server.name}` })
      router.push("/channels/me")
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to leave server", description: error.message })
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-col items-center w-[72px] py-3 gap-2 flex-shrink-0 overflow-y-auto no-scrollbar"
        style={{ background: 'var(--theme-bg-tertiary)' }}
      >
        {/* VortexChat home / Direct Messages */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/channels/me"
              onClick={() => setActiveServer(null)}
              aria-label="Direct Messages"
              className={cn(
                "w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 focus-ring",
                activeServerId === null
                  ? "rounded-2xl"
                  : "rounded-full hover:rounded-2xl"
              )}
              style={{
                background: activeServerId === null
                  ? 'color-mix(in srgb, var(--theme-accent) 20%, var(--theme-bg-primary))'
                  : 'var(--theme-bg-primary)',
              }}
            >
              <VortexLogo
                size={24}
                style={{ color: activeServerId === null ? 'var(--theme-accent)' : 'var(--theme-text-muted)' } as React.CSSProperties}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Direct Messages</TooltipContent>
        </Tooltip>

        <Separator className="w-8 my-1" style={{ background: 'var(--theme-surface-elevated)' }} />

        {/* Server list */}
        {servers.length === 0 && isLoadingServers && (
          <div className="w-full flex flex-col items-center gap-2 py-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-12 rounded-2xl" />
            ))}
          </div>
        )}

        {servers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isActive={activeServerId === server.id}
            isOwner={currentUser?.id === server.owner_id}
            onClick={() => navigateToServer(server.id)}
            onLeave={() => handleLeaveServer(server)}
          />
        ))}

        <Separator className="w-8 my-1" style={{ background: 'var(--theme-surface-elevated)' }} />

        {/* Add server */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowCreateServer(true)}
              aria-label="Add a Server"
              className="w-12 h-12 rounded-full hover:rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200 group focus-ring"
              style={{ background: 'var(--theme-bg-primary)' }}
            >
              <Plus className="w-6 h-6 transition-colors" style={{ color: 'var(--theme-success)' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add a Server</TooltipContent>
        </Tooltip>

        {/* Explore */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Explore Public Servers"
              className="w-12 h-12 rounded-full hover:rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200 focus-ring"
              style={{ background: 'var(--theme-bg-primary)' }}
            >
              <Compass className="w-6 h-6" style={{ color: 'var(--theme-success)' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Explore Public Servers</TooltipContent>
        </Tooltip>

        <CreateServerModal
          open={showCreateServer}
          onClose={() => setShowCreateServer(false)}
        />
      </div>
    </TooltipProvider>
  )
}

function ServerIcon({
  server,
  isActive,
  isOwner,
  onClick,
  onLeave,
}: {
  server: ServerRow
  isActive: boolean
  isOwner: boolean
  onClick: () => void
  onLeave: () => void
}) {
  const { toast } = useToast()
  const initials = server.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const [copyShortcutLabel, setCopyShortcutLabel] = useState("Ctrl+C")

  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent || ""
    const isApple = /Mac|iPhone|iPad|iPod/i.test(platform)
    setCopyShortcutLabel(isApple ? "⌘C" : "Ctrl+C")
  }, [])

  return (
    <ContextMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <ContextMenuTrigger asChild>
            <div className="relative group cursor-pointer focus-ring rounded-full" role="button" tabIndex={0} aria-label={server.name} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}>
              {/* Active indicator */}
              <div
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200",
                  isActive
                    ? "h-10 -left-3"
                    : "h-5 -left-3 opacity-0 group-hover:opacity-100 group-hover:h-5"
                )}
                style={{ background: 'var(--theme-text-primary)' }}
              />
              <div
                className={cn(
                  "relative w-12 h-12 flex items-center justify-center transition-all duration-200 overflow-hidden",
                  isActive ? "rounded-2xl" : "rounded-full hover:rounded-2xl"
                )}
                style={{
                  background: server.icon_url ? 'transparent' : 'var(--theme-surface-elevated)',
                  boxShadow: isActive
                    ? "0 0 18px color-mix(in srgb, var(--theme-accent) 50%, transparent)"
                    : "none",
                }}
              >
                {server.icon_url ? (
                  <Image
                    src={server.icon_url}
                    alt={server.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-white">{initials}</span>
                )}
              </div>
            </div>
          </ContextMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{server.name}</TooltipContent>
      </Tooltip>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(server.invite_code)
          toast({ title: "Invite code copied!" })
        }}>
          <UserPlus className="w-4 h-4 mr-2" /> Invite People
          <ContextMenuShortcut>I</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(server.id)
          toast({ title: "Server ID copied!" })
        }}>
          <Clipboard className="w-4 h-4 mr-2" /> Copy Server ID
          <ContextMenuShortcut>{copyShortcutLabel}</ContextMenuShortcut>
        </ContextMenuItem>
        {!isOwner && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onLeave}>
              <LogOut className="w-4 h-4 mr-2" /> Leave Server
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
