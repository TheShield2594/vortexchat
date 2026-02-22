"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, Hash, AtSign, UserPlus, X } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { format } from "date-fns"

interface Notification {
  id: string
  type: "mention" | "reply" | "friend_request" | "server_invite" | "system"
  title: string
  body: string | null
  icon_url: string | null
  server_id: string | null
  channel_id: string | null
  message_id: string | null
  read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  mention: <AtSign className="w-3.5 h-3.5" />,
  reply: <Hash className="w-3.5 h-3.5" />,
  friend_request: <UserPlus className="w-3.5 h-3.5" />,
  server_invite: <Hash className="w-3.5 h-3.5" />,
  system: <Bell className="w-3.5 h-3.5" />,
}

interface Props {
  userId: string
}

export function NotificationBell({ userId }: Props) {
  const [supabase] = useState(() => createClientSupabaseClient())
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30)
    if (data) {
      setNotifications(data as Notification[])
      setUnreadCount(data.filter((n) => !n.read).length)
    }
  }, [userId, supabase])

  useEffect(() => { loadNotifications() }, [loadNotifications])

  // Real-time: listen for new notifications
  useEffect(() => {
    const ch = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification
          setNotifications((prev) => [n, ...prev.slice(0, 29)])
          setUnreadCount((c) => c + 1)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, supabase])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function dismiss(id: string) {
    await supabase.from("notifications").delete().eq("id", id)
    setNotifications((prev) => {
      const n = prev.find((x) => x.id === id)
      if (n && !n.read) setUnreadCount((c) => Math.max(0, c - 1))
      return prev.filter((x) => x.id !== id)
    })
  }

  function handleClick(n: Notification) {
    markRead(n.id)
    if (n.server_id && n.channel_id) {
      router.push(`/channels/${n.server_id}/${n.channel_id}`)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
        style={{ color: open ? "#f2f3f5" : "#949ba4" }}
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-xs font-bold px-0.5"
            style={{ background: "#f23f43", color: "white", fontSize: "10px" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#1e1f22" }}>
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs transition-colors hover:text-white"
                style={{ color: "#949ba4" }}
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell className="w-8 h-8" style={{ color: "#4e5058" }} />
                <p className="text-sm" style={{ color: "#949ba4" }}>All caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 border-b transition-colors cursor-pointer hover:bg-white/5"
                  style={{ borderColor: "#1e1f22", background: n.read ? "transparent" : "rgba(88,101,242,0.05)" }}
                  onClick={() => handleClick(n)}
                >
                  {/* Type icon */}
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: n.read ? "#383a40" : "#5865f2", color: "white" }}
                  >
                    {TYPE_ICONS[n.type]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: n.read ? "#b5bac1" : "#f2f3f5" }}>{n.title}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                            style={{ color: "#949ba4" }}
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                          style={{ color: "#4e5058" }}
                          title="Dismiss"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {n.body && (
                      <p className="text-xs truncate mt-0.5" style={{ color: "#949ba4" }}>{n.body}</p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: "#4e5058" }}>
                      {format(new Date(n.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
