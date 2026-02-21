"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, AtSign, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Mode = "all" | "mentions" | "muted"

interface Props {
  open: boolean
  onClose: () => void
  serverId?: string
  channelId?: string
  label: string
}

const OPTIONS: { mode: Mode; label: string; description: string; icon: React.ReactNode }[] = [
  { mode: "all", label: "All Messages", description: "Notify for every message", icon: <Bell className="w-4 h-4" /> },
  { mode: "mentions", label: "Mentions Only", description: "Only notify when @mentioned", icon: <AtSign className="w-4 h-4" /> },
  { mode: "muted", label: "Muted", description: "No notifications", icon: <BellOff className="w-4 h-4" /> },
]

export function NotificationSettingsModal({ open, onClose, serverId, channelId, label }: Props) {
  const [mode, setMode] = useState<Mode>("all")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const param = serverId ? `serverId=${serverId}` : `channelId=${channelId}`
    fetch(`/api/notification-settings?${param}`)
      .then((r) => r.json())
      .then((d) => { setMode(d.mode ?? "all"); setLoading(false) })
  }, [open, serverId, channelId])

  async function save(newMode: Mode) {
    setMode(newMode)
    setSaving(true)
    await fetch("/api/notification-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, channelId, mode: newMode }),
    })
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "#313338", borderColor: "#1e1f22" }} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Notification Settings</DialogTitle>
          <p className="text-sm" style={{ color: "#949ba4" }}>{label}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin" style={{ color: "#949ba4" }} /></div>
        ) : (
          <div className="space-y-2 pt-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => save(opt.mode)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
                style={{
                  background: mode === opt.mode ? "rgba(88,101,242,0.15)" : "#2b2d31",
                  border: mode === opt.mode ? "1px solid #5865f2" : "1px solid transparent",
                }}
              >
                <span style={{ color: mode === opt.mode ? "#5865f2" : "#949ba4" }}>{opt.icon}</span>
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs" style={{ color: "#949ba4" }}>{opt.description}</p>
                </div>
                {saving && mode === opt.mode && <Loader2 className="w-4 h-4 animate-spin ml-auto" style={{ color: "#5865f2" }} />}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
