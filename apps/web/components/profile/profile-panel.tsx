"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { Calendar, MessageSquare, Shield, UserPlus, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { openDmChannel, sendFriendRequest } from "@/lib/social-actions"
import type { RoleRow } from "@/types/database"

interface ProfileUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  banner_color: string | null
  status_message: string | null
  created_at?: string
}

interface ProfilePanelProps {
  user: ProfileUser | null
  displayName: string
  status?: string
  roles?: RoleRow[]
  currentUserId?: string
  onClose: () => void
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "online": return "Online"
    case "idle": return "Idle"
    case "dnd": return "Do Not Disturb"
    case "invisible": return "Invisible"
    default: return "Offline"
  }
}

function getJoinedDate(rawDate?: string) {
  if (!rawDate) return "Unknown"
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return new Intl.DateTimeFormat("en-US", {
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
  const initials = displayName.slice(0, 2).toUpperCase()
  const isOtherUser = Boolean(user?.id && currentUserId && user.id !== currentUserId)
  const joined = useMemo(() => getJoinedDate(user?.created_at), [user?.created_at])

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

  return (
    <div className="w-80 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
      <div
        className="h-24 relative bg-primary/20"
        style={user?.banner_color ? { "--profile-banner-color": user.banner_color } as CSSProperties : undefined}
      >
        {user?.banner_color && <div className="absolute inset-0 bg-[var(--profile-banner-color)]" />}
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
              {roles.some((role) => role.name.toLowerCase() === "admin" || role.name.toLowerCase() === "administrator") && (
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
              <button
                type="button"
                onClick={handleAddFriend}
                disabled={actionLoading === "friend"}
                className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted disabled:opacity-50"
                aria-label="Add friend"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          )}

          <section className="rounded-xl bg-secondary/60 p-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-1.5">STATUS</h4>
            <p className="text-sm text-foreground">{getStatusLabel(status)}</p>
            {user?.status_message && <p className="text-sm text-muted-foreground mt-1">{user.status_message}</p>}
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
        </div>
      </ScrollArea>
    </div>
  )
}
