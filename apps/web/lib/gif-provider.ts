/** Abstraction over GIF providers (Giphy / Tenor). */

export interface GifResult {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  url: string | null
}

// ── Giphy ────────────────────────────────────────────────────────────────────

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

export async function giphySearch(apiKey: string, query: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.data ?? []).map(mapGiphy).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

export async function giphyTrending(apiKey: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.data ?? []).map(mapGiphy).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

// ── Tenor ────────────────────────────────────────────────────────────────────

function mapTenor(gif: Record<string, any>): GifResult {
  const media = gif.media_formats ?? gif.media?.[0] ?? {}
  return {
    id: gif.id,
    title: gif.content_description || gif.title || "GIF",
    previewUrl: media.tinygif?.url ?? media.nanogif?.url ?? "",
    gifUrl: media.gif?.url ?? media.mediumgif?.url ?? "",
    url: gif.itemurl || gif.url || null,
  }
}

export async function tenorSearch(apiKey: string, query: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://tenor.googleapis.com/v2/search?key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.results ?? []).map(mapTenor).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

export async function tenorTrending(apiKey: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://tenor.googleapis.com/v2/featured?key=${apiKey}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.results ?? []).map(mapTenor).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

export async function tenorSuggestions(apiKey: string, query: string): Promise<string[]> {
  const res = await fetch(
    `https://tenor.googleapis.com/v2/autocomplete?key=${apiKey}&q=${encodeURIComponent(query)}&limit=8`
  )
  if (!res.ok) return []
  const json = await res.json()
  return json.results ?? []
}

// ── Provider detection ───────────────────────────────────────────────────────

export type GifProvider = "giphy" | "tenor"

export function detectProvider(): { provider: GifProvider; apiKey: string } | null {
  // Tenor takes priority if configured (free, no rate limits)
  const tenorKey = process.env.TENOR_API_KEY ?? process.env.NEXT_PUBLIC_TENOR_API_KEY
  if (tenorKey) return { provider: "tenor", apiKey: tenorKey }

  const giphyKey = process.env.GIPHY_API_KEY ?? process.env.NEXT_PUBLIC_GIPHY_API_KEY
  if (giphyKey) return { provider: "giphy", apiKey: giphyKey }

  return null
}
