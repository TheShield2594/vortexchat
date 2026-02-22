"use client"

import { useEffect, useState, useCallback } from "react"
import { format } from "date-fns"
import { Shield, UserX, Ban, Loader2 } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

interface AuditEntry {
  id: string
  action: string
  reason: string | null
  created_at: string
  metadata: any
  actor: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null
  target: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  kick: <UserX className="w-4 h-4" style={{ color: "#f0b132" }} />,
  ban: <Ban className="w-4 h-4" style={{ color: "#f23f43" }} />,
  unban: <Shield className="w-4 h-4" style={{ color: "#23a55a" }} />,
}

const ACTION_LABELS: Record<string, string> = {
  kick: "Kicked",
  ban: "Banned",
  unban: "Unbanned",
}

export function AuditLogViewer({ serverId }: { serverId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const fetchEntries = useCallback(async (before?: string) => {
    const url = `/api/servers/${serverId}/audit-log` + (before ? `?before=${encodeURIComponent(before)}` : "")
    const res = await fetch(url)
    if (!res.ok) return []
    return res.json() as Promise<AuditEntry[]>
  }, [serverId])

  useEffect(() => {
    fetchEntries().then((data) => {
      setEntries(data)
      setHasMore(data.length === 50)
      setLoading(false)
    })
  }, [fetchEntries])

  async function loadMore() {
    if (!entries.length || loadingMore) return
    setLoadingMore(true)
    const data = await fetchEntries(entries[entries.length - 1].created_at)
    setEntries((prev) => [...prev, ...data])
    setHasMore(data.length === 50)
    setLoadingMore(false)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: "#949ba4" }} /></div>
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "#949ba4" }}>
        <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No audit log entries yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 max-h-96 overflow-y-auto">
      {entries.map((entry) => {
        const actorName = entry.actor?.display_name || entry.actor?.username || "Unknown"
        const targetName = entry.target?.display_name || entry.target?.username || "Unknown"
        const label = ACTION_LABELS[entry.action] ?? entry.action

        return (
          <div
            key={entry.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded"
            style={{ background: "#2b2d31" }}
          >
            <div className="flex-shrink-0 mt-0.5">
              {ACTION_ICONS[entry.action] ?? <Shield className="w-4 h-4" style={{ color: "#949ba4" }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">
                <span className="font-semibold" style={{ color: "#00b0f4" }}>{actorName}</span>
                {" "}{label}{" "}
                <span className="font-semibold text-white">{targetName}</span>
              </p>
              {entry.reason && (
                <p className="text-xs mt-0.5" style={{ color: "#949ba4" }}>Reason: {entry.reason}</p>
              )}
            </div>
            <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: "#4e5058" }}>
              {format(new Date(entry.created_at), "MMM d, h:mm a")}
            </span>
          </div>
        )
      })}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full text-center text-sm py-2 rounded transition-colors hover:bg-white/5"
          style={{ color: "#949ba4" }}
        >
          {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Load more"}
        </button>
      )}
    </div>
  )
}
