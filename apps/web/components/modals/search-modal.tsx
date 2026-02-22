"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, Loader2, Hash, Calendar } from "lucide-react"
import { format } from "date-fns"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { MessageWithAuthor } from "@/types/database"

interface Props {
  serverId: string
  onClose: () => void
  onJumpToMessage?: (channelId: string, messageId: string) => void
}

export function SearchModal({ serverId, onClose, onJumpToMessage }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MessageWithAuthor[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const search = useCallback(async (q: string, off = 0) => {
    if (!q.trim()) {
      setResults([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&serverId=${serverId}&limit=20&offset=${off}`
      )
      if (res.ok) {
        const data = await res.json()
        if (off === 0) {
          setResults(data.results ?? [])
        } else {
          setResults((prev) => [...prev, ...(data.results ?? [])])
        }
        setTotal(data.total ?? 0)
        setOffset(off + (data.results?.length ?? 0))
      }
    } finally {
      setLoading(false)
    }
  }, [serverId])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    setOffset(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v, 0), 300)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: "#2b2d31", maxHeight: "70vh" }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "#1e1f22" }}
        >
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: "#949ba4" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "#949ba4" }} />}
          <button onClick={onClose} style={{ color: "#949ba4" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Search className="w-10 h-10" style={{ color: "#4e5058" }} />
              <p className="text-sm" style={{ color: "#949ba4" }}>
                Search messages across this server
              </p>
              <p className="text-xs" style={{ color: "#4e5058" }}>
                Use quotes for exact phrases, e.g. &quot;hello world&quot;
              </p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm" style={{ color: "#949ba4" }}>No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <>
              {total > 0 && (
                <div className="px-4 py-2 text-xs" style={{ color: "#949ba4" }}>
                  {total} result{total !== 1 ? "s" : ""}
                </div>
              )}
              {results.map((msg) => {
                const displayName = msg.author?.display_name || msg.author?.username || "Unknown"
                const initials = displayName.slice(0, 2).toUpperCase()
                return (
                  <button
                    key={msg.id}
                    onClick={() => { onJumpToMessage?.(msg.channel_id, msg.id); onClose() }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                      {msg.author?.avatar_url && <AvatarImage src={msg.author.avatar_url} />}
                      <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "11px" }}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-white">{displayName}</span>
                        <span className="text-xs" style={{ color: "#4e5058" }}>
                          {format(new Date(msg.created_at), "MMM d, yyyy h:mm a")}
                        </span>
                        {(msg as any).channel_id && (
                          <span className="flex items-center gap-0.5 text-xs" style={{ color: "#949ba4" }}>
                            <Hash className="w-3 h-3" />
                            channel
                          </span>
                        )}
                      </div>
                      <p className="text-sm truncate" style={{ color: "#b5bac1" }}>
                        {msg.content}
                      </p>
                    </div>
                  </button>
                )
              })}
              {results.length < total && (
                <button
                  onClick={() => search(query, offset)}
                  disabled={loading}
                  className="w-full py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "#5865f2" }}
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
