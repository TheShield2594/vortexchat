"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, Loader2, Hash, Calendar, CheckSquare, FileText } from "lucide-react"
import { format } from "date-fns"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

type SearchResult = any

interface Props {
  serverId: string
  onClose: () => void
  onJumpToMessage?: (channelId: string, messageId: string) => void
}

export function SearchModal({ serverId, onClose, onJumpToMessage }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return setResults([])
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&serverId=${serverId}&limit=40`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
        setTotal(data.total ?? 0)
      }
    } finally { setLoading(false) }
  }, [serverId])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 250)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" style={{ background: "rgba(0,0,0,0.7)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl flex flex-col" style={{ background: "var(--theme-bg-secondary)", maxHeight: "70vh" }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--theme-bg-tertiary)" }}>
          <Search className="w-5 h-5" style={{ color: "var(--theme-text-muted)" }} />
          <input ref={inputRef} type="text" value={query} onChange={handleInput} placeholder="Search… try from:<userId> has:link has:image before:2026-01-01" className="flex-1 bg-transparent text-white text-sm focus:outline-none" />
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--theme-text-muted)" }} />}
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

            <div className="px-4 py-1 text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
              Filters: <code className="px-1 py-0.5 rounded bg-black/20">from:user-id</code> <code className="px-1 py-0.5 rounded bg-black/20">has:link</code> <code className="px-1 py-0.5 rounded bg-black/20">has:image</code> <code className="px-1 py-0.5 rounded bg-black/20">before:YYYY-MM-DD</code>
            </div>
            <div className="px-4 py-1 text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
              Note: encrypted DMs are excluded — use the in-conversation search (<kbd className="px-1 py-0.5 rounded bg-black/20 font-mono">🔍</kbd>) for end-to-end encrypted channels.
            </div>

        <div className="flex-1 overflow-y-auto">
          {!query.trim() ? <div className="px-4 py-10"><BrandedEmptyState icon={Search} title="Search workspace" description="Find messages, tasks, and docs in one place." /></div>
          : results.length === 0 && !loading ? <div className="px-4 py-10"><BrandedEmptyState icon={Calendar} title="No results" description={`No results for “${query}”.`} /></div>
          : <>
            {loading && results.length === 0 && <div className="space-y-3 px-4 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
            {total > 0 && <div className="px-4 py-2 text-xs" style={{ color: "var(--theme-text-muted)" }}>{total} results</div>}
            {results.map((result) => {
              if (result.type === "message") {
                const displayName = result.author?.display_name || result.author?.username || "Unknown"
                const initials = displayName.slice(0, 2).toUpperCase()
                return <button key={`message-${result.id}`} onClick={() => { onJumpToMessage?.(result.channel_id, result.id); onClose() }} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5">
                  <Avatar className="w-8 h-8 mt-0.5">{result.author?.avatar_url && <AvatarImage src={result.author.avatar_url} />}<AvatarFallback>{initials}</AvatarFallback></Avatar>
                  <div className="min-w-0"><div className="text-sm text-white">{displayName} <span className="text-xs text-zinc-400">{format(new Date(result.created_at), "MMM d, yyyy h:mm a")}</span></div><p className="text-sm text-zinc-300 truncate">{result.content}</p></div>
                </button>
              }
              if (result.type === "task") {
                return <div key={`task-${result.id}`} className="px-4 py-3 border-t border-white/5"><div className="text-sm text-white flex items-center gap-2"><CheckSquare className="w-4 h-4" /> {result.title}</div><p className="text-xs text-zinc-400">Task • {result.status}</p></div>
              }
              return <div key={`doc-${result.id}`} className="px-4 py-3 border-t border-white/5"><div className="text-sm text-white flex items-center gap-2"><FileText className="w-4 h-4" /> {result.title}</div><p className="text-xs text-zinc-400">Doc / note</p></div>
            })}
          </>}
        </div>
      </div>
    </div>
  )
}
