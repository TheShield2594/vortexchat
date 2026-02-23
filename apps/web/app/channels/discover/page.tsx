"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Users, Compass, BadgeCheck, Star } from "lucide-react"
import { MobileMenuButton } from "@/components/layout/mobile-nav"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"

interface PublicServer {
  id: string
  name: string
  description: string | null
  icon_url: string | null
  member_count: number
  invite_code: string
}

interface DiscoverApp {
  id: string
  name: string
  description: string | null
  category: string
  trust_badge: "verified" | "partner" | "internal" | null
  average_rating: number
  review_count: number
  permissions: string[]
}

const APP_CATEGORIES = ["all", "productivity", "ops", "community"]

export default function DiscoverPage() {
  const [servers, setServers] = useState<PublicServer[]>([])
  const [apps, setApps] = useState<DiscoverApp[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"servers" | "apps">("servers")
  const [category, setCategory] = useState("all")
  const router = useRouter()

  const fetchServers = useCallback(async (q?: string) => {
    const url = q ? `/api/servers/discover?q=${encodeURIComponent(q)}` : "/api/servers/discover"
    const res = await fetch(url)
    if (res.ok) setServers(await res.json())
  }, [])

  const fetchApps = useCallback(async (q?: string, selectedCategory = "all") => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory)
    const res = await fetch(`/api/apps/discover?${params.toString()}`)
    if (res.ok) setApps(await res.json())
  }, [])

  const previousCategoryRef = useRef(category)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const categoryChanged = previousCategoryRef.current !== category

    const runFetch = async (debounceMs: number) => {
      if (timer) clearTimeout(timer)
      const execute = async () => {
        setLoading(true)
        await Promise.all([fetchServers(query || undefined), fetchApps(query || undefined, category)])
        if (!cancelled) setLoading(false)
      }

      if (debounceMs > 0) {
        timer = setTimeout(execute, debounceMs)
      } else {
        await execute()
      }
    }

    runFetch(query && !categoryChanged ? 300 : 0)
    previousCategoryRef.current = category

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [query, fetchServers, fetchApps, category])

  async function joinServer(inviteCode: string) {
    const res = await fetch(`/api/invites/${inviteCode}`, { method: "POST" })
    if (res.ok) {
      const { serverId } = await res.json()
      router.push(`/channels/${serverId}`)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: "#313338" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#1e1f22" }}>
        <MobileMenuButton />
        <Compass className="w-5 h-5" style={{ color: "#949ba4" }} />
        <span className="font-semibold text-white">Discover</span>
      </div>

      <div className="px-8 py-8" style={{ background: "#2b2d31" }}>
        <h1 className="text-2xl font-bold text-white mb-1">Find communities and apps</h1>
        <p className="text-sm mb-4" style={{ color: "#b5bac1" }}>
          Search servers, browse the app marketplace, and check trust badges and reviews.
        </p>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "servers" | "apps")}> 
          <TabsList>
            <TabsTrigger value="servers">Servers</TabsTrigger>
            <TabsTrigger value="apps">Apps</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-xl mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#949ba4" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "servers" ? "Search servers…" : "Search apps…"}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
          />
        </div>
        {mode === "apps" && (
          <div className="flex gap-2 mt-3">
            {APP_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setCategory(item)}
                className="px-2.5 py-1 rounded text-xs capitalize"
                style={{ background: category === item ? "#5865f2" : "#1e1f22", color: "white" }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="rounded-lg p-4" style={{ background: "#2b2d31" }}>
                  <Skeleton className="mb-3 h-20 w-full" />
                  <Skeleton className="mb-2 h-4 w-2/3" />
                  <Skeleton className="mb-3 h-3 w-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : mode === "servers" ? (
          servers.length === 0 ? (
            <BrandedEmptyState
              icon={Compass}
              title="No servers found"
              description="We couldn’t find public communities matching your filters yet."
              hint="Try a broader term or switch to Apps to explore integrations."
            />
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {servers.map((server) => (
              <div key={server.id} className="rounded-lg overflow-hidden flex flex-col transition-transform hover:scale-[1.02]" style={{ background: "#2b2d31" }}>
                <div className="h-20 flex items-center justify-center" style={{ background: "#1e1f22" }}>
                  {server.icon_url ? <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" /> : <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white" style={{ background: "#5865f2" }}>{server.name.slice(0, 2).toUpperCase()}</div>}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-white truncate mb-1">{server.name}</h3>
                  {server.description && <p className="text-xs line-clamp-2 flex-1 mb-3" style={{ color: "#949ba4" }}>{server.description}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "#949ba4" }}><Users className="w-3 h-3" /><span>{server.member_count.toLocaleString()}</span></div>
                    <button type="button" onClick={() => joinServer(server.invite_code)} className="px-3 py-1 rounded text-xs font-semibold" style={{ background: "#5865f2", color: "white" }}>Join</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )
        ) : (
          apps.length === 0 ? (
            <BrandedEmptyState
              icon={BadgeCheck}
              title="No apps in this lane"
              description="No marketplace apps match your current search and category filters."
              hint="Reset filters to all categories to discover more tools."
            />
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <div key={app.id} className="rounded-lg p-4" style={{ background: "#2b2d31" }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">{app.name}</h3>
                  {app.trust_badge && <BadgeCheck className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className="text-xs mt-1" style={{ color: "#949ba4" }}>{app.description ?? "No description"}</p>
                <p className="text-xs mt-2" style={{ color: "#b5bac1" }}>Category: {app.category}</p>
                <p className="text-xs" style={{ color: "#b5bac1" }}><Star className="w-3 h-3 inline mr-1" />{app.average_rating.toFixed(1)} ({app.review_count} reviews)</p>
                <p className="text-[11px] mt-2" style={{ color: "#949ba4" }}>Permissions: {app.permissions.join(", ") || "None"}</p>
              </div>
            ))}
          </div>
          )
        )}
      </div>
    </div>
  )
}
