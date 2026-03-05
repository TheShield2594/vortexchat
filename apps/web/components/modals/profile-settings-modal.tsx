"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Loader2, Upload, LogOut, ShieldCheck, ShieldOff, Copy, Check, KeyRound, Trash2, Pencil, Lock, RefreshCw, Eye, EyeOff, Link2, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useAppearanceStore } from "@/lib/stores/appearance-store"
import type { MessageDisplay, FontScale, Saturation } from "@/lib/stores/appearance-store"
import type { UserRow } from "@/types/database"
import { useNotificationSound } from "@/hooks/use-notification-sound"

interface Props {
  open: boolean
  onClose: () => void
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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

const STATUS_EXPIRY_OPTIONS = [
  { key: "never", label: "Never expires", minutes: null },
  { key: "30m", label: "In 30 minutes", minutes: 30 },
  { key: "1h", label: "In 1 hour", minutes: 60 },
  { key: "4h", label: "In 4 hours", minutes: 240 },
  { key: "1d", label: "In 1 day", minutes: 1440 },
] as const

type StatusExpiryKey = (typeof STATUS_EXPIRY_OPTIONS)[number]["key"]

function inferStatusExpiryKey(value: string | null | undefined): StatusExpiryKey {
  if (!value) return "never"
  const expiryMs = new Date(value).getTime()
  if (Number.isNaN(expiryMs)) return "never"
  const diffMinutes = Math.round((expiryMs - Date.now()) / 60000)
  if (diffMinutes <= 0) return "never"

  const timedOptions = STATUS_EXPIRY_OPTIONS.filter((option) => option.minutes !== null)
  const closest = [...timedOptions].sort((a, b) => Math.abs((a.minutes ?? 0) - diffMinutes) - Math.abs((b.minutes ?? 0) - diffMinutes))[0]

  return (closest?.key ?? "never") as StatusExpiryKey
}

function getStatusExpiryIso(key: StatusExpiryKey): string {
  const option = STATUS_EXPIRY_OPTIONS.find((entry) => entry.key === key)
  if (!option || option.minutes === null) return ""
  return new Date(Date.now() + option.minutes * 60 * 1000).toISOString()
}

const CSS_TEMPLATE = `/**
 * Vortex full custom theme template
 *
 * Override any variable below. Everything in the app reads from these tokens.
 */

:root {
  /* App shell */
  --app-bg-primary: #313338;
  --app-bg-secondary: #2b2d31;
  --app-bg-tertiary: #1e1f22;
  --app-accent-color: #5865f2;

  /* Semantic theme tokens */
  --theme-bg-primary: #313338;
  --theme-bg-secondary: #2b2d31;
  --theme-bg-tertiary: #1e1f22;
  --theme-surface-elevated: #3f4147;
  --theme-surface-input: #383a40;

  --theme-text-primary: #f2f3f5;
  --theme-text-normal: #dcddde;
  --theme-text-secondary: #b5bac1;
  --theme-text-muted: #949ba4;
  --theme-text-faint: #4e5058;
  --theme-text-bright: #dbdee1;

  --theme-accent: #5865f2;
  --theme-link: #00a8fc;
  --theme-success: #23a55a;
  --theme-positive: #3ba55c;
  --theme-warning: #f0b132;
  --theme-danger: #f23f43;
  --theme-presence-offline: #80848e;

  /* Tailwind tokens (HSL values, no hsl() wrapper) */
  --background: 223 7% 20%;
  --foreground: 220 9% 95%;
  --card: 220 7% 18%;
  --card-foreground: 220 9% 95%;
  --popover: 220 7% 14%;
  --popover-foreground: 220 9% 95%;
  --primary: 235 86% 65%;
  --primary-foreground: 0 0% 100%;
  --secondary: 220 6% 18%;
  --secondary-foreground: 215 8% 73%;
  --accent: 235 86% 65%;
  --accent-foreground: 0 0% 100%;
  --muted: 220 5% 30%;
  --muted-foreground: 215 8% 60%;
  --border: 220 6% 25%;
  --input: 220 6% 18%;
  --ring: 235 86% 65%;
  --destructive: 359 87% 57%;
  --destructive-foreground: 0 0% 100%;
}

/* Optional element-level overrides */
.message-content a { color: var(--theme-link); }
`

/** Tabbed user settings dialog covering profile editing, account security (2FA, passkeys, sessions), and appearance preferences. */
export function ProfileSettingsModal({ open, onClose, user }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { setCurrentUser } = useAppStore(
    useShallow((s) => ({ setCurrentUser: s.setCurrentUser }))
  )
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState(user.display_name ?? "")
  const [username, setUsername] = useState(user.username)
  const [bio, setBio] = useState(user.bio ?? "")
  const [customTag, setCustomTag] = useState(user.custom_tag ?? "")
  const [statusMessage, setStatusMessage] = useState(user.status_message ?? "")
  const [statusEmoji, setStatusEmoji] = useState(user.status_emoji ?? "")
  const [statusExpiryKey, setStatusExpiryKey] = useState<StatusExpiryKey>(() => inferStatusExpiryKey(user.status_expires_at))
  const [status, setStatus] = useState(user.status)
  const [bannerColor, setBannerColor] = useState(user.banner_color ?? "#5865f2")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "connections" | "appearance">("profile")
  const avatarRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const toSettingsPayload = useAppearanceStore((s) => s.toSettingsPayload)

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setLoading(true)
    try {
      let avatarUrl = user.avatar_url

      // Upload new avatar if changed
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
        if (uploadError) throw uploadError

        const { data } = supabase.storage.from("avatars").getPublicUrl(path)
        avatarUrl = data.publicUrl + `?t=${Date.now()}`
      }

      const updates = {
        display_name: displayName.trim() || null,
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        custom_tag: customTag.trim() || null,
        status_message: statusMessage.trim() || null,
        status_emoji: statusEmoji.trim() || null,
        status_expires_at: getStatusExpiryIso(statusExpiryKey) || null,
        status,
        banner_color: bannerColor,
        avatar_url: avatarUrl,
        appearance_settings: toSettingsPayload(),
      }

      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save profile")
      }

