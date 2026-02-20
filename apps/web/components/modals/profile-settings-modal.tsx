"use client"

import { useState, useRef } from "react"
import { Loader2, Upload, LogOut } from "lucide-react"
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
import type { UserRow } from "@/types/database"
import { cn } from "@/lib/utils/cn"

interface Props {
  open: boolean
  onClose: () => void
  user: UserRow
}

const STATUS_OPTIONS = [
  { value: "online", label: "Online", color: "#23a55a" },
  { value: "idle", label: "Idle", color: "#f0b132" },
  { value: "dnd", label: "Do Not Disturb", color: "#f23f43" },
  { value: "invisible", label: "Invisible", color: "#80848e" },
] as const

const BANNER_PRESETS = [
  "#5865f2", "#eb459e", "#fee75c", "#57f287", "#ed4245",
  "#3ba55c", "#faa61a", "#7289da", "#2c2f33", "#99aab5",
]

export function ProfileSettingsModal({ open, onClose, user }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { setCurrentUser } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState(user.display_name ?? "")
  const [username, setUsername] = useState(user.username)
  const [bio, setBio] = useState(user.bio ?? "")
  const [customTag, setCustomTag] = useState(user.custom_tag ?? "")
  const [statusMessage, setStatusMessage] = useState(user.status_message ?? "")
  const [status, setStatus] = useState(user.status)
  const [bannerColor, setBannerColor] = useState(user.banner_color ?? "#5865f2")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const supabase = createClientSupabaseClient()

  async function handleSave() {
    setLoading(true)
    try {
      let avatarUrl = user.avatar_url

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true })
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
        status,
        banner_color: bannerColor,
        avatar_url: avatarUrl,
      }

      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single()

      if (error) throw error

      setCurrentUser(data)
      toast({ title: "Profile updated!" })
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to save profile", description: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const displayNamePreview = displayName || user.username

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 bg-vortex-bg-primary border-vortex-bg-tertiary">
        <div className="flex h-full min-h-[500px]">
          {/* Settings nav */}
          <div className="w-52 flex-shrink-0 p-4 flex flex-col bg-vortex-bg-secondary">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-vortex-interactive">
              User Settings
            </h3>

            <Tabs defaultValue="profile" orientation="vertical" className="flex-1">
              <TabsList className="flex flex-col h-auto bg-transparent gap-0.5 w-full">
                <TabsTrigger value="profile" className="w-full justify-start text-sm text-vortex-text-secondary data-[state=active]:bg-white/10 data-[state=active]:text-white rounded">
                  My Account
                </TabsTrigger>
                <TabsTrigger value="appearance" className="w-full justify-start text-sm text-vortex-text-secondary data-[state=active]:bg-white/10 data-[state=active]:text-white rounded">
                  Appearance
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-6">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  {/* Profile preview card */}
                  <div className="rounded-lg overflow-hidden border border-vortex-bg-tertiary">
                    <div
                      className="h-20 cursor-pointer relative"
                      style={{ background: bannerColor }}
                      onClick={() => {}}
                    />
                    <div className="px-4 pb-4 bg-vortex-bg-overlay">
                      <div className="relative inline-block -mt-8 mb-3">
                        <div
                          className="cursor-pointer"
                          onClick={() => avatarRef.current?.click()}
                        >
                          <Avatar className="w-20 h-20 ring-4 ring-vortex-bg-overlay">
                            {avatarPreview && <AvatarImage src={avatarPreview} />}
                            <AvatarFallback className="bg-vortex-accent text-white text-2xl">
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
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </div>
                      <div className="font-bold text-white">{displayNamePreview}</div>
                      <div className="text-sm text-vortex-text-secondary">#{user.username}</div>
                      {user.custom_tag && (
                        <div className="text-xs mt-1 text-vortex-interactive">{user.custom_tag}</div>
                      )}
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        Display Name
                      </Label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={user.username}
                        className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        Username
                      </Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        Custom Tag / Subtitle
                      </Label>
                      <Input
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="e.g. Game Dev | Coffee Addict"
                        className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        About Me
                      </Label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell the world a little about yourself"
                        rows={3}
                        maxLength={190}
                        className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none bg-vortex-bg-tertiary text-vortex-text-primary border border-vortex-bg-tertiary"
                      />
                      <div className="text-right text-xs text-vortex-text-muted">
                        {bio.length}/190
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        Status
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.map(({ value, label, color }) => (
                          <button
                            key={value}
                            onClick={() => setStatus(value)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors text-left text-vortex-text-primary",
                              status === value
                                ? "bg-white/10 border border-vortex-accent"
                                : "bg-vortex-bg-tertiary border border-transparent"
                            )}
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                        Custom Status
                      </Label>
                      <Input
                        value={statusMessage}
                        onChange={(e) => setStatusMessage(e.target.value)}
                        placeholder="What are you up to?"
                        maxLength={128}
                        className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
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
                        <input
                          type="color"
                          value={bannerColor}
                          onChange={(e) => setBannerColor(e.target.value)}
                          className="w-8 h-8 rounded-full cursor-pointer border-0 p-0"
                          title="Custom color"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-vortex-bg-tertiary">
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="text-vortex-danger"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Log Out
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      className="ml-auto bg-vortex-accent"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="appearance" className="mt-0">
                  <div className="text-white">Appearance settings coming soon.</div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
