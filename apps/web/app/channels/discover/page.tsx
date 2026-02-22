"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Users, Compass } from "lucide-react"
import { MobileMenuButton } from "@/components/layout/mobile-nav"

interface PublicServer {
  id: string
  name: string
  description: string | null
  icon_url: string | null
  member_count: number
  invite_code: string
}

export default function DiscoverPage() {
  const [servers, setServers] = useState<PublicServer[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchServers = useCallback(async (q?: string) => {
    setLoading(true)
    const url = q ? `/api/servers/discover?q=${encodeURIComponent(q)}` : "/api/servers/discover"
    const res = await fetch(url)
    if (res.ok) setServers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchServers() }, [fetchServers])

  useEffect(() => {
    const t = setTimeout(() => fetchServers(query), 300)
    return () => clearTimeout(t)
  }, [query, fetchServers])

  async function joinServer(inviteCode: string) {
    const res = await fetch(`/api/invites/${inviteCode}`, { method: "POST" })
    if (res.ok) {
      const { serverId } = await res.json()
      router.push(`/channels/${serverId}`)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: "#313338" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#1e1f22" }}>
        <MobileMenuButton />
        <Compass className="w-5 h-5" style={{ color: "#949ba4" }} />
        <span className="font-semibold text-white">Discover Servers</span>
      </div>

      {/* Hero */}
      <div className="px-8 py-8" style={{ background: "#2b2d31" }}>
        <h1 className="text-2xl font-bold text-white mb-1">Find your community</h1>
        <p className="text-sm mb-4" style={{ color: "#b5bac1" }}>
          Explore public servers and join the conversation.
        </p>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#949ba4" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search servers…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5865f2", borderTopColor: "transparent" }} />
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12">
            <Compass className="w-12 h-12 mx-auto mb-3" style={{ color: "#4e5058" }} />
            <p className="text-sm" style={{ color: "#949ba4" }}>
              {query ? `No servers found for "${query}"` : "No public servers yet"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {servers.map((server) => (
              <div
                key={server.id}
                className="rounded-lg overflow-hidden flex flex-col transition-transform hover:scale-[1.02]"
                style={{ background: "#2b2d31" }}
              >
                {/* Banner / icon area */}
                <div className="h-20 flex items-center justify-center" style={{ background: "#1e1f22" }}>
                  {server.icon_url ? (
                    <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
                      style={{ background: "#5865f2" }}
                    >
                      {server.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-white truncate mb-1">{server.name}</h3>
                  {server.description && (
                    <p className="text-xs line-clamp-2 flex-1 mb-3" style={{ color: "#949ba4" }}>
                      {server.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "#949ba4" }}>
                      <Users className="w-3 h-3" />
                      <span>{server.member_count.toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => joinServer(server.invite_code)}
                      className="px-3 py-1 rounded text-xs font-semibold transition-colors hover:bg-indigo-500"
                      style={{ background: "#5865f2", color: "white" }}
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
