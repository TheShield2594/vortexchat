"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { Calendar, MessageSquare, Shield, UserMinus, UserPlus, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { openDmChannel, sendFriendRequest } from "@/lib/social-actions"
import { sanitizeBannerColor } from "@/lib/banner-color"
import { getStatusLabel } from "@/lib/presence-status"
import type { RoleRow } from "@/types/database"
import { PERMISSIONS } from "@vortex/shared"
import { ProfileInterestTags } from "@/components/profile/profile-interest-tags"
import { ProfilePinnedItems } from "@/components/profile/profile-pinned-items"
import { ProfileActivity } from "@/components/profile/profile-activity"

type FriendshipStatus = "none" | "friends" | "pending_sent" | "pending_received" | "blocked" | "self"

interface ProfileUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  banner_color: string | null
  status_message: string | null
  status_emoji?: string | null
  status_expires_at?: string | null
  created_at?: string
  interests?: string[]
}

interface ProfilePanelProps {
  user: ProfileUser | null
  displayName: string
  status?: string
  roles?: RoleRow[]
  currentUserId?: string
  onClose: () => void
}


function getJoinedDate(rawDate?: string) {
  if (!rawDate) return "Unknown"
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

/** Expanded member profile panel shown from the member list. */
export function ProfilePanel({ user, displayName, status, roles = [], currentUserId, onClose }: ProfilePanelProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [actionLoading, setActionLoading] = useState<"message" | "friend" | null>(null)
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>("none")
  const [friendshipId, setFriendshipId] = useState<string | null>(null)
  const initials = displayName.slice(0, 2).toUpperCase()
  const isOtherUser = Boolean(user?.id && currentUserId && user.id !== currentUserId)

  useEffect(() => {
    if (!isOtherUser || !user?.id) return
    let cancelled = false
    fetch(`/api/friends/status?userId=${user.id}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json: { status: FriendshipStatus; friendshipId?: string } | null) => {
        if (!json || cancelled) return
        setFriendshipStatus(json.status)
        setFriendshipId(json.friendshipId ?? null)
      })
      .catch(() => { /* silently ignore */ })
    return () => { cancelled = true }
  }, [user?.id, isOtherUser])
  const joined = useMemo(() => getJoinedDate(user?.created_at), [user?.created_at])
  const statusExpired = Boolean(user?.status_expires_at && new Date(user.status_expires_at).getTime() <= Date.now())
  const customStatus = !statusExpired ? [user?.status_emoji, user?.status_message].filter(Boolean).join(" ").trim() : ""
  const bannerColor = sanitizeBannerColor(user?.banner_color)
  const isAdmin = roles.some((role) => Boolean(role.permissions & PERMISSIONS.ADMINISTRATOR))

  async function handleMessage() {
    if (!user?.id || actionLoading) return
    setActionLoading("message")
    try {
      await openDmChannel(user.id, router, toast)
    } catch (error) {
      console.error("Failed to open DM:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while opening DM",
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAddFriend() {
    if (!user?.username || actionLoading) return
    setActionLoading("friend")
    try {
      await sendFriendRequest(user.username, toast)
      setFriendshipStatus("pending_sent")
    } catch (error) {
      console.error("Failed to send friend request:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while adding friend",
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRemoveFriend() {
    if (!friendshipId || actionLoading) return
    setActionLoading("friend")
    try {
      const res = await fetch(`/api/friends?id=${friendshipId}`, { method: "DELETE" })
      const json = await res.json()
      if (res.ok) {
        toast({ title: "Friend removed" })
        setFriendshipStatus("none")
        setFriendshipId(null)
      } else {
        toast({ variant: "destructive", title: json.error || "Failed to remove friend" })
      }
    } catch (error) {
      console.error("Failed to remove friend:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while removing friend",
      })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="w-80 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
      <div
        className="h-24 relative bg-primary/20"
        style={bannerColor ? { "--profile-banner-color": bannerColor } as CSSProperties : undefined}
      >
        {bannerColor && <div className="absolute inset-0 bg-[var(--profile-banner-color)]" />}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-background/70 text-foreground hover:bg-background transition-colors"
          aria-label="Close profile"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 -mt-10 relative">
        <Avatar className="w-20 h-20 ring-4 ring-card">
          {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 pt-2 pb-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-foreground truncate">{displayName}</h3>
              {isAdmin && (
                <Shield className="w-4 h-4 text-primary" />
              )}
            </div>
            {user?.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
          </div>

          {isOtherUser && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleMessage}
                disabled={actionLoading === "message"}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Message
              </button>
              {friendshipStatus === "friends" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={actionLoading === "friend"}
                      className="px-3 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                      aria-label="Remove friend"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Friend</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove {user?.display_name || user?.username || displayName} from your friends?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRemoveFriend}
                        className="bg-destructive text-destructive-foreground hover:opacity-90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <button
                  type="button"
                  onClick={handleAddFriend}
                  disabled={actionLoading === "friend" || friendshipStatus === "pending_sent"}
                  className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted disabled:opacity-50"
                  aria-label={friendshipStatus === "pending_sent" ? "Friend request sent" : "Add friend"}
                  title={friendshipStatus === "pending_sent" ? "Friend request sent" : "Add friend"}
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <section className="rounded-xl bg-secondary/60 p-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-1.5">STATUS</h4>
            <p className="text-sm text-foreground">{getStatusLabel(status)}</p>
            {customStatus && <p className="text-sm text-muted-foreground mt-1">{customStatus}</p>}
          </section>

          {user?.bio && (
            <section className="rounded-xl bg-secondary/60 p-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-1.5">ABOUT ME</h4>
              <p className="text-sm text-foreground leading-relaxed">{user.bio}</p>
            </section>
          )}

          <section className="rounded-xl bg-secondary/60 p-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-1.5">MEMBER SINCE</h4>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              {joined}
            </div>
          </section>

          {roles.length > 0 && (
            <section className="rounded-xl bg-secondary/60 p-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">ROLES</h4>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-secondary-foreground"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    {role.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Interests / Tags */}
          {(user?.interests && user.interests.length > 0) && (
            <section className="rounded-xl bg-secondary/60 p-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">INTERESTS</h4>
              <ProfileInterestTags tags={user.interests} />
            </section>
          )}

          {/* Pinned Items */}
          {user?.id && (
            <section className="rounded-xl bg-secondary/60 p-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">PINNED</h4>
              <ProfilePinnedItems userId={user.id} />
            </section>
          )}

          {/* Recent Activity */}
          {user?.id && (
            <section className="rounded-xl bg-secondary/60 p-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">RECENT ACTIVITY</h4>
              <ProfileActivity userId={user.id} />
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
