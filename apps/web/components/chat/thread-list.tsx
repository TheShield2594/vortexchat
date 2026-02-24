"use client"

import { useEffect, useState } from "react"
import { MessageSquare, ChevronDown, ChevronRight, Archive, Lock } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import type { ThreadRow } from "@/types/database"
import { useRealtimeThreads } from "@/hooks/use-realtime-threads"
import { cn } from "@/lib/utils/cn"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  channelId: string
  activeThreadId: string | null
  filter: "all" | "active" | "archived"
  onSelectThread: (thread: ThreadRow) => void
}

export function ThreadList({ channelId, activeThreadId, filter, onSelectThread }: Props) {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [archivedThreads, setArchivedThreads] = useState<ThreadRow[]>([])
  const [expanded, setExpanded] = useState(true)
  const [loadingArchived, setLoadingArchived] = useState(false)
  const shouldShowArchived = showArchived || filter === "archived"

  // Load active threads
  useEffect(() => {
    fetch(`/api/threads?channelId=${channelId}&archived=false`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setThreads(data) })
  }, [channelId])

  // Load archived threads on demand
  useEffect(() => {
    if (!shouldShowArchived) return
    setLoadingArchived(true)
    fetch(`/api/threads?channelId=${channelId}&archived=true`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setArchivedThreads(data)
        setLoadingArchived(false)
      })
      .catch(() => setLoadingArchived(false))
  }, [shouldShowArchived, channelId, filter])

  // Realtime updates
  useRealtimeThreads(
    channelId,
    (newThread) => {
      if (!newThread.archived) {
        setThreads((prev) => {
          if (prev.some((t) => t.id === newThread.id)) return prev
          return [newThread, ...prev]
        })
      }
    },
    (updatedThread) => {
      if (updatedThread.archived) {
        // Move from active to archived
        setThreads((prev) => prev.filter((t) => t.id !== updatedThread.id))
        setArchivedThreads((prev) => {
          const without = prev.filter((t) => t.id !== updatedThread.id)
          return [updatedThread, ...without]
        })
      } else {
        // Update in place or move back from archived
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.id === updatedThread.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updatedThread
            return next
          }
          return [updatedThread, ...prev]
        })
        setArchivedThreads((prev) => prev.filter((t) => t.id !== updatedThread.id))
      }
    }
  )

  const visibleThreads = filter === "archived" ? [] : threads
  const visibleArchivedThreads = filter === "active" ? [] : archivedThreads
  const shouldAllowArchivedToggle = filter !== "active"

  if (visibleThreads.length === 0 && !shouldShowArchived) {
    return null
  }

  return (
    <div
      className="border-t mx-0"
      style={{ borderColor: "#1e1f22" }}
    >
      {/* Section header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-white/5 transition-colors"
        style={{ color: "#949ba4" }}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <MessageSquare className="w-3 h-3" />
        Channel threads
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-xs"
          style={{ background: "#4e5058", color: "#dcddde" }}
        >
          {threads.length}
        </span>
      </button>

      {expanded && (
        <>
          <div className="px-4 pb-1 text-[11px]" style={{ color: "#6d6f78" }}>
            Each thread belongs to this channel and re-opens in the thread panel.
          </div>
          {visibleThreads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onClick={() => onSelectThread(thread)}
            />
          ))}

          {shouldAllowArchivedToggle && (
            <button
              type="button"
              onClick={() => setShowArchived((s) => !s)}
              className="flex items-center gap-2 w-full px-4 py-1.5 text-xs hover:bg-white/5 transition-colors"
              style={{ color: "#6d6f78" }}
            >
              <Archive className="w-3 h-3" />
              {showArchived ? "Hide archived" : "Show archived threads"}
            </button>
          )}

          {shouldShowArchived && (
            <>
              {loadingArchived ? (
                <div className="space-y-2 px-4 py-2">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-11/12" />
                </div>
              ) : (
                visibleArchivedThreads.map((thread) => (
                  <ThreadListItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => onSelectThread(thread)}
                  />
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function ThreadListItem({
  thread,
  isActive,
  onClick,
}: {
  thread: ThreadRow
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-4 py-1.5 text-sm text-left transition-colors rounded-sm mx-1",
        isActive ? "bg-white/10" : "hover:bg-white/5"
      )}
      style={{ maxWidth: "calc(100% - 8px)" }}
    >
      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#949ba4" }} />
      <span
        className="truncate flex-1"
        style={{ color: isActive ? "#f2f3f5" : "#b5bac1" }}
      >
        {thread.name}
      </span>
      {thread.locked && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: "#f23f43" }} />}
      {thread.archived && <Archive className="w-3 h-3 flex-shrink-0" style={{ color: "#ed9c28" }} />}
      <span
        className="text-xs flex-shrink-0 ml-auto"
        style={{ color: "#4e5058" }}
        title={format(new Date(thread.updated_at), "PPpp")}
      >
        {formatDistanceToNow(new Date(thread.updated_at), { addSuffix: false })}
      </span>
    </button>
  )
}
