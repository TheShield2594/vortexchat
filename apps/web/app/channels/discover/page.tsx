"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Users, Compass, BadgeCheck, Star } from "lucide-react"
import { MobileMenuButton } from "@/components/layout/mobile-nav"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

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

function trustBadgeClass(trustBadge: DiscoverApp["trust_badge"]) {
  switch (trustBadge) {
    case "verified":
      return "text-primary"
    case "partner":
      return "text-accent"
    case "internal":
      return "text-muted-foreground"
    default:
      return "text-muted-foreground"
  }
}

function ServerIcon({ iconUrl, serverName }: { iconUrl: string | null; serverName: string }) {
  const [iconLoadFailed, setIconLoadFailed] = useState(false)

  useEffect(() => {
    setIconLoadFailed(false)
  }, [iconUrl])

  if (iconUrl && !iconLoadFailed) {
    return (
      <img
        src={iconUrl}
        alt={serverName}
        className="h-full w-full object-cover"
        onError={() => setIconLoadFailed(true)}
      />
    )
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
      {serverName.slice(0, 2).toUpperCase()}
    </div>
  )
}

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
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <MobileMenuButton />
        <Compass className="h-5 w-5 text-muted-foreground" />
        <span className="font-semibold">Discover</span>
      </div>

      <div className="bg-card px-8 py-8">
        <h1 className="mb-1 text-2xl font-bold">Find communities and apps</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Search servers, browse the app marketplace, and check trust badges and reviews.
        </p>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "servers" | "apps")}> 
          <TabsList>
            <TabsTrigger value="servers">Servers</TabsTrigger>
            <TabsTrigger value="apps">Apps</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative mt-3 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "servers" ? "Search servers…" : "Search apps…"}
            className="w-full rounded-lg border border-input bg-popover py-2.5 pl-9 pr-4 text-sm focus:outline-none"
          />
        </div>
        {mode === "apps" && (
          <div className="mt-3 flex gap-2">
            {APP_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setCategory(item)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs capitalize",
                  category === item ? "bg-primary text-primary-foreground" : "bg-popover text-foreground"
                )}
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
                <div key={index} className="rounded-lg bg-card p-4">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {servers.map((server) => (
              <div key={server.id} className="flex flex-col overflow-hidden rounded-lg bg-card transition-transform hover:scale-[1.02]">
                <div className="flex h-20 items-center justify-center bg-popover">
                  <ServerIcon iconUrl={server.icon_url} serverName={server.name} />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="mb-1 truncate font-semibold">{server.name}</h3>
                  {server.description && <p className="mb-3 flex-1 line-clamp-2 text-xs text-muted-foreground">{server.description}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3 w-3" /><span>{server.member_count.toLocaleString()}</span></div>
                    <Button type="button" size="sm" className="h-7 rounded px-3 text-xs" onClick={() => joinServer(server.invite_code)}>Join</Button>
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <div key={app.id} className="rounded-lg bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{app.name}</h3>
                  {app.trust_badge && <BadgeCheck className={cn("h-4 w-4", trustBadgeClass(app.trust_badge))} />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{app.description ?? "No description"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Category: {app.category}</p>
                <p className="text-xs text-muted-foreground"><Star className="mr-1 inline h-3 w-3" />{app.average_rating.toFixed(1)} ({app.review_count} reviews)</p>
                <p className="mt-2 text-xs text-muted-foreground">Permissions: {app.permissions.join(", ") || "None"}</p>
              </div>
            ))}
          </div>
          )
        )}
      </div>
    </div>
  )
}
