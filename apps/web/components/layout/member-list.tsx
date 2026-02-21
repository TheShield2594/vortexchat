"use client"

import { useEffect, useRef, useState } from "react"
import { Clipboard, AtSign } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserProfilePopover } from "@/components/user-profile-popover"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import type { RoleRow } from "@/types/database"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface Props {
  serverId: string
}

interface PresenceState {
  [userId: string]: { status: string; speaking?: boolean; voice_channel_id?: string }
}

interface MemberData {
  server_id: string
  user_id: string
  nickname: string | null
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    status_message: string | null
    bio: string | null
    banner_color: string | null
    custom_tag: string | null
  } | null
  roles: RoleRow[]
}

function getStatusColor(status?: string) {
  switch (status) {
    case "online": return "#23a55a"
    case "idle": return "#f0b132"
    case "dnd": return "#f23f43"
    default: return "#80848e"
  }
}

export function MemberList({ serverId }: Props) {
  const { memberListOpen, currentUser } = useAppStore()
  const [members, setMembers] = useState<MemberData[]>([])
  const [presence, setPresence] = useState<PresenceState>({})
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    async function fetchMembers() {
      // Fetch members and roles separately — no FK between server_members and member_roles
      const [membersRes, rolesRes] = await Promise.all([
        supabase
          .from("server_members")
          .select("*, user:users(*)")
          .eq("server_id", serverId),
        supabase
          .from("member_roles")
          .select("user_id, roles(*)")
          .eq("server_id", serverId),
      ])

      if (membersRes.error) console.error("Failed to fetch members:", membersRes.error)
      if (rolesRes.error) console.error("Failed to fetch member roles:", rolesRes.error)

      // Build a map of user_id -> roles
      type MemberRoleRow = { user_id: string; roles: RoleRow | null }
      const rolesByUser: Record<string, RoleRow[]> = {}
      for (const mr of ((rolesRes.data ?? []) as unknown as MemberRoleRow[])) {
        if (!rolesByUser[mr.user_id]) rolesByUser[mr.user_id] = []
        if (mr.roles) rolesByUser[mr.user_id].push(mr.roles)
      }

      type RawMember = Omit<MemberData, "roles"> & { roles?: unknown }
      const merged: MemberData[] = ((membersRes.data ?? []) as unknown as RawMember[]).map((m) => ({
        ...m,
        roles: rolesByUser[m.user_id] ?? [],
      }))

      setMembers(merged)

      // Push lightweight member data to store for mention autocomplete
      useAppStore.getState().setMembers(serverId, merged.map((m) => ({
        user_id: m.user_id,
        username: m.user?.username ?? "",
        display_name: m.user?.display_name ?? null,
        avatar_url: m.user?.avatar_url ?? null,
        nickname: m.nickname,
      })))
    }

    fetchMembers()

    const channel = supabase.channel(`presence:${serverId}`)
    channelRef.current = channel
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string; status: string; speaking?: boolean; voice_channel_id?: string }>()
        const presenceMap: PresenceState = {}
        for (const presences of Object.values(state)) {
          for (const p of presences) {
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
            // Read user's actual status from the database
            const { data: profile } = await supabase
              .from("users")
              .select("status")
              .eq("id", user.id)
              .single()
            await channel.track({
              user_id: user.id,
              status: profile?.status ?? "online",
            })
          }
        }
      })

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [serverId, supabase])

  // Re-track presence when the current user's status changes
  useEffect(() => {
    if (channelRef.current && currentUser) {
      channelRef.current.track({
        user_id: currentUser.id,
        status: currentUser.status,
      })
    }
  }, [currentUser?.status, currentUser?.id])

  if (!memberListOpen) return null

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
}: {
  member: MemberData
  presence?: { status: string; speaking?: boolean; voice_channel_id?: string }
  offline?: boolean
}) {
  const { toast } = useToast()
  const displayName =
    member.nickname ||
    member.user?.display_name ||
    member.user?.username ||
    "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()

  // Get highest colored role
  const coloredRole = member.roles
    ?.filter(Boolean)
    .find((r) => r?.color && r.color !== "#99aab5")

  const roleColor = coloredRole?.color ?? undefined

  return (
    <ContextMenu>
      <UserProfilePopover
        user={member.user}
        displayName={displayName}
        status={presence?.status}
        roles={member.roles}
        side="left"
      >
        <ContextMenuTrigger asChild>
          <div
            className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded cursor-pointer hover:bg-white/5 transition-colors group"
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
        </ContextMenuTrigger>
      </UserProfilePopover>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(`@${member.user?.username ?? displayName}`)
          toast({ title: "Mention copied!" })
        }}>
          <AtSign className="w-4 h-4 mr-2" /> Mention
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(member.user_id)
          toast({ title: "User ID copied!" })
        }}>
          <Clipboard className="w-4 h-4 mr-2" /> Copy User ID
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
