"use client"

import { memo, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react"
import { perfLogSinceNav } from "@/lib/perf"
import { useRouter } from "next/navigation"
import { Clipboard, AtSign, MessageSquare, UserPlus, UserCircle, Flag, Shield, Check } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserProfilePopover } from "@/components/user-profile-popover"
const ProfilePanel = lazy(() => import("@/components/profile/profile-panel").then((m) => ({ default: m.ProfilePanel })))
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import type { RoleRow } from "@/types/database"
import { PERMISSIONS } from "@vortex/shared"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { Skeleton } from "@/components/ui/skeleton"
import { openDmChannel, sendFriendRequest } from "@/lib/social-actions"
const ReportModal = lazy(() => import("@/components/modals/report-modal").then((m) => ({ default: m.ReportModal })))
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
  const [memberFetchError, setMemberFetchError] = useState<string | null>(null)
  const [memberFetchKey, setMemberFetchKey] = useState(0)
  const [serverRoles, setServerRoles] = useState<RoleRow[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const memberFetchControllerRef = useRef<AbortController | null>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  // Perf: log mount time relative to navigation start
  useEffect(() => {
    perfLogSinceNav("MemberList mounted")
  }, [serverId])

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

  // Fetch roles for @role mention autocomplete + rendering + role management
  useEffect(() => {
    fetch(`/api/servers/${encodeURIComponent(serverId)}/roles`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RoleRow[]) => {
        const nonDefault = data.filter((r: RoleRow) => !r.is_default)
        useAppStore.getState().setServerRoles(serverId, nonDefault
          .map((r) => ({ id: r.id, name: r.name, color: r.color, mentionable: r.mentionable }))
        )
        setServerRoles(nonDefault)
      })
      .catch((err) => { console.error("Failed to fetch roles for server", { serverId, error: err }) })
  }, [serverId])

  useEffect(() => {
    setSelectedMemberId(null)
  }, [serverId])

  // Fetch members from API (skipped when SSR data provided)
  useEffect(() => {
    if (initialMembers && memberFetchKey === 0) return

    async function fetchMembers() {
      memberFetchControllerRef.current?.abort()
      const controller = new AbortController()
      memberFetchControllerRef.current = controller
      const encodedServerId = encodeURIComponent(serverId)

      setLoadingMembers(true)
      setMemberFetchError(null)
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

        console.error("Failed to fetch members", {
          action: "fetchMembers",
          route: `/api/servers/${encodedServerId}/members`,
          serverId,
          error,
        })
        setMemberFetchError(error instanceof Error ? error.message : "Failed to load members")
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
  }, [serverId, initialMembers, memberFetchKey])

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

  const onlineMembers = useMemo(
    () => members.filter((m) => {
      const p = presence[m.user_id]
      return p && p.status !== "offline" && p.status !== "invisible"
    }),
    [members, presence]
  )
  const offlineMembers = useMemo(
    () => members.filter((m) => {
      const p = presence[m.user_id]
      return !p || p.status === "offline" || p.status === "invisible"
    }),
    [members, presence]
  )

  const canManageRoles = useMemo(() => {
    if (!currentUser) return false
    const currentMember = members.find((m) => m.user_id === currentUser.id)
    if (!currentMember) return false
    const perms = currentMember.roles.reduce((acc, r) => acc | r.permissions, 0)
    return !!(perms & PERMISSIONS.ADMINISTRATOR) || !!(perms & PERMISSIONS.MANAGE_ROLES)
  }, [members, currentUser])

  // Clear assignable roles when the current user lacks MANAGE_ROLES
  useEffect(() => {
    if (!canManageRoles) { setServerRoles([]); return }
  }, [canManageRoles])

  function handleMemberUpdate(userId: string, updatedRoles: RoleRow[]) {
    setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, roles: updatedRoles } : m))
  }

  if (!memberListOpen) return null

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

      <div className="w-full md:w-60 flex-shrink-0 flex flex-col bg-[var(--app-bg-secondary)]">
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

        {!loadingMembers && memberFetchError && (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--theme-danger)" }}>
              {memberFetchError}
            </p>
            <button
              onClick={() => setMemberFetchKey((k) => k + 1)}
              className="text-xs font-medium px-3 py-1.5 rounded-md focus-ring"
              style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Online */}
        {!loadingMembers && !memberFetchError && onlineMembers.length > 0 && (
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
                canManageRoles={canManageRoles}
                serverRoles={serverRoles}
                onMemberUpdate={handleMemberUpdate}
              />
            ))}
          </div>
        )}

        {/* Offline */}
        {!loadingMembers && !memberFetchError && offlineMembers.length > 0 && (
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
                canManageRoles={canManageRoles}
                serverRoles={serverRoles}
                onMemberUpdate={handleMemberUpdate}
              />
            ))}
          </div>
        )}
        </ScrollArea>
      </div>
    </div>
  )
}

