"use client"

import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"

interface OGData {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  favicon: string | null
}

interface Props {
  url: string
}

// Extract first http(s) URL from message content, stripping trailing punctuation
export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s>]+/)
  if (!match) return null
  return match[0].replace(/[.,)\]};:!?"']+$/, "")
}

export function LinkEmbed({ url }: Props) {
  const [data, setData] = useState<OGData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/oembed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (!d || (!d.title && !d.description && !d.image)) {
          setFailed(true)
        } else {
          setData(d)
        }
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [url])

  if (failed || !data) return null

  // Truncate URL for display
  let displayUrl = url
  try { displayUrl = new URL(url).hostname } catch {}

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded overflow-hidden max-w-lg hover:brightness-110 transition-all"
      style={{ background: "#2b2d31", border: "1px solid #1e1f22", borderLeft: "4px solid #5865f2", textDecoration: "none" }}
    >
      <div className="p-3 flex gap-3">
        {/* Text side */}
        <div className="flex-1 min-w-0">
          {data.siteName && (
            <div className="text-xs mb-0.5" style={{ color: "#949ba4" }}>{data.siteName}</div>
          )}
          {data.title && (
            <div className="text-sm font-semibold truncate" style={{ color: "#00a8fc" }}>{data.title}</div>
          )}
          {data.description && (
            <div className="text-xs mt-1 line-clamp-2" style={{ color: "#b5bac1" }}>{data.description}</div>
          )}
          <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: "#4e5058" }}>
            <ExternalLink className="w-3 h-3" />
            {displayUrl}
          </div>
        </div>
        {/* Thumbnail */}
        {data.image && (
          <div className="flex-shrink-0 w-20 h-16 rounded overflow-hidden" style={{ background: "#1e1f22" }}>
            <img
              src={data.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          </div>
        )}
      </div>
    </a>
  )
}
