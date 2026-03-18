"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Users, Compass, BadgeCheck, Star, Plus, ArrowUpDown, ChevronDown, Check } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"

interface PublicServer {
  id: string
  name: string
  description: string | null
  icon_url: string | null
  member_count: number
  invite_code: string
  created_at: string
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
const SORT_OPTIONS = [
  { value: "members", label: "Most Members" },
  { value: "newest", label: "Newest" },
] as const

type SortOption = (typeof SORT_OPTIONS)[number]["value"]

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [mode, setMode] = useState<"servers" | "apps">("servers")
  const [category, setCategory] = useState("all")
  const [sort, setSort] = useState<SortOption>("members")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const router = useRouter()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const nextCursorRef = useRef(nextCursor)
  const loadingMoreRef = useRef(loadingMore)
  nextCursorRef.current = nextCursor
  loadingMoreRef.current = loadingMore

  // Server picker state for app installs
  const myServers = useAppStore(useShallow((s) => s.servers))
  const [pickerAppId, setPickerAppId] = useState<string | null>(null)
  const [installingTo, setInstallingTo] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerAppId) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerAppId(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [pickerAppId])

  async function installAppToServer(appId: string, serverId: string) {
    setInstallingTo(serverId)
    try {
      const res = await fetch(`/api/servers/${serverId}/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Install failed (${res.status})`)
      }
      toast({ title: "App installed successfully" })
      setPickerAppId(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Install failed",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setInstallingTo(null)
    }
  }

  const fetchServers = useCallback(async (q?: string, sortBy: SortOption = "members", cursor?: string) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (sortBy !== "members") params.set("sort", sortBy)
    if (cursor) params.set("cursor", cursor)
    const res = await fetch(`/api/servers/discover?${params.toString()}`)
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Discover API error ${res.status}: ${body}`)
    }
    return (await res.json()) as { servers: PublicServer[]; nextCursor: string | null }
  }, [])

  const fetchApps = useCallback(async (q?: string, selectedCategory = "all") => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory)
    const res = await fetch(`/api/apps/discover?${params.toString()}`)
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Apps API error ${res.status}: ${body}`)
    }
    setApps(await res.json())
  }, [])

  const previousCategoryRef = useRef(category)
  const previousSortRef = useRef(sort)

  // Initial + filter/search fetch
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const categoryChanged = previousCategoryRef.current !== category
    const sortChanged = previousSortRef.current !== sort

    const execute = async () => {
      setLoading(true)
      try {
        const [serverResult] = await Promise.all([
          fetchServers(query || undefined, sort),
          fetchApps(query || undefined, category),
        ])
        if (!cancelled) {
          setServers(serverResult.servers)
          setNextCursor(serverResult.nextCursor)
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch discover data:", err)
          setServers([])
          setNextCursor(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const debounceMs = query && !categoryChanged && !sortChanged ? 300 : 0
    if (debounceMs > 0) {
      timer = setTimeout(execute, debounceMs)
    } else {
      execute()
    }

    previousCategoryRef.current = category
    previousSortRef.current = sort

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [query, fetchServers, fetchApps, category, sort])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (mode !== "servers" || !nextCursor) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    let cancelled = false

    const observer = new IntersectionObserver(
      (entries) => {
        const cur = nextCursorRef.current
        if (entries[0].isIntersecting && cur && !loadingMoreRef.current) {
          setLoadingMore(true)
          fetchServers(query || undefined, sort, cur)
            .then((result) => {
              if (!cancelled) {
                setServers((prev) => [...prev, ...result.servers])
                setNextCursor(result.nextCursor)
              }
            })
            .catch((err) => {
              if (!cancelled) {
                console.error("Failed to load more servers:", err)
              }
            })
            .finally(() => {
              if (!cancelled) {
                setLoadingMore(false)
              }
            })
        }
      },
      { rootMargin: "200px" }
    )

    observer.observe(sentinel)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [mode, nextCursor, query, sort, fetchServers])

  async function joinServer(inviteCode: string) {
    try {
      const res = await fetch(`/api/invites/${inviteCode}`, { method: "POST" })
      if (res.ok) {
        const { serverId } = await res.json()
        router.push(`/channels/${serverId}`)
      } else {
        const body = await res.json().catch(() => null)
        toast({
          variant: "destructive",
          title: "Failed to join server",
          description: body?.error || `Something went wrong (${res.status})`,
        })
      }
    } catch (err) {
      console.error("Join server error:", err)
      toast({
        variant: "destructive",
        title: "Failed to join server",
        description: "A network error occurred. Please try again.",
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Compass className="h-5 w-5 text-muted-foreground" />
        <span className="font-semibold">Discover</span>
      </div>

      <div className="bg-card px-4 py-6 sm:px-8 sm:py-8">
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "servers" ? "Search servers…" : "Search apps…"}
              className="w-full rounded-lg border border-input bg-popover py-2.5 pl-9 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          {mode === "servers" && (
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-lg border border-input bg-popover px-2 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
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

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {loading ? (
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
        ) : mode === "servers" ? (
          servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <BrandedEmptyState
                icon={Compass}
                title="No servers found"
                description={query
                  ? "We couldn't find public communities matching your search."
                  : "There are no public communities to discover yet."
                }
                hint={query
                  ? "Try a different search term or clear your search."
                  : "Be the first — create a server and make it public!"
                }
              />
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => router.push("/channels/me")}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create a Server
              </Button>
            </div>
          ) : (
            <>
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
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="flex justify-center py-6">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    Loading more…
                  </div>
                )}
              </div>
            </>
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
                <div className="relative mt-3">
                  <Button
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={() => setPickerAppId(pickerAppId === app.id ? null : app.id)}
                    disabled={myServers.length === 0}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add to Server
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                  {pickerAppId === app.id && myServers.length > 0 && (
                    <div
                      ref={pickerRef}
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
                    >
                      {myServers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={installingTo === s.id}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
                          onClick={() => installAppToServer(app.id, s.id)}
                        >
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                            {s.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="truncate">{s.name}</span>
                          {installingTo === s.id && (
                            <div className="ml-auto h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )
        )}
      </div>
    </div>
  )
}
