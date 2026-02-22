"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Hash, Volume2, MessageSquare, Mic2, Megaphone, Image, Loader2 } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

interface Result {
  type: "channel" | "server"
  id: string
  name: string
  serverId?: string
  channelType?: string
}

interface Props {
  onClose: () => void
}

export function QuickSwitcherModal({ onClose }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [supabase] = useState(() => createClientSupabaseClient())
  const onCloseRef = useRef(onClose)
  const navigateRef = useRef<(r: Result) => void>(null!)
  onCloseRef.current = onClose

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      if (e.key === "Enter" && results[selected]) { navigateRef.current(results[selected]) }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [results, selected])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const debounce = setTimeout(async () => {
      setLoading(true)
      const q = `%${query}%`

      // Fetch matching channels and servers the user is a member of
      const [{ data: channels }, { data: servers }] = await Promise.all([
        supabase
          .from("channels")
          .select("id, name, type, server_id")
          .ilike("name", q)
          .in("type", ["text", "voice", "forum", "stage", "announcement", "media"])
          .limit(5),
        supabase
          .from("servers")
          .select("id, name")
          .ilike("name", q)
          .limit(3),
      ])

      const channelResults: Result[] = (channels ?? []).map((c) => ({
        type: "channel",
        id: c.id,
        name: c.name,
        serverId: c.server_id,
        channelType: c.type,
      }))
      const serverResults: Result[] = (servers ?? []).map((s) => ({
        type: "server",
        id: s.id,
        name: s.name,
      }))

      setResults([...channelResults, ...serverResults])
      setSelected(0)
      setLoading(false)
    }, 150)

    return () => clearTimeout(debounce)
  }, [query])

  function navigate(result: Result) {
    if (result.type === "channel" && result.serverId) {
      router.push(`/channels/${result.serverId}/${result.id}`)
    } else if (result.type === "server") {
      router.push(`/channels/${result.id}`)
    }
    onCloseRef.current()
  }
  navigateRef.current = navigate

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl" style={{ background: "#2b2d31" }}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#1e1f22" }}>
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: "#949ba4" }} />
            : <Search className="w-5 h-5 flex-shrink-0" style={{ color: "#949ba4" }} />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where would you like to go?"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-xs" style={{ background: "#1e1f22", color: "#4e5058" }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="py-1 max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  onClick={() => navigate(r)}
                  onMouseEnter={() => setSelected(i)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ background: selected === i ? "rgba(88,101,242,0.2)" : "transparent" }}
                >
                  {r.type === "channel" ? (
                    r.channelType === "voice" ? <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} /> :
                    r.channelType === "stage" ? <Mic2 className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} /> :
                    r.channelType === "forum" ? <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} /> :
                    r.channelType === "announcement" ? <Megaphone className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} /> :
                    r.channelType === "media" ? <Image className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} /> :
                    <Hash className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} />
                  ) : <Hash className="w-4 h-4 flex-shrink-0" style={{ color: "#949ba4" }} />}
                  <span className="text-sm text-white">{r.name}</span>
                  <span className="text-xs ml-auto" style={{ color: "#4e5058" }}>
                    {r.type === "channel" ? "Channel" : "Server"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: "#949ba4" }}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!query && (
          <div className="px-4 py-4 text-xs" style={{ color: "#4e5058" }}>
            <div className="flex justify-between mb-1"><span>Navigate channels</span><span>↑ ↓ to select, ↵ to go</span></div>
            <div className="flex justify-between"><span>Search servers</span><span>Ctrl+K to open</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
