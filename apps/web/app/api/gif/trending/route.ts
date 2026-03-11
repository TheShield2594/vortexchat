import { NextResponse } from "next/server"
import { detectProvider, giphyTrending, tenorTrending, type GifResult } from "@/lib/gif-provider"

const TRENDING_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Module-level cache — survives across requests within the same serverless instance
let trendingCache: { data: GifResult[]; expiresAt: number; provider: string } | null = null

export async function GET() {
  const config = detectProvider()
  if (!config) return NextResponse.json([])

  if (trendingCache && trendingCache.expiresAt > Date.now() && trendingCache.provider === config.provider) {
    return NextResponse.json(trendingCache.data)
  }

  try {
    const mapped = config.provider === "tenor"
      ? await tenorTrending(config.apiKey)
      : await giphyTrending(config.apiKey)

    trendingCache = { data: mapped, expiresAt: Date.now() + TRENDING_TTL_MS, provider: config.provider }
    return NextResponse.json(mapped)
  } catch {
    return NextResponse.json([], { status: 502 })
  }
}
