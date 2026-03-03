"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Clipboard, AtSign, MessageSquare, UserPlus, UserCircle, Flag } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserProfilePopover } from "@/components/user-profile-popover"
import { ProfilePanel } from "@/components/profile/profile-panel"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import type { RoleRow } from "@/types/database"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { Skeleton } from "@/components/ui/skeleton"
import { openDmChannel, sendFriendRequest } from "@/lib/social-actions"
import { ReportModal } from "@/components/modals/report-modal"
import { getStatusColor } from "@/lib/presence-status"
import { cn } from "@/lib/utils/cn"

interface Props {
  serverId: string
  initialMembers?: MemberData[]
}

interface PresenceState {
  [userId: string]: { status: string; speaking?: boolean; voice_channel_id?: string }
}

export interface MemberData {
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
    created_at: string
  } | null
  roles: RoleRow[]
}


/** Collapsible member list panel showing server members grouped by role with real-time presence indicators. */
export function MemberList({ serverId, initialMembers }: Props) {
  const { memberListOpen, currentUser } = useAppStore(
    useShallow((s) => ({ memberListOpen: s.memberListOpen, currentUser: s.currentUser }))
  )
  const [members, setMembers] = useState<MemberData[]>(initialMembers ?? [])
  const [presence, setPresence] = useState<PresenceState>({})
  const [recentlyActiveUserIds, setRecentlyActiveUserIds] = useState<Set<string>>(new Set())
  const recentActivityTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const previousPresenceRef = useRef<PresenceState>({})
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(!initialMembers?.length)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const memberFetchControllerRef = useRef<AbortController | null>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  // Sync SSR-provided members to the app store for mention autocomplete
  useEffect(() => {
    if (initialMembers?.length) {
      useAppStore.getState().setMembers(serverId, initialMembers.map((m) => ({
        user_id: m.user_id,
        username: m.user?.username ?? "",
        display_name: m.user?.display_name ?? null,
        avatar_url: m.user?.avatar_url ?? null,
        nickname: m.nickname,
      })))
    }
  }, [serverId, initialMembers])

  useEffect(() => {
    setSelectedMemberId(null)
  }, [serverId])

  // Fetch members from API (skipped when SSR data provided)
  useEffect(() => {
    if (initialMembers) return

    async function fetchMembers() {
      memberFetchControllerRef.current?.abort()
      const controller = new AbortController()
      memberFetchControllerRef.current = controller
      const encodedServerId = encodeURIComponent(serverId)

      setLoadingMembers(true)
      try {
        const response = await fetch(`/api/servers/${encodedServerId}/members`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch members (${response.status})`)
        }

        type ApiRoleEntry = { role_id: string; roles: RoleRow | null }
        type ApiMember = Omit<MemberData, "roles"> & { roles?: ApiRoleEntry[] }
        const rawMembers = (await response.json()) as ApiMember[]
        if (controller.signal.aborted) return

        const merged: MemberData[] = rawMembers.map((member) => ({
          ...member,
          roles: (member.roles ?? [])
            .map((entry) => entry.roles)
            .filter((role): role is RoleRow => Boolean(role)),
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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return

        console.error("Failed to fetch members:", error)
        setMembers([])
        useAppStore.getState().setMembers(serverId, [])
      } finally {
        if (memberFetchControllerRef.current === controller) {
          memberFetchControllerRef.current = null
          setLoadingMembers(false)
        }
      }
    }

    fetchMembers()

    return () => {
      memberFetchControllerRef.current?.abort()
      memberFetchControllerRef.current = null
    }
  }, [serverId, initialMembers])

  // Presence subscription (always runs regardless of SSR data)
  useEffect(() => {
    const channel = supabase.channel(`presence:${serverId}`)
    channelRef.current = channel
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string; status: string; speaking?: boolean; voice_channel_id?: string }>()
        const presenceMap: PresenceState = {}
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            const nextPresence = {
              status: p.status,
              speaking: p.speaking,
              voice_channel_id: p.voice_channel_id,
            }
            presenceMap[p.user_id] = nextPresence

            const previousPresence = previousPresenceRef.current[p.user_id]
            const statusChanged = previousPresence?.status !== nextPresence.status
            const speakingBecameActive = Boolean(nextPresence.speaking) && !Boolean(previousPresence?.speaking)
            const voiceChannelChanged = previousPresence?.voice_channel_id !== nextPresence.voice_channel_id
            if (!previousPresence || statusChanged || speakingBecameActive || voiceChannelChanged) {
              const existingTimer = recentActivityTimersRef.current.get(p.user_id)
              if (existingTimer) clearTimeout(existingTimer)

              setRecentlyActiveUserIds((prev) => {
                const next = new Set(prev)
                next.add(p.user_id)
                return next
              })

              const timer = setTimeout(() => {
                setRecentlyActiveUserIds((prev) => {
                  const next = new Set(prev)
                  next.delete(p.user_id)
                  return next
                })
                recentActivityTimersRef.current.delete(p.user_id)
              }, 12_000)
              recentActivityTimersRef.current.set(p.user_id, timer)
            }
          }
        }
        previousPresenceRef.current = presenceMap
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
      for (const timer of recentActivityTimersRef.current.values()) {
        clearTimeout(timer)
      }
      recentActivityTimersRef.current.clear()
      previousPresenceRef.current = {}
      setRecentlyActiveUserIds(new Set())
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

  const selectedMember = selectedMemberId
    ? members.find((member) => member.user_id === selectedMemberId) ?? null
    : null

  return (
    <div className="flex h-full flex-shrink-0">
      {selectedMember && (
        <ProfilePanel
          user={selectedMember.user}
          displayName={selectedMember.nickname || selectedMember.user?.display_name || selectedMember.user?.username || "Unknown"}
          status={presence[selectedMember.user_id]?.status}
          roles={selectedMember.roles}
          currentUserId={currentUser?.id}
          onClose={() => setSelectedMemberId(null)}
        />
      )}

      <div className="w-60 flex-shrink-0 flex flex-col bg-[var(--app-bg-secondary)]">
        <ScrollArea className="flex-1 py-4">
        {loadingMembers && (
          <div className="space-y-3 px-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Online */}
        {!loadingMembers && onlineMembers.length > 0 && (
          <div className="mb-2">
            <div
              className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Online — {onlineMembers.length}
            </div>
            {onlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
                currentUserId={currentUser?.id}
                onViewProfile={() => setSelectedMemberId(member.user_id)}
                recentlyActive={recentlyActiveUserIds.has(member.user_id)}
                serverId={serverId}
              />
            ))}
          </div>
        )}

        {/* Offline */}
        {!loadingMembers && offlineMembers.length > 0 && (
          <div>
            <div
              className="px-4 py-1 text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Offline — {offlineMembers.length}
            </div>
            {offlineMembers.map((member) => (
              <MemberItem
                key={member.user_id}
                member={member}
                presence={presence[member.user_id]}
                currentUserId={currentUser?.id}
                onViewProfile={() => setSelectedMemberId(member.user_id)}
                recentlyActive={recentlyActiveUserIds.has(member.user_id)}
                offline
                serverId={serverId}
              />
            ))}
          </div>
        )}
        </ScrollArea>
      </div>
    </div>
  )
}

function MemberItem({
  member,
  presence,
  currentUserId,
  onViewProfile,
  offline,
  recentlyActive,
  serverId,
}: {
  member: MemberData
  presence?: { status: string; speaking?: boolean; voice_channel_id?: string }
  currentUserId?: string
  onViewProfile: () => void
  offline?: boolean
  recentlyActive?: boolean
  serverId: string
}) {
  const { toast } = useToast()
  const router = useRouter()
  const displayName =
    member.nickname ||
    member.user?.display_name ||
    member.user?.username ||
    "Unknown"
  const initials = displayName.slice(0, 2).toUpperCase()
  const isOtherUser = currentUserId && member.user_id !== currentUserId
  const [actionLoading, setActionLoading] = useState<"message" | "friend" | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)

  // Get highest colored role
  const coloredRole = member.roles
    ?.filter(Boolean)
    .find((r) => r?.color && r.color !== "#99aab5")

  const roleColor = coloredRole?.color ?? undefined

  async function handleMessage() {
    if (actionLoading) return
    setActionLoading("message")
    try {
      await openDmChannel(member.user_id, router, toast)
    } catch (error) {
      console.error("Failed to open DM from member list:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while opening DM",
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAddFriend() {
    if (!member.user?.username || actionLoading) return
    setActionLoading("friend")
    try {
      await sendFriendRequest(member.user.username, toast)
    } catch (error) {
      console.error("Failed to send friend request from member list:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while adding friend",
      })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
    <ContextMenu>
      <UserProfilePopover
        user={member.user}
        userId={member.user?.id}
        currentUserId={currentUserId}
        displayName={displayName}
        status={presence?.status}
        roles={member.roles}
        side="left"
      >
        <ContextMenuTrigger asChild>
          <div
            className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded cursor-pointer hover:bg-white/5 transition-colors group"
            onClick={(event) => {
              event.preventDefault()
              onViewProfile()
            }}
          >
            <div className={`relative flex-shrink-0 rounded-full ${recentlyActive ? "recent-activity-halo" : ""}`}>
              <Avatar className={`w-8 h-8 ${presence?.speaking ? "speaking-ring" : ""}`}>
                {member.user?.avatar_url && <AvatarImage src={member.user.avatar_url} />}
                <AvatarFallback
                  style={{
                    background: "var(--theme-accent)",
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
                  borderColor: "var(--theme-bg-secondary)",
                }}
              />
            </div>

            <div className="min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{
                  color: roleColor ?? (offline ? "var(--theme-text-faint)" : "var(--theme-text-normal)"),
                }}
              >
                {displayName}
              </div>
              {member.user?.status_message && !offline && (
                <div className="text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
                  {member.user.status_message}
                </div>
              )}
              {presence?.voice_channel_id && (
                <div
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition-all duration-200",
                    presence?.speaking ? "bg-green-500/15 text-green-300" : "bg-white/10 text-[var(--theme-text-muted)]"
                  )}
                >
                  {presence?.speaking ? (
                    <span className="speaking-waveform" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-white/40" aria-hidden />
                  )}
                  {presence?.speaking ? "Speaking" : "Connected"}
                </div>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
      </UserProfilePopover>

      <ContextMenuContent className="w-48">
        {isOtherUser && (
          <>
            <ContextMenuItem onClick={handleMessage} disabled={actionLoading === "message"}>
              <MessageSquare className="w-4 h-4 mr-2" /> Message
              <ContextMenuShortcut>M</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleAddFriend} disabled={actionLoading === "friend"}>
              <UserPlus className="w-4 h-4 mr-2" /> Add Friend
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={onViewProfile}>
          <UserCircle className="w-4 h-4 mr-2" /> View Profile
          <ContextMenuShortcut>P</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
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
        {isOtherUser && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setShowReportModal(true)}>
              <Flag className="w-4 h-4 mr-2" /> Report User
              <ContextMenuShortcut>⇧R</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>

    {isOtherUser && (
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUserId={member.user_id}
        reportedUsername={displayName}
        serverId={serverId}
      />
    )}
    </>
  )
}
