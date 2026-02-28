"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MessageSquare, UserPlus } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import type { RoleRow } from "@/types/database"
import { getStatusColor, getStatusLabel } from "@/lib/presence-status"

interface UserProfileData {
  username: string
  display_name: string | null
  avatar_url: string | null
  status_message: string | null
  bio: string | null
  banner_color: string | null
  custom_tag: string | null
}

interface UserProfilePopoverProps {
  user: UserProfileData | null
  userId?: string
  currentUserId?: string
  displayName: string
  status?: string
  roles?: RoleRow[]
  side?: "left" | "right" | "top" | "bottom"
  align?: "start" | "center" | "end"
  children: React.ReactNode
}


/** Popover card showing a user's profile (avatar, name, status, bio, roles) with optional Message and Add Friend actions. */
export function UserProfilePopover({
  user,
  userId,
  currentUserId,
  displayName,
  status,
  roles = [],
  side = "left",
  align = "start",
  children,
}: UserProfilePopoverProps) {
  const initials = displayName.slice(0, 2).toUpperCase()
  const showActions = userId && currentUserId && userId !== currentUserId
  const router = useRouter()
  const { toast } = useToast()
  const [actionLoading, setActionLoading] = useState<"message" | "friend" | null>(null)

  async function handleMessage() {
    if (!userId || actionLoading) return
    setActionLoading("message")
    try {
      const res = await fetch("/api/dm/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      })
      const payload = await res.json().catch(() => ({ error: "Failed to open DM" })) as { id?: string; error?: string }
      if (res.ok && payload.id) {
        router.push(`/channels/me/${payload.id}`)
      } else {
        toast({ variant: "destructive", title: payload.error || "Failed to open DM" })
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to open DM" })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAddFriend() {
    if (!user?.username || actionLoading) return
    setActionLoading("friend")
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username }),
      })
      const json = await res.json()
      if (res.ok) {
        toast({ title: json.message })
      } else {
        toast({ variant: res.status === 409 ? "default" : "destructive", title: json.error || json.message })
      }
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
        style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-bg-tertiary)" }}
      >
        {/* Banner */}
        <div
          className="h-16"
          style={{ background: user?.banner_color ?? "var(--theme-accent)" }}
        />

        {/* Avatar + Info */}
        <div className="px-3 pb-3">
          <div className="relative -mt-6 mb-2">
            <Avatar className="w-14 h-14 ring-4" style={{ "--tw-ring-color": "var(--theme-bg-secondary)" } as React.CSSProperties}>
              {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
              <AvatarFallback
                style={{ background: "var(--theme-accent)", color: "white", fontSize: "18px" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px]"
              style={{
                background: getStatusColor(status),
                borderColor: "#232428",
              }}
            />
          </div>

          {/* Name */}
          <div className="font-bold text-white text-base">{displayName}</div>
          <div className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>
            {user?.username}
          </div>
          {user?.custom_tag && (
            <div className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
              {user.custom_tag}
            </div>
          )}

          {/* Divider */}
          <div className="my-2 border-t" style={{ borderColor: "var(--theme-bg-tertiary)" }} />

          {/* Status */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: getStatusColor(status) }}
            />
            <span className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>
              {getStatusLabel(status)}
            </span>
          </div>

          {user?.status_message && (
            <div className="text-xs mb-2" style={{ color: "var(--theme-text-normal)" }}>
              {user.status_message}
            </div>
          )}

          {/* Bio */}
          {user?.bio && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--theme-text-secondary)" }}>
                About Me
              </div>
              <div className="text-sm" style={{ color: "var(--theme-text-normal)" }}>
                {user.bio}
              </div>
            </>
          )}

          {/* Roles */}
          {roles.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: "var(--theme-text-secondary)" }}>
                Roles
              </div>
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "var(--theme-bg-tertiary)", color: role.color || "var(--theme-text-normal)" }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: role.color || "var(--theme-text-normal)" }}
                    />
                    {role.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Action buttons */}
          {showActions && (
            <>
              <div className="my-2 border-t" style={{ borderColor: "var(--theme-bg-tertiary)" }} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={actionLoading === "message"}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors hover:brightness-125 disabled:opacity-50"
                  style={{ background: "var(--theme-accent)", color: "white" }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </button>
                <button
                  type="button"
                  onClick={handleAddFriend}
                  disabled={actionLoading === "friend"}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors hover:brightness-125 disabled:opacity-50"
                  style={{ background: "var(--theme-success)", color: "white" }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Friend
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