      setCurrentUser(payload)
      toast({ title: "Profile updated!" })
      onClose()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save profile", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast({ variant: "destructive", title: "Sign out failed", description: error.message })
      return
    }
    router.push("/login")
    router.refresh()
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported image format",
        description: "Avatars must be JPG, PNG, GIF, or WebP.",
      })
      e.target.value = ""
      return
    }

    if (file.size > MAX_AVATAR_SIZE) {
      toast({
        variant: "destructive",
        title: "Image too large",
        description: "Avatars must be under 5 MB.",
      })
      e.target.value = ""
      return
    }

    setAvatarFile(file)
    if (avatarPreview && avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const displayNamePreview = displayName || user.username
  const tabMeta = {
    profile: {
      title: "My Account",
      subtitle: "Update your profile identity, status, and account details.",
    },
    security: {
      title: "Security",
      subtitle: "Manage login methods, recovery controls, and high-risk account actions.",
    },
    connections: {
      title: "Connections",
      subtitle: "Link Steam and social profiles to show your gaming and creator identity.",
    },
    appearance: {
      title: "Appearance",
      subtitle: "Adjust chat readability and visual comfort settings.",
    },
  } as const

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-hidden p-0"
        style={{ background: "var(--theme-bg-primary)", borderColor: "var(--theme-bg-tertiary)" }}
      >
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "profile" | "security" | "connections" | "appearance")} orientation="vertical" className="flex h-[80vh]">
          {/* Settings nav */}
          <div className="w-52 flex-shrink-0 p-4 flex flex-col" style={{ background: "var(--theme-bg-secondary)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
              User Settings
            </h3>

            <TabsList className="flex flex-col h-auto bg-transparent gap-0.5 w-full">
              <TabsTrigger value="profile" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "var(--theme-text-secondary)" }}>
                My Account
              </TabsTrigger>
              <TabsTrigger value="security" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "var(--theme-text-secondary)" }}>
                Security
              </TabsTrigger>
              <TabsTrigger value="connections" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "var(--theme-text-secondary)" }}>
                Connections
              </TabsTrigger>
              <TabsTrigger value="appearance" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "var(--theme-text-secondary)" }}>
                Appearance
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
                <DialogHeader className="mb-6 space-y-1">
                  <DialogTitle className="text-2xl font-semibold leading-tight text-white">{tabMeta[activeTab].title}</DialogTitle>
                  <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>{tabMeta[activeTab].subtitle}</p>
                </DialogHeader>

                <TabsContent value="profile" className="mt-0 space-y-8">
                  {/* Profile preview card */}
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--theme-bg-tertiary)" }}>
                    {/* Banner */}
                    <div
                      className="h-20 relative"
                      style={{ background: /^#[0-9a-f]{6}$/i.test(bannerColor) ? bannerColor : "var(--theme-accent)" }}
                    />

                    {/* Avatar */}
                    <div className="px-4 pb-4" style={{ background: "var(--theme-bg-secondary)" }}>
                      <div className="relative inline-block -mt-8 mb-3">
                        <div
                          className="cursor-pointer"
                          role="button"
                          tabIndex={0}
                          aria-label="Upload avatar"
                          onClick={() => avatarRef.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              avatarRef.current?.click()
                            }
                          }}
                        >
                          <Avatar className="w-20 h-20 ring-4" style={{ "--tw-ring-color": "var(--theme-bg-secondary)" } as React.CSSProperties}>
                            {avatarPreview && <AvatarImage src={avatarPreview} />}
                            <AvatarFallback
                              style={{ background: "var(--theme-accent)", color: "white", fontSize: "24px" }}
                            >
                              {displayNamePreview.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Upload className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <input
                          ref={avatarRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.gif,.webp"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </div>
                      <div className="font-bold text-white">{displayNamePreview}</div>
                      <div className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>#{user.username}</div>
                      {user.custom_tag && (
                        <div className="text-xs mt-1" style={{ color: "var(--theme-text-muted)" }}>{user.custom_tag}</div>
                      )}
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Display Name
                      </Label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={user.username}
                        style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Username
                      </Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Custom Tag / Subtitle
                      </Label>
                      <Input
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="e.g. Game Dev | Coffee Addict"
                        style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        About Me
                      </Label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell the world a little about yourself"
                        rows={3}
                        maxLength={190}
                        className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none"
                        style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
                      />
                      <div className="text-right text-xs" style={{ color: "var(--theme-text-faint)" }}>
                        {bio.length}/190
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Status
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.map(({ value, label, color }) => (
                          <button
                            key={value}
                            onClick={() => setStatus(value)}
                            className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors text-left"
                            style={{
                              background: status === value ? "rgba(255,255,255,0.1)" : "var(--theme-bg-tertiary)",
                              border: `1px solid ${status === value ? "var(--theme-accent)" : "transparent"}`,
                              color: "var(--theme-text-primary)",
                            }}
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Custom Status
                      </Label>
                      <div className="grid grid-cols-[90px_1fr] gap-2">
                        <Input
                          value={statusEmoji}
                          onChange={(e) => setStatusEmoji(e.target.value)}
                          placeholder="😀"
                          maxLength={8}
                          style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}
                        />
                        <Input
                          value={statusMessage}
                          onChange={(e) => setStatusMessage(e.target.value)}
                          placeholder="What are you up to?"
                          maxLength={128}
                          style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={statusExpiryKey}
                          onChange={(e) => setStatusExpiryKey(e.target.value as StatusExpiryKey)}
                          className="text-xs rounded px-2 py-1"
                          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
                        >
                          {STATUS_EXPIRY_OPTIONS.map((option) => (
                            <option key={option.key} value={option.key}>{option.label}</option>
                          ))}
                        </select>
                        {statusExpiryKey !== "never" && (
                          <button
                            type="button"
                            onClick={() => setStatusExpiryKey("never")}
                            className="text-xs px-2 py-1 rounded hover:bg-white/10"
                            style={{ color: "var(--theme-text-muted)" }}
                          >
                            Clear expiry
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                        Banner Color
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {BANNER_PRESETS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setBannerColor(color)}
                            className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                            style={{
                              background: color,
                              outline: bannerColor === color ? "2px solid white" : "none",
                              outlineOffset: "2px",
                            }}
                          />
                        ))}
                        {/* Custom color: show swatch of chosen color when custom, rainbow wheel otherwise */}
                        <label
                          className="w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 relative flex items-center justify-center overflow-hidden"
                          style={{
                            outline: !BANNER_PRESETS.includes(bannerColor) ? "2px solid white" : "none",
                            outlineOffset: "2px",
                          }}
                          title="Custom color"
                        >
                          {/* Rainbow background always visible as a ring */}
                          <span
                            className="absolute inset-0 rounded-full"
                            style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
                          />
                          {/* If custom color is active, show it as inner circle */}
                          {!BANNER_PRESETS.includes(bannerColor) && (
                            <span
                              className="absolute rounded-full"
                              style={{ inset: "3px", background: bannerColor }}
                            />
                          )}
                          <input
                            type="color"
                            value={bannerColor}
                            onChange={(e) => setBannerColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

      <div className="rounded-lg p-4 space-y-3" style={{ background: "rgba(242,63,67,0.08)", border: "1px solid rgba(242,63,67,0.35)" }}>
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: "color-mix(in srgb, var(--theme-danger) 70%, white)" }}>Danger Zone</h4>
                      <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)" }}>Signing out will end your current session on this device.</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="w-fit"
                      style={{ color: "var(--theme-danger)", background: "rgba(242,63,67,0.12)" }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Log Out
                    </Button>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: "var(--theme-bg-tertiary)" }}>
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      style={{ background: "var(--theme-accent)" }}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="security" className="mt-0 space-y-8">
                  <PasskeysSection />
                  <SecurityPolicySection />
                  <PasswordChangeSection />
                  <RecoveryCodesSection />
                  <SessionManagementSection onForcedLogout={handleLogout} />
                  <TwoFactorSection supabase={supabase} toast={toast} />
                </TabsContent>

                <TabsContent value="connections" className="mt-0 space-y-8">
                  <ConnectionsSection />
                </TabsContent>

                <TabsContent value="appearance" className="mt-0">
                  <AppearanceTab onSave={handleSave} saving={loading} />
                </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

