"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { EmojiPicker } from "frimousse"
import { Loader2, Upload, LogOut, ShieldCheck, ShieldOff, Copy, Check, KeyRound, Trash2, Pencil, Lock, RefreshCw, Eye, EyeOff, Link2, ExternalLink, Hash, Plus, GripVertical, Globe, Users } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useRouter, useSearchParams } from "next/navigation"
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
import type { UserRow, UserPinnedItemRow } from "@/types/database"
import { useNotificationSound } from "@/hooks/use-notification-sound"
import { STATUS_OPTIONS } from "@/lib/utils/status-options"

interface Props {
  open: boolean
  onClose: () => void
  user: UserRow
}

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
 * Your CSS is injected on top of the selected preset, so you only need to
 * override the values you want to change.
 */

:root {
  /* ── App shell backgrounds ─────────────────────────────────────────── */
  --app-bg-primary: #313338;
  --app-bg-secondary: #2b2d31;

  /* ── Surface palette ───────────────────────────────────────────────── */
  --theme-bg-primary: #313338;
  --theme-bg-secondary: #2b2d31;
  --theme-bg-tertiary: #1e1f22;
  --theme-surface-elevated: #3f4147;
  --theme-surface-input: #383a40;
  --theme-surface-elevation-1: #32353a;
  --theme-surface-elevation-3: #42464d;
  --theme-surface-passive: var(--theme-surface-elevation-1);
  --theme-surface-active: var(--theme-surface-elevation-3);
  --theme-focus-shift: color-mix(in srgb, var(--theme-accent) 35%, transparent);

  /* ── Typography ────────────────────────────────────────────────────── */
  --theme-text-primary: #f2f3f5;
  --theme-text-normal: #dcddde;
  --theme-text-secondary: #b5bac1;
  --theme-text-muted: #949ba4;
  --theme-text-faint: #959ca6;
  --theme-text-bright: #dbdee1;

  /* ── Accent & semantic colors ──────────────────────────────────────── */
  --theme-accent: #5865f2;
  --theme-accent-secondary: #eb459e;
  --theme-link: #00a8fc;
  --theme-success: #23a55a;
  --theme-positive: #3ba55c;
  --theme-warning: #f0b132;
  --theme-danger: #f23f43;
  --theme-presence-offline: #80848e;

  /* ── Tailwind design tokens (HSL values, no hsl() wrapper) ─────── */
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

function SortablePinItem({ pin, onRemove }: { pin: UserPinnedItemRow; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: "var(--theme-bg-secondary)",
    border: "1px solid var(--theme-bg-tertiary)",
  }
  return (
    <div ref={setNodeRef} style={style} role="listitem" className="flex items-center gap-2 px-3 py-2 rounded-lg">
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0 border-0 bg-transparent" aria-label={`Drag to reorder: ${pin.label}`}>
        <GripVertical className="w-3.5 h-3.5 flex-shrink-0 opacity-40" style={{ color: "var(--theme-text-muted)" }} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>{pin.label}</p>
        {pin.sublabel && <p className="text-[11px] truncate" style={{ color: "var(--theme-text-muted)" }}>{pin.sublabel}</p>}
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded capitalize" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-muted)" }}>{pin.pin_type}</span>
      <button type="button" onClick={() => onRemove(pin.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: "var(--theme-danger)" }} aria-label={`Remove pin: ${pin.label}`}>
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

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
  const [showStatusEmojiPicker, setShowStatusEmojiPicker] = useState(false)
  const statusEmojiPickerRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const toSettingsPayload = useAppearanceStore((s) => s.toSettingsPayload)

  // Interests / Tags
  const [interests, setInterests] = useState<string[]>(user.interests ?? [])
  const [interestInput, setInterestInput] = useState("")
  const [interestSaving, setInterestSaving] = useState(false)
  const MAX_TAGS = 15
  const TAG_REGEX = /^[a-z0-9][a-z0-9\-]*[a-z0-9]?$/

  // Pinned Items
  const [pins, setPins] = useState<UserPinnedItemRow[]>([])
  const [pinsLoading, setPinsLoading] = useState(true)
  const [newPin, setNewPin] = useState<{ pin_type: UserPinnedItemRow["pin_type"]; label: string; sublabel: string; url: string }>({
    pin_type: "link", label: "", sublabel: "", url: "",
  })
  const [pinSaving, setPinSaving] = useState(false)
  const MAX_PINS = 6

  // Activity visibility
  const [activityVisibility, setActivityVisibility] = useState<"public" | "friends" | "private">(
    (user.activity_visibility as "public" | "friends" | "private") ?? "public"
  )
  const [visibilitySaving, setVisibilitySaving] = useState(false)

  // Load pinned items
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPinsLoading(true)
    fetch("/api/users/pinned")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: { pins: UserPinnedItemRow[] }) => {
        if (!cancelled) setPins(json.pins ?? [])
      })
      .catch(() => { /* silently fail — empty state shown */ })
      .finally(() => { if (!cancelled) setPinsLoading(false) })
    return () => { cancelled = true }
  }, [open])

  const addInterestTag = useCallback(() => {
    const tag = interestInput.trim().toLowerCase()
    if (!tag) return
    if (tag.length > 30) {
      toast({ variant: "destructive", title: "Tag too long", description: "Max 30 characters." })
      return
    }
    if (tag.length === 1 && !/^[a-z0-9]$/.test(tag)) {
      toast({ variant: "destructive", title: "Invalid tag", description: "Use letters, numbers, and hyphens only." })
      return
    }
    if (tag.length > 1 && !TAG_REGEX.test(tag)) {
      toast({ variant: "destructive", title: "Invalid tag", description: "Use lowercase letters, numbers, and hyphens only." })
      return
    }
    if (interests.includes(tag)) {
      toast({ variant: "destructive", title: "Duplicate tag" })
      return
    }
    if (interests.length >= MAX_TAGS) {
      toast({ variant: "destructive", title: `Maximum ${MAX_TAGS} interests allowed` })
      return
    }
    setInterests((prev) => [...prev, tag])
    setInterestInput("")
  }, [interestInput, interests, toast])

  async function saveInterests() {
    setInterestSaving(true)
    try {
      const res = await fetch("/api/users/interests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save interests")
      }
      toast({ title: "Interests saved!" })
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Error saving interests" })
    } finally {
      setInterestSaving(false)
    }
  }

  async function addPin() {
    if (!newPin.label.trim()) {
      toast({ variant: "destructive", title: "Label is required" })
      return
    }
    setPinSaving(true)
    try {
      const res = await fetch("/api/users/pinned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin_type: newPin.pin_type,
          label: newPin.label.trim(),
          sublabel: newPin.sublabel.trim() || null,
          url: newPin.url.trim() || null,
          position: pins.length > 0 ? Math.max(...pins.map((p) => p.position)) + 1 : 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to add pin")
      setPins((prev) => [...prev, data.pin])
      setNewPin({ pin_type: "link", label: "", sublabel: "", url: "" })
      toast({ title: "Pin added!" })
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Error adding pin" })
    } finally {
      setPinSaving(false)
    }
  }

  async function removePin(pinId: string) {
    const res = await fetch(`/api/users/pinned?id=${pinId}`, { method: "DELETE" })
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to remove pin" })
      return
    }
    setPins((prev) => prev.filter((p) => p.id !== pinId))
  }

  const pinSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  async function handlePinDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = pins.findIndex((p) => p.id === active.id)
    const newIndex = pins.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic update
    const previousPins = pins
    const reordered = arrayMove(pins, oldIndex, newIndex).map((pin, i) => ({ ...pin, position: i }))
    setPins(reordered)

    // Persist each changed position
    try {
      const updates = reordered
        .filter((pin, i) => previousPins[i]?.id !== pin.id)
        .map((pin) =>
          fetch(`/api/users/pinned?id=${pin.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: pin.position }),
          })
        )
      const results = await Promise.all(updates)
      if (results.some((r) => !r.ok)) throw new Error("Failed to update pin order")
    } catch {
      setPins(previousPins)
      toast({ variant: "destructive", title: "Failed to reorder pins" })
    }
  }

  async function saveActivityVisibility(value: "public" | "friends" | "private") {
    const previousValue = activityVisibility
    setActivityVisibility(value)
    setVisibilitySaving(true)
    try {
      const res = await fetch("/api/users/activity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: value }),
      })
      if (!res.ok) throw new Error("Failed to update visibility")
      toast({ title: "Activity visibility updated" })
    } catch (err) {
      setActivityVisibility(previousValue)
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Error" })
    } finally {
      setVisibilitySaving(false)
    }
  }

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showStatusEmojiPicker) return
    function handleClickOutside(e: PointerEvent) {
      if (!statusEmojiPickerRef.current?.contains(e.target as Node)) {
        setShowStatusEmojiPicker(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [showStatusEmojiPicker])

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
                        <div className="relative" ref={statusEmojiPickerRef}>
                          <button
                            type="button"
                            onClick={() => setShowStatusEmojiPicker((v) => !v)}
                            aria-label="Choose status emoji"
                            aria-haspopup="dialog"
                            aria-expanded={showStatusEmojiPicker}
                            className="w-full h-10 flex items-center justify-center rounded text-xl transition-colors hover:brightness-110"
                            style={{ background: "var(--theme-bg-tertiary)", border: "1px solid var(--theme-bg-tertiary)" }}
                          >
                            {statusEmoji || <span style={{ opacity: 0.4, fontSize: "18px" }}>😀</span>}
                          </button>
                          {showStatusEmojiPicker && (
                            <div
                              role="dialog"
                              aria-label="Emoji picker"
                              className="absolute z-50 rounded-lg shadow-xl border overflow-hidden"
                              style={{
                                bottom: "calc(100% + 6px)",
                                left: 0,
                                width: 300,
                                height: 360,
                                background: "var(--theme-bg-secondary)",
                                borderColor: "var(--theme-bg-tertiary)",
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <EmojiPicker.Root
                                onEmojiSelect={({ emoji }) => {
                                  setStatusEmoji(emoji)
                                  setShowStatusEmojiPicker(false)
                                }}
                                style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
                              >
                                <div style={{ padding: "6px 6px 4px" }}>
                                  <EmojiPicker.Search
                                    autoFocus
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "5px 10px",
                                      borderRadius: "6px",
                                      fontSize: "13px",
                                      boxSizing: "border-box",
                                      background: "var(--theme-bg-tertiary)",
                                      color: "var(--theme-text-normal)",
                                      border: "none",
                                      outline: "none",
                                    }}
                                    placeholder="Search emoji…"
                                  />
                                </div>
                                <EmojiPicker.Viewport style={{ flex: 1, overflow: "hidden auto" }}>
                                  <EmojiPicker.Loading>
                                    <div style={{ padding: "12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>Loading…</div>
                                  </EmojiPicker.Loading>
                                  <EmojiPicker.Empty>
                                    {({ search }) => (
                                      <div style={{ padding: "12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>
                                        No emoji found for &ldquo;{search}&rdquo;
                                      </div>
                                    )}
                                  </EmojiPicker.Empty>
                                  <EmojiPicker.List
                                    components={{
                                      CategoryHeader: ({ category, ...props }) => (
                                        <div
                                          {...props}
                                          style={{
                                            padding: "3px 8px",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            color: "var(--theme-text-muted)",
                                            background: "var(--theme-bg-secondary)",
                                            position: "sticky",
                                            top: 0,
                                          }}
                                        >
                                          {category.label}
                                        </div>
                                      ),
                                      Emoji: ({ emoji, ...props }) => (
                                        <button
                                          type="button"
                                          {...props}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "18px",
                                            width: "100%",
                                            aspectRatio: "1",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            border: "none",
                                            background: emoji.isActive ? "var(--theme-surface-elevated)" : "transparent",
                                            fontFamily: "var(--frimousse-emoji-font)",
                                          }}
                                        >
                                          {emoji.emoji}
                                        </button>
                                      ),
                                    }}
                                  />
                                </EmojiPicker.Viewport>
                                <div style={{ padding: "4px 8px 6px", display: "flex", alignItems: "center", justifyContent: "flex-end", borderTop: "1px solid var(--theme-bg-tertiary)" }}>
                                  <EmojiPicker.SkinToneSelector
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      fontSize: "16px",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      border: "1px solid var(--theme-bg-tertiary)",
                                      background: "var(--theme-bg-tertiary)",
                                    }}
                                    aria-label="Change skin tone"
                                  />
                                </div>
                              </EmojiPicker.Root>
                            </div>
                          )}
                        </div>
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

                  {/* ── Interests / Tags ── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                        Interests
                      </h4>
                      <button
                        type="button"
                        onClick={saveInterests}
                        disabled={interestSaving}
                        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all hover:brightness-110 disabled:opacity-60"
                        style={{ background: "var(--theme-accent)", color: "white" }}
                      >
                        {interestSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Save
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                      Add up to {MAX_TAGS} tags — e.g.{" "}
                      <span style={{ color: "var(--theme-text-secondary)" }}>gaming, ai, self-hosting</span>
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} aria-hidden />
                        <input
                          type="text"
                          value={interestInput}
                          onChange={(e) => setInterestInput(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addInterestTag() } }}
                          maxLength={30}
                          placeholder="minecraft"
                          disabled={interests.length >= MAX_TAGS}
                          className="w-full pl-8 pr-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
                          style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
                          aria-label="Add interest tag"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addInterestTag}
                        disabled={!interestInput.trim() || interests.length >= MAX_TAGS}
                        className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all hover:brightness-110 disabled:opacity-50"
                        style={{ background: "var(--theme-bg-secondary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }}
                        aria-label="Add tag"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                    {interests.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5" role="list" aria-label="Your interests">
                        {interests.map((tag) => (
                          <span key={tag} role="listitem" className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium" style={{ background: "var(--theme-bg-secondary)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
                            <Hash className="w-2.5 h-2.5" aria-hidden />{tag}
                            <button type="button" onClick={() => setInterests((prev) => prev.filter((t) => t !== tag))} className="ml-0.5 rounded-full p-0.5 hover:bg-red-500/20 hover:text-red-400 transition-colors" aria-label={`Remove ${tag}`}>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic" style={{ color: "var(--theme-text-muted)" }}>No interests added yet.</p>
                    )}
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{interests.length}/{MAX_TAGS}</p>
                  </div>

                  {/* ── Pinned Items ── */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                      Pinned Items
                    </h4>
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                      Pin up to {MAX_PINS} items to your profile.
                    </p>
                    {pinsLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map((n) => (
                          <div key={n} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--theme-bg-secondary)" }} />
                        ))}
                      </div>
                    ) : pins.length > 0 ? (
                      <DndContext sensors={pinSensors} collisionDetection={closestCenter} onDragEnd={handlePinDragEnd}>
                        <SortableContext items={pins.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5" role="list" aria-label="Pinned items">
                            {pins.map((pin) => (
                              <SortablePinItem key={pin.id} pin={pin} onRemove={removePin} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <p className="text-xs italic" style={{ color: "var(--theme-text-muted)" }}>Nothing pinned yet.</p>
                    )}
                    {pins.length < MAX_PINS && (
                      <div className="rounded-lg p-3 space-y-2.5" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}>
                        <p className="text-xs font-semibold" style={{ color: "var(--theme-text-secondary)" }}>Add a pin</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["link", "message", "channel", "file"] as const).map((type) => (
                            <button key={type} type="button" onClick={() => setNewPin((prev) => ({ ...prev, pin_type: type }))} className="py-1.5 rounded text-xs font-medium capitalize transition-all" style={{ background: newPin.pin_type === type ? "color-mix(in srgb, var(--theme-accent) 15%, var(--theme-bg-tertiary))" : "var(--theme-bg-tertiary)", border: `1px solid ${newPin.pin_type === type ? "var(--theme-accent)" : "transparent"}`, color: newPin.pin_type === type ? "var(--theme-accent)" : "var(--theme-text-muted)" }}>
                              {type}
                            </button>
                          ))}
                        </div>
                        <input type="text" value={newPin.label} onChange={(e) => setNewPin((prev) => ({ ...prev, label: e.target.value }))} maxLength={120} placeholder="Label (required)" className="w-full px-3 py-2 rounded-md text-xs focus:outline-none focus:ring-2" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }} />
                        <input type="text" value={newPin.sublabel} onChange={(e) => setNewPin((prev) => ({ ...prev, sublabel: e.target.value }))} maxLength={80} placeholder="Sublabel (optional)" className="w-full px-3 py-2 rounded-md text-xs focus:outline-none focus:ring-2" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }} />
                        <input type="url" value={newPin.url} onChange={(e) => setNewPin((prev) => ({ ...prev, url: e.target.value }))} maxLength={2000} placeholder="URL (optional)" className="w-full px-3 py-2 rounded-md text-xs focus:outline-none focus:ring-2" style={{ background: "var(--theme-surface-input)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-bg-tertiary)" }} />
                        <button type="button" onClick={addPin} disabled={pinSaving || pinsLoading || !newPin.label.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all hover:brightness-110 disabled:opacity-60" style={{ background: "var(--theme-accent)", color: "white" }}>
                          {pinSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                          <Plus className="w-3 h-3" /> Add pin
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Activity Privacy ── */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                      Activity Privacy
                    </h4>
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                      Control who can see your recent activity feed.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "public" as const, label: "Public", icon: <Globe className="w-4 h-4" />, description: "Anyone" },
                        { value: "friends" as const, label: "Friends", icon: <Users className="w-4 h-4" />, description: "Friends only" },
                        { value: "private" as const, label: "Private", icon: <Lock className="w-4 h-4" />, description: "Only you" },
                      ]).map(({ value, label, icon, description }) => (
                        <button key={value} type="button" onClick={() => saveActivityVisibility(value)} disabled={visibilitySaving} className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-xs font-medium transition-all disabled:opacity-60" style={{ background: activityVisibility === value ? "color-mix(in srgb, var(--theme-accent) 15%, var(--theme-bg-secondary))" : "var(--theme-bg-secondary)", border: `1px solid ${activityVisibility === value ? "var(--theme-accent)" : "var(--theme-bg-tertiary)"}`, color: activityVisibility === value ? "var(--theme-accent)" : "var(--theme-text-muted)" }} aria-pressed={activityVisibility === value}>
                          {icon}
                          <span>{label}</span>
                          <span className="font-normal opacity-70">{description}</span>
                        </button>
                      ))}
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const [connections, setConnections] = useState<ConnectionRow[]>([])

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/users/connections", { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (res.ok) setConnections(payload.connections ?? [])
  }, [])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  useEffect(() => {
    const status = searchParams.get("connections")
    if (!status) return

    if (status === "youtube_linked" || status === "steam_linked") {
      const provider = status.startsWith("youtube") ? "YouTube" : "Steam"
      toast({ title: `${provider} connected!` })
      loadConnections()
    } else if (status.startsWith("youtube_") || status.startsWith("steam_")) {
      const provider = status.startsWith("youtube") ? "YouTube" : "Steam"
      toast({ variant: "destructive", title: `Failed to connect ${provider}`, description: status.replace(/_/g, " ") })
    }

    const url = new URL(window.location.href)
    url.searchParams.delete("connections")
    router.replace(url.pathname + url.search, { scroll: false })
  }, [searchParams, toast, loadConnections, router])

  async function connectSteam() {
    const next = window.location.pathname + window.location.search
    window.location.href = `/api/users/connections/steam/start?next=${encodeURIComponent(next)}`
  }

  function connectYouTube() {
    const next = window.location.pathname + window.location.search
    window.location.href = `/api/users/connections/youtube/start?next=${encodeURIComponent(next)}`
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
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Sign in with Google to link your YouTube channel. We only read your channel name and stats.</p>
        {youtubeConnection && (
          <p className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>
            Connected as {youtubeConnection.display_name || youtubeConnection.username || youtubeConnection.provider_user_id}
          </p>
        )}
        <Button type="button" onClick={connectYouTube} style={{ background: "var(--theme-accent)" }}>
          <Link2 className="w-4 h-4 mr-2" /> {youtubeConnection ? "Reconnect YouTube" : "Connect YouTube"}
        </Button>
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
            {
              key: "oled-black",
              label: "OLED Black",
              desc: "True black + teal",
              swatches: ["#000000", "#0abab5", "#00d4cf"],
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
    const currentPassword = window.prompt("Confirm your password to disable 2FA")
    if (!currentPassword) return

    const stepRes = await fetch("/api/auth/step-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword }),
    })
    if (!stepRes.ok) {
      const data = await stepRes.json().catch(() => ({}))
      toast({ variant: "destructive", title: "Step-up failed", description: data.error ?? "Could not verify identity" })
      return
    }

    const res = await fetch("/api/auth/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId: id }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to disable 2FA", description: payload.error ?? "Unknown error" })
      return
    }

    toast({ title: "2FA disabled" })
    loadFactors()
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
              <code className="flex-1 text-xs px-2 py-1.5 rounded break-all font-mono" style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-muted)" }}>{secret}</code>
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
                className="w-32 px-3 py-2 rounded text-center text-lg tracking-widest focus:outline-none font-mono"
                style={{ background: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-elevated)" }}
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
