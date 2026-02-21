"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Compass, MessageSquare, Clipboard, LogOut, UserPlus } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import { CreateServerModal } from "@/components/modals/create-server-modal"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useState } from "react"
import { cn } from "@/lib/utils/cn"
import type { ServerRow } from "@/types/database"

export function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, removeServer, currentUser } = useAppStore()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClientSupabaseClient()

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
      router.push("/channels/@me")
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to leave server", description: error.message })
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-col items-center w-[72px] py-3 gap-2 flex-shrink-0 overflow-y-auto no-scrollbar"
        style={{ background: '#1e1f22' }}
      >
        {/* DMs / Home */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/channels/@me"
              onClick={() => setActiveServer(null)}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 group",
                activeServerId === null
                  ? "rounded-2xl"
                  : "hover:rounded-2xl"
              )}
              style={{
                background: activeServerId === null ? '#5865f2' : '#313338',
              }}
            >
              <MessageSquare
                className="w-6 h-6 transition-colors"
                style={{ color: activeServerId === null ? 'white' : '#949ba4' }}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Direct Messages</TooltipContent>
        </Tooltip>

        <Separator className="w-8 my-1" style={{ background: '#3f4147' }} />

        {/* Server list */}
        {servers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isActive={activeServerId === server.id}
            isOwner={currentUser?.id === server.owner_id}
            onClick={() => {
              setActiveServer(server.id)
              router.push(`/channels/${server.id}`)
            }}
            onLeave={() => handleLeaveServer(server)}
          />
        ))}

        <Separator className="w-8 my-1" style={{ background: '#3f4147' }} />

        {/* Add server */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowCreateServer(true)}
              className="w-12 h-12 rounded-full hover:rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200 group"
              style={{ background: '#313338' }}
            >
              <Plus className="w-6 h-6 transition-colors" style={{ color: '#23a55a' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add a Server</TooltipContent>
        </Tooltip>

        {/* Explore */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-12 h-12 rounded-full hover:rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200"
              style={{ background: '#313338' }}
            >
              <Compass className="w-6 h-6" style={{ color: '#23a55a' }} />
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

  return (
    <ContextMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <ContextMenuTrigger asChild>
            <div className="relative group cursor-pointer" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}>
              {/* Active indicator */}
              <div
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200",
                  isActive
                    ? "h-10 -left-3"
                    : "h-5 -left-3 opacity-0 group-hover:opacity-100 group-hover:h-5"
                )}
                style={{ background: '#f2f3f5' }}
              />
              <div
                className={cn(
                  "w-12 h-12 flex items-center justify-center transition-all duration-200 overflow-hidden",
                  isActive ? "rounded-2xl" : "rounded-full hover:rounded-2xl"
                )}
                style={{ background: server.icon_url ? 'transparent' : '#36393f' }}
              >
                {server.icon_url ? (
                  <img
                    src={server.icon_url}
                    alt={server.name}
                    className="w-full h-full object-cover"
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
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(server.id)
          toast({ title: "Server ID copied!" })
        }}>
          <Clipboard className="w-4 h-4 mr-2" /> Copy Server ID
        </ContextMenuItem>
        {!isOwner && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onLeave}>
              <LogOut className="w-4 h-4 mr-2" /> Leave Server
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