type ConnectionRow = {
  id: string
  provider: string
  provider_user_id: string
  username: string | null
  display_name: string | null
  profile_url: string | null
  created_at: string
}

function ConnectionsSection() {
  const { toast } = useToast()
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [youtubeUsername, setYoutubeUsername] = useState("")
  const [youtubeProfileUrl, setYoutubeProfileUrl] = useState("")

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/users/connections", { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (res.ok) setConnections(payload.connections ?? [])
  }, [])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  async function connectSteam() {
    const next = window.location.pathname + window.location.search
    window.location.href = `/api/users/connections/steam/start?next=${encodeURIComponent(next)}`
  }

  async function connectYouTube(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch("/api/users/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "youtube", username: youtubeUsername, profile_url: youtubeProfileUrl }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to connect YouTube", description: payload.error || "Please try again" })
      setLoading(false)
      return
    }
    setYoutubeUsername("")
    setYoutubeProfileUrl("")
    setConnections((prev) => [...prev.filter((item) => item.provider !== "youtube"), payload.connection])
    setLoading(false)
  }

  async function removeConnection(id: string) {
    const res = await fetch(`/api/users/connections?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to remove connection" })
      return
    }
    setConnections((prev) => prev.filter((item) => item.id !== id))
  }

  const steamConnection = connections.find((item) => item.provider === "steam")
  const youtubeConnection = connections.find((item) => item.provider === "youtube")

  return (
    <div className="space-y-6">
      <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
        <h3 className="text-base font-semibold text-white">Steam</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Link your Steam account using official OpenID sign-in. We only store your Steam ID and profile URL.</p>
        {steamConnection && (
          <p className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>
            Connected as {steamConnection.display_name || steamConnection.username || steamConnection.provider_user_id}
          </p>
        )}
        <Button type="button" onClick={connectSteam} style={{ background: "var(--theme-accent)" }}>
          <Link2 className="w-4 h-4 mr-2" /> {steamConnection ? "Reconnect Steam" : "Connect Steam"}
        </Button>
      </div>

      <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
        <h3 className="text-base font-semibold text-white">YouTube</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Connect your YouTube channel so your creator identity appears next to Steam.</p>
        {youtubeConnection && (
          <p className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>
            Connected as {youtubeConnection.display_name || youtubeConnection.username || youtubeConnection.provider_user_id}
          </p>
        )}
        <form onSubmit={connectYouTube} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
          <Input value={youtubeUsername} onChange={(e) => setYoutubeUsername(e.target.value)} placeholder="YouTube username (optional)" />
          <Input value={youtubeProfileUrl} onChange={(e) => setYoutubeProfileUrl(e.target.value)} placeholder="https://youtube.com/@yourchannel" required />
          <Button type="submit" disabled={loading}>{loading ? "Connecting..." : "Connect YouTube"}</Button>
        </form>
      </div>

      <div className="space-y-2">
        {connections.map((connection) => (
          <div key={connection.id} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
            <div className="min-w-0">
              <p className="text-sm text-white capitalize">{connection.provider}</p>
              <p className="text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>{connection.display_name || connection.username || connection.provider_user_id}</p>
            </div>
            <div className="flex items-center gap-2">
              {connection.profile_url && (
                <a href={connection.profile_url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => removeConnection(connection.id)} style={{ color: "var(--theme-danger)" }}>Remove</Button>
            </div>
          </div>
        ))}
        {connections.length === 0 && <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No connections yet.</p>}
      </div>
    </div>
  )
}



function PasskeysSection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>>([])

  const loadCredentials = useCallback(async () => {
    const res = await fetch("/api/auth/passkeys/credentials")
    const payload = await res.json()
    if (res.ok) setCredentials(payload.credentials || [])
  }, [])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  async function handleRegisterPasskey() {
    setLoading(true)
    try {
      const { startPasskeyRegistration } = await import("@/lib/auth/passkeys-client")
      await startPasskeyRegistration("Primary passkey")
      toast({ title: "Passkey added", description: "Your account can now use passkey-first login." })
      await loadCredentials()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not register passkey", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function rename(id: string) {
    const name = window.prompt("Rename this device")
    if (!name) return
    const res = await fetch("/api/auth/passkeys/credentials", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name }) })
    if (res.ok) loadCredentials()
  }

  async function revoke(id: string) {
    const res = await fetch("/api/auth/passkeys/credentials", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
    if (res.ok) loadCredentials()
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Passkeys</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Passkeys are phishing-resistant and work across biometrics, device PIN, or hardware keys. Keep at least one backup passkey on a second device.</p>
      </div>
      <Button onClick={handleRegisterPasskey} disabled={loading} style={{ background: "var(--theme-positive)" }}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />} Register Passkey
      </Button>
      <div className="space-y-2">
        {credentials.map((cred) => (
          <div key={cred.id} className="rounded p-3 flex items-center gap-2" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
            <div className="flex-1">
              <p className="text-sm text-white">{cred.name}</p>
              <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Last used: {cred.last_used_at ? new Date(cred.last_used_at).toLocaleString() : "Never"}</p>
            </div>
            <button onClick={() => rename(cred.id)} className="p-2 rounded" style={{ background: "var(--theme-surface-input)" }}><Pencil className="w-4 h-4" /></button>
            <button onClick={() => revoke(cred.id)} className="p-2 rounded" style={{ background: "rgba(242,63,67,0.15)", color: "var(--theme-danger)" }}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {credentials.length === 0 && <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No passkeys yet. Add one now and keep password/magic-link recovery enabled until you register a backup device.</p>}
      </div>
    </div>
  )
}


function SecurityPolicySection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [policy, setPolicy] = useState({ passkey_first: false, enforce_passkey: false, fallback_password: true, fallback_magic_link: true })

  useEffect(() => {
    fetch("/api/auth/security/policy").then((res) => res.json()).then((data) => data.policy && setPolicy(data.policy)).catch(() => {})
  }, [])

  async function save(next: typeof policy) {
    setPolicy(next)
    setLoading(true)
    const res = await fetch("/api/auth/security/policy", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next) })
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update security policy" })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">Account Security Policy</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Choose passkey-first login. Owners/admins can optionally enforce passkeys and disable fallback methods.</p>
      </div>
      <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
        <label className="flex items-center justify-between text-sm" style={{ color: "var(--theme-text-secondary)" }}><span>Passkey-first sign in</span><input type="checkbox" checked={policy.passkey_first} onChange={(e) => save({ ...policy, passkey_first: e.target.checked })} /></label>
        <label className="flex items-center justify-between text-sm" style={{ color: "var(--theme-text-secondary)" }}><span>Enforce passkey (admins/owners optional)</span><input type="checkbox" checked={policy.enforce_passkey} onChange={(e) => save({ ...policy, enforce_passkey: e.target.checked })} /></label>
        <label className="flex items-center justify-between text-sm" style={{ color: "var(--theme-text-secondary)" }}><span>Allow password fallback</span><input type="checkbox" checked={policy.fallback_password} onChange={(e) => save({ ...policy, fallback_password: e.target.checked })} disabled={policy.enforce_passkey} /></label>
        <label className="flex items-center justify-between text-sm" style={{ color: "var(--theme-text-secondary)" }}><span>Allow magic-link fallback</span><input type="checkbox" checked={policy.fallback_magic_link} onChange={(e) => save({ ...policy, fallback_magic_link: e.target.checked })} disabled={policy.enforce_passkey} /></label>
      </div>
      {loading && <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Saving policy…</p>}
    </div>
  )
}


function PasswordChangeSection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      toast({ variant: "destructive", title: "Passwords do not match" })
      return
    }
    if (form.newPassword.length < 12) {
      toast({ variant: "destructive", title: "Password must be at least 12 characters" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          revokeOtherSessions,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Password change failed", description: data.error || "Please try again" })
        return
      }
      toast({ title: "Password changed", description: revokeOtherSessions ? "All other sessions have been revoked." : "Your password has been updated." })
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">Change Password</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Update your account password. Minimum 12 characters required.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-lg p-4 space-y-3" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
        <div className="space-y-1">
          <label htmlFor="current-password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>Current Password</label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              required
              className="w-full rounded px-3 py-2 pr-10 text-sm focus:outline-none"
              style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-elevated)" }}
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--theme-text-muted)" }}>
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>New Password</label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              required
              minLength={12}
              className="w-full rounded px-3 py-2 pr-10 text-sm focus:outline-none"
              style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-elevated)" }}
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--theme-text-muted)" }}>
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.newPassword.length > 0 && form.newPassword.length < 12 && (
            <p className="text-xs" style={{ color: "var(--theme-danger)" }}>Must be at least 12 characters ({form.newPassword.length}/12)</p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>Confirm New Password</label>
          <input
            id="confirm-password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
            className="w-full rounded px-3 py-2 text-sm focus:outline-none"
            style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-elevated)" }}
          />
          {form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword && (
            <p className="text-xs" style={{ color: "var(--theme-danger)" }}>Passwords do not match</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
          <input type="checkbox" checked={revokeOtherSessions} onChange={(e) => setRevokeOtherSessions(e.target.checked)} />
          Sign out all other sessions after changing password
        </label>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={loading || !form.currentPassword || !form.newPassword || !form.confirmPassword}
            className="px-4 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-4 h-4 inline mr-1" />Change Password</>}
          </button>
        </div>
      </form>
    </div>
  )
}


function RecoveryCodesSection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/recovery-codes")
      const data = await res.json()
      if (res.ok) {
        setRemaining(data.remaining ?? 0)
        setTotal(data.total ?? 0)
      }
    } catch {
      // Silently handle — recovery codes may not be set up yet
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch("/api/auth/recovery-codes", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to generate recovery codes", description: data.error })
        return
      }
      setCodes(data.codes)
      setAcknowledged(false)
      toast({ title: "Recovery codes generated", description: "Save these codes in a safe place. They will not be shown again." })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message })
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyCodes() {
    if (!codes) return
    await navigator.clipboard.writeText(codes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDismissCodes() {
    setCodes(null)
    setAcknowledged(false)
    loadStatus()
  }

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="animate-spin" style={{ color: "var(--theme-text-muted)" }} /></div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">Recovery Codes</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
          Recovery codes let you access your account if you lose your authenticator app or passkey. Each code can only be used once.
        </p>
      </div>

      {/* Show generated codes */}
      {codes && (
        <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
          <div className="rounded-lg p-3" style={{ background: "rgba(250,166,26,0.1)", border: "1px solid rgba(250,166,26,0.3)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--theme-warning)" }}>Save these codes now</p>
            <p className="text-xs mt-1" style={{ color: "var(--theme-warning)" }}>
              These codes will not be shown again. Store them somewhere safe and accessible — like a password manager or printed copy.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {codes.map((code, i) => (
              <div key={i} className="rounded px-3 py-2 text-center font-mono text-sm" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}>
                {code}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleCopyCodes} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-secondary)" }}>
              {copied ? <Check className="w-4 h-4" style={{ color: "var(--theme-success)" }} /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy all"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I have saved these recovery codes in a safe place
          </label>
          <button
            onClick={handleDismissCodes}
            disabled={!acknowledged}
            className="w-full py-2 rounded text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            Done
          </button>
        </div>
      )}

      {/* Status and generate/regenerate button */}
      {!codes && (
        <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: total > 0 ? "rgba(35,165,90,0.1)" : "var(--theme-bg-secondary)", border: `1px solid ${total > 0 ? "var(--theme-success)" : "var(--theme-bg-tertiary)"}` }}>
          <KeyRound className="w-6 h-6 flex-shrink-0" style={{ color: total > 0 ? "var(--theme-success)" : "var(--theme-text-faint)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              {total > 0 ? `${remaining} of ${total} codes remaining` : "No recovery codes generated"}
            </p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
              {total > 0 ? "Generate new codes to replace the current set." : "Generate codes to protect against losing access to your authenticator."}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {total > 0 ? "Regenerate" : "Generate"}
          </button>
        </div>
      )}

      {total > 0 && remaining <= 2 && remaining > 0 && !codes && (
        <div className="rounded p-3" style={{ background: "rgba(250,166,26,0.08)", border: "1px solid rgba(250,166,26,0.3)" }}>
          <p className="text-xs" style={{ color: "var(--theme-warning)" }}>
            You are running low on recovery codes. Consider regenerating a new set.
          </p>
        </div>
      )}
    </div>
  )
}


interface AuthSessionRow {
  id: string
  created_at: string
  last_seen_at: string | null
  user_agent: string | null
  ip_address: string | null
  expires_at: string | null
  revoked_at: string | null
}

function SessionManagementSection({ onForcedLogout }: { onForcedLogout: () => Promise<void> | void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<AuthSessionRow[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/sessions")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions")
        return res.json()
      })
      .then((payload) => {
        if (Array.isArray(payload.sessions)) {
          setSessions(payload.sessions)
          setSessionsError(null)
        } else {
          setSessionsError("Unexpected sessions payload")
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load sessions", error)
        setSessionsError(error instanceof Error ? error.message : "Failed to load sessions")
      })
  }, [])

  async function revokeSession(sessionId: string) {
    const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" })
    if (res.ok) {
      setSessions((prev) => prev.map((session) => session.id === sessionId ? { ...session, revoked_at: new Date().toISOString() } : session))
      toast({ title: "Session revoked" })
    } else {
      const payload = await res.json().catch(() => ({}))
      toast({ variant: "destructive", title: "Failed to revoke session", description: payload.error || "Please try again" })
    }
  }

  async function revokeAll() {
    setLoading(true)
    const res = await fetch("/api/auth/sessions", { method: "DELETE" })
    if (res.ok) {
      toast({ title: "All sessions revoked", description: "Trusted devices and active sessions have been removed." })
      await onForcedLogout()
    } else {
      const payload = await res.json().catch(() => ({}))
      toast({ variant: "destructive", title: "Failed to revoke sessions", description: payload.error || "Please try again" })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">Session Management</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Mark devices as trusted to reduce repeated prompts. If a device is lost, revoke all sessions immediately.</p>
      </div>
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Active sessions</p>
        {sessionsError && <p className="text-xs" style={{ color: "var(--theme-danger)" }}>{sessionsError}</p>}
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-white truncate">{session.user_agent || "Unknown device"}</p>
              <p className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>Last seen: {session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : "Unknown"}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={Boolean(session.revoked_at)} onClick={() => revokeSession(session.id)}>{session.revoked_at ? "Revoked" : "Revoke"}</Button>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-4 space-y-3" style={{ background: "rgba(242,63,67,0.08)", border: "1px solid rgba(242,63,67,0.35)" }}>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>This action signs out all active sessions and removes trusted devices.</p>
        <Button variant="outline" onClick={revokeAll} disabled={loading} style={{ borderColor: "var(--theme-danger)", color: "var(--theme-danger)", background: "rgba(242,63,67,0.1)" }}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Revoke All Sessions
        </Button>
      </div>
    </div>
  )
}

// ─── Appearance Tab ────────────────────────────────────────────────────────────

function AppearanceTab({ onSave, saving }: { onSave: () => Promise<void>; saving: boolean }) {
  const { toast } = useToast()
  const { messageDisplay, fontScale, saturation, themePreset, customCss, setMessageDisplay, setFontScale, setSaturation, setThemePreset, setCustomCss } = useAppearanceStore(
    useShallow((s) => ({ messageDisplay: s.messageDisplay, fontScale: s.fontScale, saturation: s.saturation, themePreset: s.themePreset, customCss: s.customCss, setMessageDisplay: s.setMessageDisplay, setFontScale: s.setFontScale, setSaturation: s.setSaturation, setThemePreset: s.setThemePreset, setCustomCss: s.setCustomCss }))
  )
  const { notificationSoundEnabled, setNotificationSoundEnabled, playNotification } = useNotificationSound()

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Theme Presets</h3>
        <p className="text-sm mb-4" style={{ color: "var(--theme-text-muted)" }}>
          Pick a skin — changes apply instantly. Layer your own CSS on top for full BetterDiscord-style customization.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            {
              key: "discord",
              label: "Discord Classic",
              desc: "Familiar dark blue-grey",
              swatches: ["var(--theme-bg-primary)", "var(--theme-accent)", "var(--theme-success)"],
            },
            {
              key: "midnight-neon",
              label: "Midnight Neon",
              desc: "Deep navy + cyan glow",
              swatches: ["#1b1f31", "#00e5ff", "#f700ff"],
            },
            {
              key: "synthwave",
              label: "Synthwave",
              desc: "Retro purple + pink",
              swatches: ["#2a1e46", "#f92aad", "#7c3aed"],
            },
            {
              key: "carbon",
              label: "Carbon Glass",
              desc: "Near-black + green",
              swatches: ["#1f2124", "var(--theme-positive)", "#5b8af0"],
            },
          ] as const).map((preset) => (
            <button
              type="button"
              key={preset.key}
              onClick={() => setThemePreset(preset.key)}
              className="rounded-lg border px-3 py-2.5 text-left flex flex-col gap-2"
              style={{
                background: themePreset === preset.key ? "rgba(88,101,242,0.15)" : "var(--theme-bg-secondary)",
                borderColor: themePreset === preset.key ? "var(--theme-accent)" : "var(--theme-bg-tertiary)",
                color: themePreset === preset.key ? "var(--theme-text-primary)" : "var(--theme-text-secondary)",
              }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium">{preset.label}</span>
                <div className="flex gap-1">
                  {preset.swatches.map((color) => (
                    <span key={color} className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  ))}
                </div>
              </div>
              <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{preset.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Message Display */}
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Message Display</h3>
        <p className="text-sm mb-4" style={{ color: "var(--theme-text-muted)" }}>
          Choose how messages look in the chat.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["cozy", "compact"] as MessageDisplay[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setMessageDisplay(mode)}
              className="flex flex-col items-start gap-2 p-3 rounded-lg text-left transition-colors border"
              style={{
                background: messageDisplay === mode ? "rgba(88,101,242,0.15)" : "var(--theme-bg-secondary)",
                borderColor: messageDisplay === mode ? "var(--theme-accent)" : "var(--theme-bg-tertiary)",
              }}
            >
              <div className="w-full space-y-1.5 pointer-events-none">
                {mode === "cozy" ? (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: "var(--theme-accent)" }} />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 rounded w-16" style={{ background: "var(--theme-text-primary)" }} />
                        <div className="h-2 rounded w-24" style={{ background: "var(--theme-text-muted)" }} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {[28, 20, 24, 16].map((w, i) => (
                      <div key={i} className="flex items-center gap-1.5 h-2.5">
                        <div className="w-5 h-1.5 rounded flex-shrink-0" style={{ background: "var(--theme-text-faint)" }} />
                        <div className="h-1.5 rounded" style={{ background: "var(--theme-text-muted)", width: `${w}px` }} />
                        <div className="h-1.5 rounded flex-1" style={{ background: "var(--theme-text-muted)" }} />
                      </div>
                    ))}
                  </>
                )}
              </div>
              <span className="text-sm font-medium capitalize" style={{ color: messageDisplay === mode ? "var(--theme-text-primary)" : "var(--theme-text-secondary)" }}>
                {mode}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-white mb-1">Custom CSS</h3>
        <p className="text-sm mb-3" style={{ color: "var(--theme-text-muted)" }}>
          Paste your full theme CSS here. Override the global tokens in the template (or add your own selectors). Your CSS is injected on top of the selected preset, so custom tokens and rules apply app-wide instantly.
        </p>
        <textarea
          value={customCss}
          onChange={(event) => setCustomCss(event.target.value)}
          placeholder={CSS_TEMPLATE}
          spellCheck={false}
          className="w-full min-h-[240px] rounded-lg border p-3 text-xs font-mono leading-relaxed"
          style={{ background: "var(--theme-bg-tertiary)", borderColor: customCss.length > 50000 ? "var(--theme-danger)" : "var(--theme-bg-tertiary)", color: "var(--theme-text-normal)", resize: "vertical" }}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCustomCss(CSS_TEMPLATE)}>Use Template</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(CSS_TEMPLATE)
                toast({ title: "Template copied" })
              }}
            >
              Copy Template
            </Button>
            {customCss.trim() && (
              <Button type="button" variant="outline" size="sm" onClick={() => setCustomCss("")} style={{ color: "var(--theme-danger)", borderColor: "rgba(242,63,67,0.4)" }}>
                Clear
              </Button>
            )}
          </div>
          <span className="text-xs tabular-nums" style={{ color: customCss.length > 50000 ? "var(--theme-danger)" : "var(--theme-text-faint)" }}>
            {customCss.length.toLocaleString()} / 50,000
          </span>
        </div>
      </div>

      {/* Font Size */}
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Chat Font Scaling</h3>
        <p className="text-sm mb-4" style={{ color: "var(--theme-text-muted)" }}>
          Choose a comfortable size for reading messages.
        </p>
        <div className="flex items-center gap-3">
          {(["small", "normal", "large"] as FontScale[]).map((scale) => (
            <button
              key={scale}
              onClick={() => setFontScale(scale)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border capitalize"
              style={{
                background: fontScale === scale ? "rgba(88,101,242,0.15)" : "var(--theme-bg-secondary)",
                borderColor: fontScale === scale ? "var(--theme-accent)" : "var(--theme-bg-tertiary)",
                color: fontScale === scale ? "var(--theme-text-primary)" : "var(--theme-text-secondary)",
                fontSize: scale === "small" ? "13px" : scale === "large" ? "15px" : "14px",
              }}
            >
              Aa
              <span className="block text-xs mt-0.5">{scale}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-white mb-1">Accessibility</h3>
        <div
          className="flex items-center justify-between p-3 rounded-lg"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <div>
            <p className="text-sm font-medium text-white">Reduced Saturation</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
              Desaturates interface colors for color-sensitivity.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={saturation === "reduced"}
            onClick={() => setSaturation(saturation === "reduced" ? "normal" : "reduced")}
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{ background: saturation === "reduced" ? "var(--theme-accent)" : "var(--theme-text-faint)" }}
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5"
              style={{
                background: "white",
                marginLeft: saturation === "reduced" ? "22px" : "2px",
                transition: "margin-left 0.2s",
              }}
            />
          </button>
        </div>
      </div>

      {/* Notification Sound */}
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Notification Sound</h3>
        <div
          className="flex items-center justify-between p-3 rounded-lg"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <div>
            <p className="text-sm font-medium text-white">Play sound on new messages</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
              Plays a short tone when you receive a message in another channel or DM.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={notificationSoundEnabled}
            onClick={() => {
              const next = !notificationSoundEnabled
              setNotificationSoundEnabled(next)
              if (next) playNotification()
            }}
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{ background: notificationSoundEnabled ? "var(--theme-accent)" : "var(--theme-text-faint)" }}
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5"
              style={{
                background: "white",
                marginLeft: notificationSoundEnabled ? "22px" : "2px",
                transition: "margin-left 0.2s",
              }}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} style={{ background: "var(--theme-accent)" }}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Theme & Appearance
        </Button>
      </div>
    </div>
  )
}

// ─── 2FA / MFA Section ────────────────────────────────────────────────────────

function TwoFactorSection({ supabase, toast }: { supabase: ReturnType<typeof import("@/lib/supabase/client").createClientSupabaseClient>; toast: ReturnType<typeof import("@/components/ui/use-toast").useToast>["toast"] }) {
  const [factors, setFactors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false)
  const [recoveryCopied, setRecoveryCopied] = useState(false)

  const loadFactors = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors(data?.totp ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadFactors() }, [loadFactors])

  async function handleEnroll() {
    setEnrolling(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "VortexChat" })
    if (error || !data) {
      toast({ variant: "destructive", title: "Failed to start 2FA setup", description: error?.message })
      setEnrolling(false)
      return
    }
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setFactorId(data.id)
    setEnrolling(false)
  }

  async function handleVerify() {
    if (!factorId || verifyCode.length !== 6) return
    setVerifying(true)
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) {
      toast({ variant: "destructive", title: "Challenge failed", description: challengeError.message })
      setVerifying(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challengeData.id, code: verifyCode })
    if (verifyError) {
      toast({ variant: "destructive", title: "Invalid code", description: "The code you entered is incorrect." })
    } else {
      // Generate recovery codes automatically during MFA enrollment
      let generatedCodes = false
      try {
        const codesRes = await fetch("/api/auth/recovery-codes", { method: "POST" })
        const codesData = await codesRes.json()
        if (codesRes.ok && codesData.codes) {
          setRecoveryCodes(codesData.codes)
          setRecoveryAcknowledged(false)
          generatedCodes = true
          toast({ title: "2FA enabled!", description: "Save your recovery codes below before closing this dialog." })
        }
      } catch {
        // Recovery code generation is non-critical — toast a warning but don't block
      }
      if (!generatedCodes) {
        toast({ title: "2FA enabled!", description: "Your account is now protected with two-factor authentication. Generate recovery codes from the Recovery Codes section." })
      }
      setQrCode(null); setSecret(null); setFactorId(null); setVerifyCode("")
      loadFactors()
    }
    setVerifying(false)
  }

  async function handleUnenroll(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    if (error) {
      toast({ variant: "destructive", title: "Failed to disable 2FA", description: error.message })
    } else {
      toast({ title: "2FA disabled" })
      loadFactors()
    }
  }

  function copySecret() {
    if (!secret) return
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const verified = factors.filter((f) => f.status === "verified")
  const has2FA = verified.length > 0

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: "var(--theme-text-muted)" }} /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Two-Factor Authentication</h3>
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
          Add an extra layer of security to your account using an authenticator app (Google Authenticator, Authy, etc.).
        </p>
      </div>

      {/* Current 2FA status */}
      <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: has2FA ? "rgba(35,165,90,0.1)" : "var(--theme-bg-secondary)", border: `1px solid ${has2FA ? "var(--theme-success)" : "var(--theme-bg-tertiary)"}` }}>
        {has2FA
          ? <ShieldCheck className="w-6 h-6 flex-shrink-0" style={{ color: "var(--theme-success)" }} />
          : <ShieldOff className="w-6 h-6 flex-shrink-0" style={{ color: "var(--theme-text-faint)" }} />}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{has2FA ? "2FA is enabled" : "2FA is not enabled"}</p>
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            {has2FA ? `${verified.length} authenticator app${verified.length > 1 ? "s" : ""} registered.` : "Your account is protected by password only."}
          </p>
        </div>
        {has2FA
          ? (
            <button onClick={() => handleUnenroll(verified[0].id)} className="px-3 py-1.5 rounded text-sm transition-colors" style={{ background: "rgba(242,63,67,0.15)", color: "var(--theme-danger)", border: "1px solid rgba(242,63,67,0.3)" }}>
              Remove
            </button>
          )
          : !qrCode && (
            <button onClick={handleEnroll} disabled={enrolling} className="px-3 py-1.5 rounded text-sm font-semibold transition-colors" style={{ background: "var(--theme-accent)", color: "white" }}>
              {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable 2FA"}
            </button>
          )}
      </div>

      {/* QR code enrollment flow */}
      {qrCode && (
        <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
          <p className="text-sm font-medium text-white">Scan with your authenticator app</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="2FA QR Code" className="w-40 h-40 rounded bg-white p-2 mx-auto" />
          {secret && (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs px-2 py-1.5 rounded break-all" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-muted)", fontFamily: "monospace" }}>{secret}</code>
              <button onClick={copySecret} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-secondary)" }} title="Copy secret">
                {copied ? <Check className="w-4 h-4" style={{ color: "var(--theme-success)" }} /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>Enter the 6-digit code from your app to confirm:</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-32 px-3 py-2 rounded text-center text-lg tracking-widest focus:outline-none"
                style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-elevated)", fontFamily: "monospace" }}
              />
              <button onClick={handleVerify} disabled={verifyCode.length !== 6 || verifying} className="px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50" style={{ background: "var(--theme-accent)", color: "white" }}>
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
              </button>
              <button onClick={() => { setQrCode(null); setSecret(null); setFactorId(null) }} className="px-3 py-2 rounded text-sm" style={{ color: "var(--theme-text-muted)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery codes generated during enrollment */}
      {recoveryCodes && (
        <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--theme-bg-secondary)", border: "1px solid rgba(250,166,26,0.4)" }}>
          <div className="rounded-lg p-3" style={{ background: "rgba(250,166,26,0.1)", border: "1px solid rgba(250,166,26,0.3)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--theme-warning)" }}>Save your recovery codes</p>
            <p className="text-xs mt-1" style={{ color: "var(--theme-warning)" }}>
              2FA is now active. Save these backup codes — they will not be shown again. Use them if you lose access to your authenticator app.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code, i) => (
              <div key={i} className="rounded px-3 py-2 text-center font-mono text-sm" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }}>
                {code}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join("\n"))
                setRecoveryCopied(true)
                setTimeout(() => setRecoveryCopied(false), 2000)
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-secondary)" }}
            >
              {recoveryCopied ? <Check className="w-4 h-4" style={{ color: "var(--theme-success)" }} /> : <Copy className="w-4 h-4" />}
              {recoveryCopied ? "Copied" : "Copy all"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--theme-text-secondary)" }}>
            <input type="checkbox" checked={recoveryAcknowledged} onChange={(e) => setRecoveryAcknowledged(e.target.checked)} />
            I have saved these recovery codes in a safe place
          </label>
          <button
            onClick={() => { setRecoveryCodes(null); setRecoveryAcknowledged(false) }}
            disabled={!recoveryAcknowledged}
            className="w-full py-2 rounded text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
