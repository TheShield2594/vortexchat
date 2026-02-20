"use client"

import { useEffect, useState } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MemberWithRoles } from "@/types/database"
import { cn } from "@/lib/utils/cn"

interface Props {
  serverId: string
}

interface PresenceEntry {
  user_id: string
  status: string
  speaking?: boolean
  voice_channel_id?: string
}

interface PresenceState {
  [userId: string]: { status: string; speaking?: boolean; voice_channel_id?: string }
}

export function MemberList({ serverId }: Props) {
  const { memberListOpen } = useAppStore()
  const [members, setMembers] = useState<MemberWithRoles[]>([])
  const [presence, setPresence] = useState<PresenceState>({})
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    fetchMembers()
    const cleanupPresence = setupPresence()
    return cleanupPresence
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setMembers((data as unknown as MemberWithRoles[]) ?? [])
  }

  function setupPresence() {
    const channel = supabase.channel(`presence:${serverId}`)
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceEntry>()
        const presenceMap: PresenceState = {}
        for (const presences of Object.values(state)) {
          for (const p of presences as PresenceEntry[]) {
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

  // Group members by online/offline
  const onlineMembers = members.filter((m) => {
    const p = presence[m.user_id]
    return p && p.status !== "offline" && p.status !== "invisible"
  })
  const offlineMembers = members.filter((m) => {
    const p = presence[m.user_id]
    return !p || p.status === "offline" || p.status === "invisible"
  })

  return (
    <div className="w-60 flex-shrink-0 flex flex-col bg-vortex-bg-secondary">
      <ScrollArea className="flex-1 py-4">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-2">
            <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1 text-vortex-interactive">
              Online — {onlineMembers.length}
            </div>
            {onlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
              />
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1 text-vortex-interactive">
              Offline — {offlineMembers.length}
            </div>
            {offlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
                offline
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// Runtime shape from Supabase nested join: member_roles(role_id, roles(*))
interface MemberRoleEntry {
  role_id: string
  roles: { color?: string } | null
}

function MemberItem({
  member,
  presence,
  offline,
}: {
  member: MemberWithRoles
  presence?: { status: string; speaking?: boolean; voice_channel_id?: string }
  offline?: boolean
}) {
  const displayName =
    member.nickname ||
    member.user?.display_name ||
    member.user?.username ||
    "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()

  // Get highest colored role (runtime shape differs from TS type due to Supabase nested join)
  const coloredRole = (member.roles as unknown as MemberRoleEntry[] | undefined)
    ?.map((mr) => mr.roles)
    .filter(Boolean)
    .find((r) => r?.color && r.color !== "#99aab5")

  const roleColor = coloredRole?.color ?? undefined

  function getStatusColor(status?: string) {
    switch (status) {
      case "online": return "bg-vortex-success"
      case "idle": return "bg-[#f0b132]"
      case "dnd": return "bg-vortex-danger"
      default: return "bg-[#80848e]"
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded cursor-pointer hover:bg-white/5 transition-colors group">
      <div className="relative flex-shrink-0">
        <Avatar className={cn("w-8 h-8", presence?.speaking && "speaking-ring")}>
          {member.user?.avatar_url && <AvatarImage src={member.user.avatar_url} />}
          <AvatarFallback
            className={cn(
              "bg-vortex-accent text-white text-xs",
              offline && "opacity-50"
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-vortex-bg-secondary",
            getStatusColor(presence?.status)
          )}
        />
      </div>

      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-medium truncate",
            !roleColor && (offline ? "text-vortex-text-muted" : "text-[#dcddde]")
          )}
          style={roleColor ? { color: roleColor } : undefined}
        >
          {displayName}
        </div>
        {member.user?.status_message && !offline && (
          <div className="text-xs truncate text-vortex-interactive">
            {member.user.status_message}
          </div>
        )}
      </div>
    </div>
  )
}
