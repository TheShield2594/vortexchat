"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, BellOff, Volume2, VolumeX, Moon } from "lucide-react"
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
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  quiet_hours_timezone: string
}

type BooleanSettingKey = "mention_notifications" | "reply_notifications" | "friend_request_notifications" | "server_invite_notifications" | "system_notifications" | "sound_enabled" | "quiet_hours_enabled"

const SETTING_LABELS: { key: BooleanSettingKey; label: string; description: string }[] = [
  { key: "mention_notifications", label: "Mentions", description: "When someone @mentions you in a channel" },
  { key: "reply_notifications", label: "Replies", description: "When someone replies to your message" },
  { key: "friend_request_notifications", label: "Friend Requests", description: "When you receive a new friend request" },
  { key: "server_invite_notifications", label: "Server Invites", description: "When you're invited to a server" },
  { key: "system_notifications", label: "System", description: "VortexChat announcements and updates" },
  { key: "sound_enabled", label: "Notification Sounds", description: "Play a sound when you receive a notification" },
]

const DEFAULT_SETTINGS: NotificationSettingsRow = {
  mention_notifications: true,
  reply_notifications: true,
  friend_request_notifications: true,
  server_invite_notifications: true,
  system_notifications: true,
  sound_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
}

// localStorage key kept for sound_enabled cross-component sync
const soundStorageKey = (userId: string) => `vortexchat:notif-sound:${userId}`

export function NotificationsSettingsPage({ userId }: Props) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<NotificationSettingsRow>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data === "object") {
          const validated = { ...DEFAULT_SETTINGS }
          for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof NotificationSettingsRow)[]) {
            if (typeof data[key] === "boolean") validated[key] = data[key] as boolean
          }
          setSettings(validated)
          // Keep sound pref in localStorage for use-notification-sound hook
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(soundStorageKey(userId), String(validated.sound_enabled))
            } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {
        // Fall back to localStorage if API unavailable
        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage.getItem(`vortexchat:notif-prefs:${userId}`)
            if (stored) {
              const parsed = JSON.parse(stored) as Record<string, unknown>
              const validated = { ...DEFAULT_SETTINGS }
              for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof NotificationSettingsRow)[]) {
                if (typeof parsed[key] === "boolean") validated[key] = parsed[key] as boolean
              }
              setSettings(validated)
            }
          } catch { /* ignore */ }
        }
      })
      .finally(() => setLoading(false))
  }, [userId])

  const persistSetting = useCallback(async (next: NotificationSettingsRow) => {
    setSaving(true)
    try {
      await fetch("/api/user/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
      // Mirror sound setting to localStorage so use-notification-sound hook picks it up
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(soundStorageKey(userId), String(next.sound_enabled))
          // Dispatch storage event so cross-tab hook reacts
          window.dispatchEvent(new StorageEvent("storage", {
            key: soundStorageKey(userId),
            newValue: String(next.sound_enabled),
          }))
        } catch { /* ignore */ }
      }
    } catch {
      toast({ title: "Failed to save preference", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }, [userId, toast])

  function handleToggle(key: BooleanSettingKey) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    void persistSetting(next)
  }

  function muteAll() {
    const next: NotificationSettingsRow = {
      ...settings,
      mention_notifications: false,
      reply_notifications: false,
      friend_request_notifications: false,
      server_invite_notifications: false,
      system_notifications: false,
      sound_enabled: false,
    }
    setSettings(next)
    void persistSetting(next)
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
          disabled={saving}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all disabled:opacity-50"
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
                disabled={saving}
                className="relative w-10 h-6 rounded-full transition-all focus-ring disabled:opacity-50"
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

      {/* ── Quiet hours ────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Quiet Hours
        </h2>
        <p className="text-xs mb-2" style={{ color: "var(--theme-text-muted)" }}>
          Suppress push notifications during a scheduled window each day.
        </p>

        {/* Enable toggle */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <div className="flex items-center gap-3">
            <Moon className="w-4 h-4" style={{ color: settings.quiet_hours_enabled ? "var(--theme-accent)" : "var(--theme-text-muted)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>Enable quiet hours</p>
              <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Notifications will be silenced during the scheduled window</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggle("quiet_hours_enabled")}
            disabled={saving}
            className="relative w-10 h-6 rounded-full transition-all focus-ring disabled:opacity-50"
            style={{ background: settings.quiet_hours_enabled ? "var(--theme-accent)" : "var(--theme-bg-tertiary)" }}
            role="switch"
            aria-checked={settings.quiet_hours_enabled}
            aria-label="Enable quiet hours"
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
              style={{ transform: settings.quiet_hours_enabled ? "translateX(16px)" : "translateX(0)" }}
            />
          </button>
        </div>

        {/* Time pickers — only shown when enabled */}
        {settings.quiet_hours_enabled && (
          <div
            className="grid grid-cols-2 gap-3 px-4 py-3 rounded-lg"
            style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
          >
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Start</span>
              <input
                type="time"
                value={settings.quiet_hours_start}
                onChange={(e) => {
                  const next = { ...settings, quiet_hours_start: e.target.value }
                  setSettings(next)
                  void persistSetting(next)
                }}
                className="w-full rounded px-2 py-1.5 text-sm focus-ring"
                style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-bright)", border: "1px solid var(--theme-bg-tertiary)" }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>End</span>
              <input
                type="time"
                value={settings.quiet_hours_end}
                onChange={(e) => {
                  const next = { ...settings, quiet_hours_end: e.target.value }
                  setSettings(next)
                  void persistSetting(next)
                }}
                className="w-full rounded px-2 py-1.5 text-sm focus-ring"
                style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-bright)", border: "1px solid var(--theme-bg-tertiary)" }}
              />
            </label>
            <div className="col-span-2">
              <label className="space-y-1">
                <span className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Timezone</span>
                <select
                  value={settings.quiet_hours_timezone}
                  onChange={(e) => {
                    const next = { ...settings, quiet_hours_timezone: e.target.value }
                    setSettings(next)
                    void persistSetting(next)
                  }}
                  className="w-full rounded px-2 py-1.5 text-sm focus-ring"
                  style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-bright)", border: "1px solid var(--theme-bg-tertiary)" }}
                >
                  {Intl.supportedValuesOf?.("timeZone")?.map((tz: string) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  )) ?? (
                    <option value={settings.quiet_hours_timezone}>{settings.quiet_hours_timezone}</option>
                  )}
                </select>
              </label>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
        Per-server and per-channel notification overrides can be set by right-clicking on servers and channels.
        Preferences sync across all your devices.
      </p>
    </div>
  )
}
