"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Sparkles, X, Loader2 } from "lucide-react"

interface SmartReplyTrayProps {
  serverId: string | null
  channelId: string | null
  /** Whether the user is currently typing in the composer */
  isTyping: boolean
  /** Whether the composer already has content */
  hasContent: boolean
  /** Called when a suggestion chip is clicked */
  onSelect: (text: string) => void
}

/**
 * Smart Reply Tray — shows 2-3 AI-generated reply suggestions above the composer.
 *
 * Triggers after 2s of inactivity (no new messages, user not typing).
 * Fades out when the user starts typing or selects a suggestion.
 */
export function SmartReplyTray({ serverId, channelId, isTyping, hasContent, onSelect }: SmartReplyTrayProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchRef = useRef<string>("")

  const fetchSuggestions = useCallback(async () => {
    if (!serverId || !channelId) return
    const key = `${serverId}-${channelId}`
    if (key === lastFetchRef.current) return // Don't re-fetch for same context
    lastFetchRef.current = key
    setLoading(true)
    try {
      const res = await fetch(`/api/servers/${serverId}/channels/${channelId}/smart-replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) { setSuggestions([]); return }
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setDismissed(false)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [serverId, channelId])

  // Debounced fetch: trigger after 2s of idle
  useEffect(() => {
    if (isTyping || hasContent || !serverId || !channelId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchSuggestions, 2000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [isTyping, hasContent, serverId, channelId, fetchSuggestions])

  // Reset when channel changes
  useEffect(() => {
    setSuggestions([])
    setDismissed(false)
    lastFetchRef.current = ""
  }, [channelId])

  // Hide when typing
  if (isTyping || hasContent || dismissed || suggestions.length === 0) {
    if (loading && !isTyping && !hasContent && !dismissed) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ color: "var(--theme-ai-label)" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">Thinking...</span>
        </div>
      )
    }
    return null
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 overflow-x-auto no-scrollbar"
      style={{ background: "var(--theme-ai-surface)", borderBottom: "1px solid var(--theme-ai-border)" }}
    >
      <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--theme-ai-badge-text)" }} />
      {suggestions.map((suggestion: string, i: number) => (
        <button
          key={i}
          onClick={() => {
            onSelect(suggestion)
            setSuggestions([])
          }}
          className="motion-interactive motion-press shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all hover:-translate-y-px"
          style={{
            background: "var(--theme-surface-elevated)",
            border: "1px solid var(--theme-ai-border)",
            color: "var(--theme-text-normal)",
          }}
        >
          {suggestion}
        </button>
      ))}
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded-full transition-colors"
        style={{ color: "var(--theme-text-muted)" }}
        aria-label="Dismiss suggestions"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
