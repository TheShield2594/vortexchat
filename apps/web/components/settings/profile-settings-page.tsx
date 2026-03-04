"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload, Camera, ExternalLink, Link2 } from "lucide-react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import type { UserRow } from "@/types/database"

interface Props {
  user: UserRow
}

const STATUS_OPTIONS = [
  { value: "online", label: "Online", color: "var(--theme-success)" },
  { value: "idle", label: "Idle", color: "var(--theme-warning)" },
  { value: "dnd", label: "Do Not Disturb", color: "var(--theme-danger)" },
  { value: "invisible", label: "Invisible", color: "var(--theme-presence-offline)" },
] as const

const BANNER_PRESETS = [
  "#5865f2", "#eb459e", "#fee75c", "#57f287", "#ed4245",
  "#3ba55c", "#faa61a", "#7289da", "#2c2f33", "#99aab5",
]

export function ProfileSettingsPage({ user }: Props) {
  const { toast } = useToast()
  const router = useRouter()
  const [supabase] = useState(() => createClientSupabaseClient())
  const { setCurrentUser } = useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user.display_name ?? "")
  const [bio, setBio] = useState(user.bio ?? "")
  const [customTag, setCustomTag] = useState(user.custom_tag ?? "")
  const [bannerColor, setBannerColor] = useState(user.banner_color ?? "#5865f2")
  const [status, setStatus] = useState<"online" | "idle" | "dnd" | "invisible">(
    (user.status as "online" | "idle" | "dnd" | "invisible") ?? "online"
  )
  const [statusMessage, setStatusMessage] = useState(user.status_message ?? "")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [connections, setConnections] = useState<Array<{ id: string; provider: string; provider_user_id: string; username: string | null; display_name: string | null; profile_url: string | null }>>([])
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [provider, setProvider] = useState("github")
  const [connectionUsername, setConnectionUsername] = useState("")
  const [connectionProfileUrl, setConnectionProfileUrl] = useState("")

  useEffect(() => {
    const loadConnections = async () => {
      const res = await fetch("/api/users/connections", { cache: "no-store" })
      const payload = await res.json().catch(() => ({}))
      if (res.ok) {
        setConnections(payload.connections ?? [])
      }
    }
    loadConnections()
  }, [])

  // Revoke object URLs when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Image too large", description: "Max 5MB." })
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    setSaving(true)
    try {
      let avatarUrl = user.avatar_url

      if (avatarFile) {
        const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"])
        const rawExt = avatarFile.name.split(".").pop()?.toLowerCase() ?? ""
        const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : "jpg"
        const path = `avatars/${user.id}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
        avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`
      }

      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName || null,
          bio: bio || null,
          custom_tag: customTag || null,
          banner_color: bannerColor,
          status,
          status_message: statusMessage || null,
          avatar_url: avatarUrl,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }

      const updated = await res.json()
      setCurrentUser(updated)
      toast({ title: "Profile saved!" })
      router.refresh()
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to save profile",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setSaving(false)
    }
  }

  async function connectSteam() {
    const next = window.location.pathname + window.location.search
    window.location.href = `/api/users/connections/steam/start?next=${encodeURIComponent(next)}`
  }

  async function addManualConnection(e: React.FormEvent) {
    e.preventDefault()
    setConnectionLoading(true)
    const res = await fetch("/api/users/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, username: connectionUsername, profile_url: connectionProfileUrl }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to add connection", description: payload.error || "Please try again" })
      setConnectionLoading(false)
      return
    }
    setConnectionUsername("")
    setConnectionProfileUrl("")
    setConnections((prev) => {
      const others = prev.filter((item) => item.provider !== payload.connection.provider)
      return [...others, payload.connection]
    })
    setConnectionLoading(false)
  }

  async function removeConnection(id: string) {
    const res = await fetch(`/api/users/connections?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to remove connection" })
      return
    }
    setConnections((prev) => prev.filter((item) => item.id !== id))
  }

  const initials = (user.display_name || user.username || "?").slice(0, 2).toUpperCase()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
          My Profile
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--theme-text-muted)" }}>
          Update your identity, status, and profile details.
        </p>
      </div>

      {/* Avatar section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Avatar
        </h2>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="w-20 h-20">
              {(avatarPreview ?? user.avatar_url) && (
                <AvatarImage src={avatarPreview ?? user.avatar_url!} alt="Avatar" />
              )}
              <AvatarFallback
                className="text-2xl font-bold"
                style={{ background: bannerColor, color: "white" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.6)" }}
              aria-label="Change avatar"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors hover:brightness-110"
              style={{ background: "var(--theme-accent)", color: "white" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload image
            </button>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>JPG, PNG, GIF, WebP — max 5MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
      </section>

      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Identity
        </h2>

        <div className="space-y-2">
          <label htmlFor="profile-display-name" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
            Display Name
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--theme-surface-input)",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-bg-tertiary)",
            }}
            placeholder={user.username}
          />
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            Username: @{user.username}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-custom-tag" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
            Custom Tag
          </label>
          <input
            id="profile-custom-tag"
            type="text"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
            maxLength={16}
            className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--theme-surface-input)",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-bg-tertiary)",
            }}
            placeholder="e.g. gamer"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-about-me" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
            About Me
          </label>
          <textarea
            id="profile-about-me"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
            className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 resize-none"
            style={{
              background: "var(--theme-surface-input)",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-bg-tertiary)",
            }}
            placeholder="Tell people a bit about yourself…"
          />
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{bio.length}/190</p>
        </div>
      </section>

      {/* Banner color */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Banner Color
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {BANNER_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setBannerColor(color)}
              className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus-ring"
              style={{
                background: color,
                outline: bannerColor === color ? `3px solid white` : "none",
                outlineOffset: "2px",
              }}
              aria-label={`Select color ${color}`}
            />
          ))}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bannerColor}
              onChange={(e) => setBannerColor(e.target.value)}
              className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent"
              title="Custom banner color"
              aria-label="Custom banner color"
            />
            <span className="text-xs font-mono" style={{ color: "var(--theme-text-muted)" }}>{bannerColor}</span>
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Status
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map(({ value, label, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all focus-ring"
              style={{
                background: status === value ? "color-mix(in srgb, var(--theme-accent) 15%, var(--theme-bg-secondary))" : "var(--theme-bg-secondary)",
                border: `1px solid ${status === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`,
                color: "var(--theme-text-primary)",
                fontWeight: status === value ? 600 : 400,
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-status-message" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
            Status Message
          </label>
          <input
            id="profile-status-message"
            type="text"
            value={statusMessage}
            onChange={(e) => setStatusMessage(e.target.value)}
            maxLength={128}
            className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
            style={{
              background: "var(--theme-surface-input)",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-bg-tertiary)",
            }}
            placeholder="What's happening?"
          />
        </div>
      </section>

      {/* Save */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Connections & Social Links
        </h2>

        <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Steam</h3>
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Link your Steam account with OpenID sign-in.</p>
          <button type="button" onClick={connectSteam} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium" style={{ background: "var(--theme-accent)", color: "white" }}>
            <Link2 className="w-4 h-4" /> Connect Steam
          </button>
        </div>

        <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Social Links</h3>
          <form onSubmit={addManualConnection} className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_auto] gap-2">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}>
              <option value="github">GitHub</option>
              <option value="x">X / Twitter</option>
              <option value="twitch">Twitch</option>
              <option value="youtube">YouTube</option>
              <option value="reddit">Reddit</option>
              <option value="website">Website</option>
            </select>
            <input value={connectionUsername} onChange={(e) => setConnectionUsername(e.target.value)} placeholder="username" className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }} />
            <input value={connectionProfileUrl} onChange={(e) => setConnectionProfileUrl(e.target.value)} placeholder="https://..." required className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }} />
            <button type="submit" disabled={connectionLoading} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60" style={{ background: "var(--theme-accent)", color: "white" }}>{connectionLoading ? "Adding..." : "Add"}</button>
          </form>
        </div>

        <div className="space-y-2">
          {connections.map((connection) => (
            <div key={connection.id} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
              <div className="min-w-0">
                <p className="text-sm capitalize" style={{ color: "var(--theme-text-primary)" }}>{connection.provider}</p>
                <p className="text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>{connection.display_name || connection.username || connection.provider_user_id}</p>
              </div>
              <div className="flex items-center gap-2">
                {connection.profile_url && (
                  <a href={connection.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded p-1.5" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button type="button" onClick={() => removeConnection(connection.id)} className="text-xs font-medium" style={{ color: "var(--theme-danger)" }}>Remove</button>
              </div>
            </div>
          ))}
          {connections.length === 0 && <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No connections yet.</p>}
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-md font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "var(--theme-accent)", color: "white" }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  )
}
