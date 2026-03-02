"use client"

import { useState, useEffect } from "react"
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Props {
  userId: string
}

type NotificationSettingsRow = {
  mention_notifications: boolean
  reply_notifications: boolean
  friend_request_notifications: boolean
  server_invite_notifications: boolean
  system_notifications: boolean
  sound_enabled: boolean
}

const SETTING_LABELS: { key: keyof NotificationSettingsRow; label: string; description: string }[] = [
  { key: "mention_notifications", label: "Mentions", description: "When someone @mentions you in a channel" },
  { key: "reply_notifications", label: "Replies", description: "When someone replies to your message" },
  { key: "friend_request_notifications", label: "Friend Requests", description: "When you receive a new friend request" },
  { key: "server_invite_notifications", label: "Server Invites", description: "When you're invited to a server" },
  { key: "system_notifications", label: "System", description: "VortexChat announcements and updates" },
  { key: "sound_enabled", label: "Notification Sounds", description: "Play a sound when you receive a notification" },
]

export function NotificationsSettingsPage({ userId }: Props) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<NotificationSettingsRow>({
    mention_notifications: true,
    reply_notifications: true,
    friend_request_notifications: true,
    server_invite_notifications: true,
    system_notifications: true,
    sound_enabled: true,
  })
  const [loading, setLoading] = useState(true)

  const STORAGE_KEY = `vortexchat:notif-prefs:${userId}`

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored) setSettings(JSON.parse(stored) as NotificationSettingsRow)
      } catch {
        // ignore parse errors
      }
    }
    setLoading(false)
  }, [STORAGE_KEY])

  function saveToStorage(next: NotificationSettingsRow) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  }

  function handleToggle(key: keyof NotificationSettingsRow) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    saveToStorage(next)
  }

  function muteAll() {
    const next: NotificationSettingsRow = {
      mention_notifications: false,
      reply_notifications: false,
      friend_request_notifications: false,
      server_invite_notifications: false,
      system_notifications: false,
      sound_enabled: false,
    }
    setSettings(next)
    saveToStorage(next)
    toast({ title: "All notifications muted" })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20" />
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
            Notifications
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--theme-text-muted)" }}>
            Control which notifications you receive and how they're delivered.
          </p>
        </div>
        <button
          type="button"
          onClick={muteAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all"
          style={{
            background: "rgba(242,63,67,0.1)",
            color: "var(--theme-danger)",
            border: "1px solid rgba(242,63,67,0.25)",
          }}
        >
          <BellOff className="w-4 h-4" />
          Mute all
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Notification Types
        </h2>

        {SETTING_LABELS.map(({ key, label, description }) => {
          const enabled = settings[key]
          const isSound = key === "sound_enabled"
          return (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-3 rounded-lg"
              style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
            >
              <div className="flex items-center gap-3">
                {isSound
                  ? (enabled ? <Volume2 className="w-4 h-4" style={{ color: "var(--theme-accent)" }} /> : <VolumeX className="w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />)
                  : (enabled ? <Bell className="w-4 h-4" style={{ color: "var(--theme-accent)" }} /> : <BellOff className="w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />)
                }
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{label}</p>
                  <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{description}</p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                onClick={() => handleToggle(key)}
                className="relative w-10 h-6 rounded-full transition-all focus-ring"
                style={{ background: enabled ? "var(--theme-accent)" : "var(--theme-bg-tertiary)" }}
                role="switch"
                aria-checked={enabled}
                aria-label={`${label} notifications`}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: enabled ? "translateX(16px)" : "translateX(0)" }}
                />
              </button>
            </div>
          )
        })}
      </section>

      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
        Per-server and per-channel notification overrides can be set by right-clicking on servers and channels.
      </p>
    </div>
  )
}
