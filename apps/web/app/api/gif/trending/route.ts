import { NextResponse } from "next/server"

const GIPHY_BASE = "https://api.giphy.com/v1/gifs"
const TRENDING_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Module-level cache — survives across requests within the same serverless instance
let trendingCache: { data: GifResult[]; expiresAt: number } | null = null

interface GifResult {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  url: string | null
}

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

export async function GET() {
  // Prefer server-only key; fall back to public key for dev convenience
  const apiKey = process.env.GIPHY_API_KEY ?? process.env.NEXT_PUBLIC_GIPHY_API_KEY
  if (!apiKey) return NextResponse.json([])

  if (trendingCache && trendingCache.expiresAt > Date.now()) {
    return NextResponse.json(trendingCache.data)
  }

  try {
    const res = await fetch(`${GIPHY_BASE}/trending?api_key=${apiKey}&limit=20&rating=pg-13`)
    if (!res.ok) return NextResponse.json([], { status: res.status })
    const json = await res.json()
    const mapped: GifResult[] = (json.data ?? [])
      .map(mapGiphy)
      .filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
    trendingCache = { data: mapped, expiresAt: Date.now() + TRENDING_TTL_MS }
    return NextResponse.json(mapped)
  } catch {
    return NextResponse.json([], { status: 502 })
  }
}
