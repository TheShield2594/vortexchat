"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, Hash, AtSign, UserPlus, X } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
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
  variant?: "icon" | "sidebar"
}

export function NotificationBell({ userId, variant = "icon" }: Props) {
  const [supabase] = useState(() => createClientSupabaseClient())
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  // Sync unread count to Zustand store (consumed by useTabUnreadTitle)
  useEffect(() => {
    useAppStore.getState().setNotificationUnreadCount(unreadCount)
  }, [unreadCount])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",")

    const getFocusable = () =>
      panel
        ? (Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
          ))
        : []

    const firstFocusable = getFocusable()[0]
    ;(firstFocusable ?? panel)?.focus()

    function handlePanelKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        return
      }

      if (event.key !== "Tab") return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        panel?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handlePanelKeys)
    return () => {
      document.removeEventListener("keydown", handlePanelKeys)
      triggerRef.current?.focus()
    }
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

  async function handleClick(n: Notification) {
    markRead(n.id)
    if (n.server_id && n.channel_id) {
      const params = new URLSearchParams()

      if (n.message_id) {
        params.set("message", n.message_id)
        try {
          const { data: message } = await supabase
            .from("messages")
            .select("thread_id")
            .eq("id", n.message_id)
            .maybeSingle()

          const threadId = message?.thread_id
          if (threadId) params.set("thread", threadId)
        } catch (error) {
          console.error("Failed to resolve thread context from notification", error)
        }
      }

      const query = params.toString()
      router.push(`/channels/${n.server_id}/${n.channel_id}${query ? `?${query}` : ""}`)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Bell button */}
      {variant === "sidebar" ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className="relative flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-white/10 focus-ring"
          title="Inbox"
          aria-label="Open inbox"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Inbox
          </span>
          {unreadCount > 0 && (
            <span
              className="min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold flex items-center justify-center"
              style={{ background: "var(--theme-danger)", color: "white" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className="relative w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-ring"
          style={{ color: open ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}
          title="Notifications"
          aria-label="Open notifications"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-xs font-bold px-0.5"
              style={{ background: "var(--theme-danger)", color: "white", fontSize: "10px" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Notifications inbox"
          tabIndex={-1}
          className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--theme-bg-tertiary)" }}>
            <span className="text-sm font-semibold text-white">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs transition-colors hover:text-white focus-ring rounded px-1"
                  style={{ color: "var(--theme-text-muted)" }}
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="h-6 w-6 inline-flex items-center justify-center rounded transition-colors hover:bg-white/10 focus-ring tertiary-metadata"
                title="Close notifications"
                aria-label="Close notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell className="w-8 h-8 tertiary-metadata" />
                <p className="text-sm tertiary-metadata">All caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 border-b transition-colors hover:bg-white/5"
                  style={{ borderColor: "var(--theme-bg-tertiary)", background: n.read ? "transparent" : "rgba(88,101,242,0.05)" }}
                  role="group"
                  aria-label={`Notification: ${n.title}`}
                >
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className="flex flex-1 min-w-0 items-start gap-3 text-left rounded-sm focus-ring"
                    aria-label={`Open notification: ${n.title}`}
                  >
                    {/* Type icon */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                      style={{ background: n.read ? "var(--theme-surface-input)" : "var(--theme-accent)", color: "white" }}
                    >
                      {TYPE_ICONS[n.type]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: n.read ? "var(--theme-text-secondary)" : "var(--theme-text-primary)" }}>{n.title}</p>
                      {n.body && (
                        <p className="text-xs truncate mt-0.5 tertiary-metadata">{n.body}</p>
                      )}
                      <p className="text-xs mt-0.5 tertiary-metadata">
                        {format(new Date(n.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    {!n.read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 focus-ring"
                        style={{ color: "var(--theme-text-muted)" }}
                        title={`Mark "${n.title}" as read`}
                        aria-label={`Mark "${n.title}" as read`}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 focus-ring tertiary-metadata"
                      title={`Dismiss "${n.title}" notification`}
                      aria-label={`Dismiss "${n.title}" notification`}
                    >
                      <X className="w-3 h-3" />
                    </button>
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
