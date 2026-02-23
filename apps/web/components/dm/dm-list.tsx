"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Users, Plus } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { format, isToday } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"

interface DMChannel {
  id: string
  name: string | null
  icon_url: string | null
  is_group: boolean
  updated_at: string
  is_unread: boolean
  latest_message: { content: string; created_at: string } | null
  partner: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    status: string
  } | null
  members: Array<{
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }>
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d")
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "#23a55a",
    idle: "#f0b132",
    dnd: "#f23f43",
    offline: "#80848e",
    invisible: "#80848e",
  }
  return (
    <span
      className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
      style={{ background: colors[status] ?? "#80848e", borderColor: "#2b2d31" }}
    />
  )
}

export function DMList({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [channels, setChannels] = useState<DMChannel[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClientSupabaseClient()

  const fetchChannels = useCallback(async () => {
    const res = await fetch("/api/dm/channels")
    if (res.ok) {
      const data = await res.json()
      setChannels(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Refresh list when new DMs arrive (via postgres_changes on direct_messages)
  useEffect(() => {
    const ch = supabase
      .channel("dm-list-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => fetchChannels()
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, fetchChannels])

  async function startDM(friendId: string) {
    const res = await fetch("/api/dm/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [friendId] }),
    })
    if (res.ok) {
      const { id } = await res.json()
      router.push(`/channels/me/${id}`)
      onNavigate?.()
      fetchChannels()
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col px-2 pt-3">
        <Skeleton className="mb-3 h-3 w-28" />
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-md px-2 py-1.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#949ba4" }}>
          Direct Messages
        </span>
        <button
          className="w-4 h-4 hover:text-white transition-colors"
          style={{ color: "#949ba4" }}
          title="New DM"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {channels.length === 0 && (
          <div className="px-2 py-4">
            <BrandedEmptyState
              icon={Users}
              title="Your DMs are quiet"
              description="Start a new conversation to see your messages, status updates, and call history here."
              hint="Tip: Right-click a member and choose Message to open a DM."
            />
          </div>
        )}
        {channels.map((ch) => {
          const isActive = pathname === `/channels/me/${ch.id}`
          const displayName = ch.is_group
            ? (ch.name || ch.members.map((m) => m.display_name || m.username).join(", "))
            : (ch.partner?.display_name || ch.partner?.username || "Unknown")
          const initials = displayName.slice(0, 2).toUpperCase()

          return (
            <button
              key={ch.id}
              onClick={() => { router.push(`/channels/me/${ch.id}`); onNavigate?.() }}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/5 text-gray-400 hover:text-gray-200"
              )}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {ch.is_group ? (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "#5865f2" }}
                  >
                    <Users className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <Avatar className="w-8 h-8">
                    {ch.partner?.avatar_url && <AvatarImage src={ch.partner.avatar_url} />}
                    <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "11px" }}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                )}
                {!ch.is_group && ch.partner && (
                  <StatusDot status={ch.partner.status} />
                )}
              </div>

              {/* Name + preview */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn("text-sm font-medium truncate", ch.is_unread && !isActive ? "text-white" : "")}
                  >
                    {displayName}
                  </span>
                  {ch.latest_message && (
                    <span className="text-xs flex-shrink-0" style={{ color: "#4e5058" }}>
                      {formatTime(ch.latest_message.created_at)}
                    </span>
                  )}
                </div>
                {ch.latest_message && (
                  <p className="text-xs truncate" style={{ color: "#949ba4" }}>
                    {ch.latest_message.content}
                  </p>
                )}
              </div>

              {/* Unread dot */}
              {ch.is_unread && !isActive && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "white" }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