const MemberItem = memo(function MemberItem({
  member,
  presence,
  currentUserId,
  onViewProfile,
  offline,
  recentlyActive,
  serverId,
  canManageRoles,
  serverRoles,
  onMemberUpdate,
}: {
  member: MemberData
  presence?: { status: string; speaking?: boolean; voice_channel_id?: string }
  currentUserId?: string
  onViewProfile: () => void
  offline?: boolean
  recentlyActive?: boolean
  serverId: string
  canManageRoles?: boolean
  serverRoles?: RoleRow[]
  onMemberUpdate?: (userId: string, roles: RoleRow[]) => void
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

  async function handleToggleRole(role: RoleRow) {
    const hasRole = member.roles?.some((r) => r.id === role.id)
    const encodedServerId = encodeURIComponent(serverId)
    const encodedUserId = encodeURIComponent(member.user_id)
    try {
      let res: Response
      if (hasRole) {
        res = await fetch(
          `/api/servers/${encodedServerId}/members/${encodedUserId}/roles?roleId=${role.id}`,
          { method: "DELETE", credentials: "include" }
        )
      } else {
        res = await fetch(
          `/api/servers/${encodedServerId}/members/${encodedUserId}/roles`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleId: role.id }),
          }
        )
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast({ variant: "destructive", title: d.error ?? "Failed to update role" })
        return
      }
      const updatedRoles = hasRole
        ? (member.roles ?? []).filter((r) => r.id !== role.id)
        : [...(member.roles ?? []), role]
      onMemberUpdate?.(member.user_id, updatedRoles)
      toast({ title: hasRole ? `Removed role "${role.name}"` : `Assigned role "${role.name}"` })
    } catch {
      toast({ variant: "destructive", title: "Network error updating role" })
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
        {isOtherUser && canManageRoles && serverRoles && serverRoles.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Shield className="w-4 h-4 mr-2" /> Roles
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {serverRoles.map((role) => {
                  const hasRole = member.roles?.some((r) => r.id === role.id)
                  return (
                    <ContextMenuItem key={role.id} onClick={() => handleToggleRole(role)}>
                      <span
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                        style={{ background: role.color }}
                      />
                      <span className="flex-1 truncate">{role.name}</span>
                      {hasRole && <Check className="w-3.5 h-3.5 ml-2 flex-shrink-0" />}
                    </ContextMenuItem>
                  )
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(`@${member.user?.username ?? displayName}`).catch(() => {})
          toast({ title: "Mention copied!" })
        }}>
          <AtSign className="w-4 h-4 mr-2" /> Mention
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(member.user_id).catch(() => {})
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

    {isOtherUser && showReportModal && (
      <Suspense fallback={null}>
        <ReportModal
          open={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={member.user_id}
          reportedUsername={displayName}
          serverId={serverId}
        />
      </Suspense>
    )}
    </>
  )
})
