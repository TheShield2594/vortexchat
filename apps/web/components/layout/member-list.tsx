"use client"

import { useEffect, useState, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserX, Shield, ShieldOff } from "lucide-react"
import type { MemberWithRoles } from "@/types/database"

interface Props {
  serverId: string
}

interface PresenceState {
  [userId: string]: { status: string; speaking?: boolean; voice_channel_id?: string }
}

export function MemberList({ serverId }: Props) {
  const { memberListOpen } = useAppStore()
  const [members, setMembers] = useState<MemberWithRoles[]>([])
  const [presence, setPresence] = useState<PresenceState>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [serverOwnerId, setServerOwnerId] = useState<string | null>(null)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    fetchMembers()
    setupPresence()
    // Fetch current user + server owner
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
    supabase.from("servers").select("owner_id").eq("id", serverId).single().then(({ data }) => {
      if (data) setServerOwnerId(data.owner_id)
    })
  }, [serverId])

  async function fetchMembers() {
    const { data } = await supabase
      .from("server_members")
      .select(`
        *,
        user:users(*),
        roles:member_roles(role_id, roles(*))
      `)
      .eq("server_id", serverId)
    setMembers((data as any) ?? [])
  }

  async function handleKick(userId: string) {
    await fetch(`/api/servers/${serverId}/members?userId=${userId}`, { method: "DELETE" })
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  async function handleBan(userId: string, reason?: string) {
    await fetch(`/api/servers/${serverId}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reason }),
    })
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  function setupPresence() {
    const channel = supabase.channel(`presence:${serverId}`)
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string; status: string; speaking?: boolean; voice_channel_id?: string }>()
        const presenceMap: PresenceState = {}
        for (const presences of Object.values(state)) {
          for (const p of presences as any[]) {
            presenceMap[p.user_id] = {
              status: p.status,
              speaking: p.speaking,
              voice_channel_id: p.voice_channel_id,
            }
          }
        }
        setPresence(presenceMap)
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await channel.track({ user_id: user.id, status: "online" })
          }
        }
      })

    return () => { supabase.removeChannel(channel) }
  }

  if (!memberListOpen) return null

  // Group members by their highest role
  const onlineMembers = members.filter((m) => {
    const p = presence[m.user_id]
    return p && p.status !== "offline" && p.status !== "invisible"
  })
  const offlineMembers = members.filter((m) => {
    const p = presence[m.user_id]
    return !p || p.status === "offline" || p.status === "invisible"
  })

  return (
    <div
      className="w-60 flex-shrink-0 flex flex-col"
      style={{ background: "#2b2d31" }}
    >
      <ScrollArea className="flex-1 py-4">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-2">
            <div
              className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "#949ba4" }}
            >
              Online — {onlineMembers.length}
            </div>
            {onlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
                canModerate={currentUserId === serverOwnerId && member.user_id !== currentUserId}
                onKick={() => handleKick(member.user_id)}
                onBan={(reason) => handleBan(member.user_id, reason)}
              />
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <div
              className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "#949ba4" }}
            >
              Offline — {offlineMembers.length}
            </div>
            {offlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
                offline
                canModerate={currentUserId === serverOwnerId && member.user_id !== currentUserId}
                onKick={() => handleKick(member.user_id)}
                onBan={(reason) => handleBan(member.user_id, reason)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function MemberItem({
  member,
  presence,
  offline,
  canModerate,
  onKick,
  onBan,
}: {
  member: MemberWithRoles
  presence?: { status: string; speaking?: boolean; voice_channel_id?: string }
  offline?: boolean
  canModerate?: boolean
  onKick?: () => void
  onBan?: (reason?: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [contextMenu])
  const displayName =
    member.nickname ||
    member.user?.display_name ||
    member.user?.username ||
    "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()

  // Get highest colored role
  const coloredRole = member.roles
    ?.map((mr: any) => mr.roles)
    .filter(Boolean)
    .find((r: any) => r?.color && r.color !== "#99aab5")

  const roleColor = coloredRole?.color ?? undefined

  function getStatusColor(status?: string) {
    switch (status) {
      case "online": return "#23a55a"
      case "idle": return "#f0b132"
      case "dnd": return "#f23f43"
      default: return "#80848e"
    }
  }

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded cursor-pointer hover:bg-white/5 transition-colors group"
        onContextMenu={(e) => {
          if (canModerate) {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }
        }}
      >
        <div className="relative flex-shrink-0">
          <Avatar className={`w-8 h-8 ${presence?.speaking ? "speaking-ring" : ""}`}>
            {member.user?.avatar_url && <AvatarImage src={member.user.avatar_url} />}
            <AvatarFallback
              style={{
                background: "#5865f2",
                color: "white",
                fontSize: "12px",
                opacity: offline ? 0.5 : 1,
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style={{
              background: getStatusColor(presence?.status),
              borderColor: "#2b2d31",
            }}
          />
        </div>

        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            style={{
              color: roleColor ?? (offline ? "#4e5058" : "#dcddde"),
            }}
          >
            {displayName}
          </div>
          {member.user?.status_message && !offline && (
            <div className="text-xs truncate" style={{ color: "#949ba4" }}>
              {member.user.status_message}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && canModerate && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg shadow-2xl overflow-hidden py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "#111214",
            border: "1px solid #1e1f22",
          }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold uppercase" style={{ color: "#949ba4" }}>
            {displayName}
          </div>
          <div className="h-px mx-2 my-1" style={{ background: "#1e1f22" }} />
          <button
            onClick={() => { onKick?.(); setContextMenu(null) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-yellow-500/10"
            style={{ color: "#f0b232" }}
          >
            <UserX className="w-4 h-4" />
            Kick {displayName}
          </button>
          <button
            onClick={() => {
              const reason = prompt(`Reason for banning ${displayName}? (optional)`) ?? undefined
              onBan?.(reason)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-red-500/10"
            style={{ color: "#f23f43" }}
          >
            <Shield className="w-4 h-4" />
            Ban {displayName}
          </button>
        </div>
      )}
    </div>
  )
}
