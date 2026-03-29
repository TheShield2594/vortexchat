"use client"

import { useState, useEffect, useCallback } from "react"
import { Key, Loader2, Save, Trash2, CheckCircle2, AlertCircle } from "lucide-react"

interface AiSettingsTabProps {
  serverId: string
}

export function AiSettingsTab({ serverId }: AiSettingsTabProps) {
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [hasInstanceKey, setHasInstanceKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/servers/${serverId}/ai-settings`)
      if (!res.ok) throw new Error("Failed to load AI settings")
      const data = await res.json()
      setHasGeminiKey(data.hasGeminiKey)
      setHasInstanceKey(data.hasInstanceKey)
    } catch {
      setError("Failed to load AI settings")
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleSave = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/servers/${serverId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: apiKey.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save")
      }
      setHasGeminiKey(true)
      setApiKey("")
      setSuccess("Gemini API key saved successfully")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save API key")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/servers/${serverId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: null }),
      })
      if (!res.ok) throw new Error("Failed to remove key")
      setHasGeminiKey(false)
      setSuccess("Gemini API key removed")
    } catch {
      setError("Failed to remove API key")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--theme-text-muted)" }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">AI Settings</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted)" }}>
          Configure the Gemini API key used for AI-powered features like channel summarization and voice call summaries.
        </p>
      </div>

      {/* Status */}
      <div className="rounded-md p-4" style={{ background: "var(--theme-bg-secondary)" }}>
        <h3 className="text-sm font-medium text-white mb-3">Current Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {hasGeminiKey ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4" style={{ color: "var(--theme-text-muted)" }} />
            )}
            <span style={{ color: hasGeminiKey ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}>
              Server API key: {hasGeminiKey ? "Configured" : "Not set"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasInstanceKey ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4" style={{ color: "var(--theme-text-muted)" }} />
            )}
            <span style={{ color: hasInstanceKey ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}>
              Instance fallback key: {hasInstanceKey ? "Available" : "Not configured"}
            </span>
          </div>
        </div>
        {!hasGeminiKey && !hasInstanceKey && (
          <p className="mt-3 text-xs text-amber-400">
            No API key is available. AI features (channel summaries, voice call recaps) will be unavailable until a key is set.
          </p>
        )}
        {hasGeminiKey && (
          <p className="mt-3 text-xs" style={{ color: "var(--theme-text-muted)" }}>
            The server-level key takes priority over the instance fallback.
          </p>
        )}
      </div>

      {/* Set / Replace key */}
      <div className="rounded-md p-4" style={{ background: "var(--theme-bg-secondary)" }}>
        <h3 className="text-sm font-medium text-white mb-2">
          {hasGeminiKey ? "Replace" : "Set"} Gemini API Key
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--theme-text-muted)" }}>
          You can get a Gemini API key from Google AI Studio. The key is stored securely and never shown again after saving.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--theme-text-muted)" }} />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-md border py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500"
              style={{
                background: "var(--theme-bg-primary)",
                borderColor: "var(--theme-border)",
              }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--theme-accent, #5865F2)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {/* Remove key */}
      {hasGeminiKey && (
        <div className="rounded-md p-4" style={{ background: "var(--theme-bg-secondary)" }}>
          <h3 className="text-sm font-medium text-white mb-2">Remove Server Key</h3>
          <p className="text-xs mb-3" style={{ color: "var(--theme-text-muted)" }}>
            Remove the server-level key. AI features will {hasInstanceKey ? "fall back to the instance-level key." : "be unavailable."}
          </p>
          <button
            onClick={handleRemove}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            style={{ border: "1px solid rgba(239,68,68,0.3)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove Key
          </button>
        </div>
      )}

      {/* Feedback messages */}
      {error && (
        <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-400">
          {success}
        </div>
      )}
    </div>
  )
}
