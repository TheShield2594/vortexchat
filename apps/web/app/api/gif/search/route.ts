import { type NextRequest, NextResponse } from "next/server"

const GIPHY_BASE = "https://api.giphy.com/v1/gifs"
const SEARCH_TTL_MS = 2 * 60 * 1000 // 2 minutes
const MAX_CACHE_ENTRIES = 200

interface GifResult {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  url: string | null
}

// Module-level LRU-ish cache keyed by lowercase query
const searchCache = new Map<string, { data: GifResult[]; expiresAt: number }>()

function mapGiphy(gif: Record<string, any>): GifResult {
  return {
    id: gif.id,
    title: gif.title || "GIF",
    previewUrl:
      gif.images?.fixed_width_small?.url ??
      gif.images?.preview_gif?.url ??
      gif.images?.fixed_width_small_still?.url ??
      gif.images?.original_still?.url ??
      "",
    gifUrl: gif.images?.original?.url ?? gif.images?.downsized?.url ?? "",
    url: gif.url || null,
  }
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY ?? process.env.NEXT_PUBLIC_GIPHY_API_KEY
  if (!apiKey) return NextResponse.json([])

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (!q) return NextResponse.json([])

  const cacheKey = q.toLowerCase()
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const res = await fetch(
      `${GIPHY_BASE}/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`
    )
    if (!res.ok) return NextResponse.json([], { status: res.status })
    const json = await res.json()
    const mapped: GifResult[] = (json.data ?? [])
      .map(mapGiphy)
      .filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))

    searchCache.set(cacheKey, { data: mapped, expiresAt: Date.now() + SEARCH_TTL_MS })

    // Evict expired entries when cache grows large
    if (searchCache.size > MAX_CACHE_ENTRIES) {
      const now = Date.now()
      for (const [key, entry] of searchCache) {
        if (entry.expiresAt < now) searchCache.delete(key)
      }
    }

    return NextResponse.json(mapped)
  } catch {
    return NextResponse.json([], { status: 502 })
  }
}
