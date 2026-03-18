/** Abstraction over GIF providers (Klipy primary, Giphy fallback). */

export interface GifResult {
  id: string
  title: string
  previewUrl: string
  gifUrl: string
  url: string | null
}

// ── Klipy ────────────────────────────────────────────────────────────────────

function mapKlipy(gif: Record<string, any>): GifResult {
  const media = gif.files ?? gif.media_formats ?? {}
  return {
    id: gif.id,
    title: gif.content_description || gif.title || "GIF",
    previewUrl: media.tinygif?.url ?? media.nanogif?.url ?? "",
    gifUrl: media.gif?.url ?? media.mediumgif?.url ?? "",
    url: gif.itemurl || gif.url || null,
  }
}

export async function klipySearch(apiKey: string, query: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://api.klipy.com/v2/search?key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.results ?? []).map(mapKlipy).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

export async function klipyTrending(apiKey: string, limit = 20): Promise<GifResult[]> {
  const res = await fetch(
    `https://api.klipy.com/v2/featured?key=${apiKey}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.results ?? []).map(mapKlipy).filter((g: GifResult) => g.previewUrl && (g.url || g.gifUrl))
}

export async function klipySuggestions(apiKey: string, query: string): Promise<string[]> {
  const res = await fetch(
    `https://api.klipy.com/v2/autocomplete?key=${apiKey}&q=${encodeURIComponent(query)}&limit=8`
  )
  if (!res.ok) return []
  const json = await res.json()
  return json.results ?? []
}

// ── Giphy (fallback) ────────────────────────────────────────────────────────

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

// ── Provider detection ───────────────────────────────────────────────────────

export type GifProvider = "klipy" | "giphy"

export function detectProvider(): { provider: GifProvider; apiKey: string } | null {
  // Klipy takes priority (primary provider)
  const klipyKey = process.env.KLIPY_API_KEY ?? process.env.NEXT_PUBLIC_KLIPY_API_KEY
  if (klipyKey) return { provider: "klipy", apiKey: klipyKey }

  // Giphy as fallback
  const giphyKey = process.env.GIPHY_API_KEY ?? process.env.NEXT_PUBLIC_GIPHY_API_KEY
  if (giphyKey) return { provider: "giphy", apiKey: giphyKey }

  return null
}
