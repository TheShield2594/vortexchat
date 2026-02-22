"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2, Upload, LogOut, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react"
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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

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
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save profile", description: error.message })
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-hidden p-0"
        style={{ background: "#313338", borderColor: "#1e1f22" }}
      >
        <Tabs defaultValue="profile" orientation="vertical" className="flex h-[80vh]">
          {/* Settings nav */}
          <div className="w-52 flex-shrink-0 p-4 flex flex-col" style={{ background: "#2b2d31" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#949ba4" }}>
              User Settings
            </h3>

            <TabsList className="flex flex-col h-auto bg-transparent gap-0.5 w-full">
              <TabsTrigger value="profile" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "#b5bac1" }}>
                My Account
              </TabsTrigger>
                <TabsTrigger value="security" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "#b5bac1" }}>
                Security
              </TabsTrigger>
              <TabsTrigger value="appearance" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: "#b5bac1" }}>
                Appearance
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  {/* Profile preview card */}
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #1e1f22" }}>
                    {/* Banner */}
                    <div
                      className="h-20 relative"
                      style={{ background: /^#[0-9a-f]{6}$/i.test(bannerColor) ? bannerColor : "#5865f2" }}
                    />

                    {/* Avatar */}
                    <div className="px-4 pb-4" style={{ background: "#232428" }}>
                      <div className="relative inline-block -mt-8 mb-3">
                        <div
                          className="cursor-pointer"
                          onClick={() => avatarRef.current?.click()}
                        >
                          <Avatar className="w-20 h-20 ring-4" style={{ "--tw-ring-color": "#232428" } as React.CSSProperties}>
                            {avatarPreview && <AvatarImage src={avatarPreview} />}
                            <AvatarFallback
                              style={{ background: "#5865f2", color: "white", fontSize: "24px" }}
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
                      <div className="text-sm" style={{ color: "#b5bac1" }}>#{user.username}</div>
                      {user.custom_tag && (
                        <div className="text-xs mt-1" style={{ color: "#949ba4" }}>{user.custom_tag}</div>
                      )}
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        Display Name
                      </Label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={user.username}
                        style={{ background: "#1e1f22", borderColor: "#1e1f22", color: "#f2f3f5" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        Username
                      </Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ background: "#1e1f22", borderColor: "#1e1f22", color: "#f2f3f5" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        Custom Tag / Subtitle
                      </Label>
                      <Input
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="e.g. Game Dev | Coffee Addict"
                        style={{ background: "#1e1f22", borderColor: "#1e1f22", color: "#f2f3f5" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        About Me
                      </Label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell the world a little about yourself"
                        rows={3}
                        maxLength={190}
                        className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none"
                        style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #1e1f22" }}
                      />
                      <div className="text-right text-xs" style={{ color: "#4e5058" }}>
                        {bio.length}/190
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        Status
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.map(({ value, label, color }) => (
                          <button
                            key={value}
                            onClick={() => setStatus(value)}
                            className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors text-left"
                            style={{
                              background: status === value ? "rgba(255,255,255,0.1)" : "#1e1f22",
                              border: `1px solid ${status === value ? "#5865f2" : "transparent"}`,
                              color: "#f2f3f5",
                            }}
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
                        Custom Status
                      </Label>
                      <Input
                        value={statusMessage}
                        onChange={(e) => setStatusMessage(e.target.value)}
                        placeholder="What are you up to?"
                        maxLength={128}
                        style={{ background: "#1e1f22", borderColor: "#1e1f22", color: "#f2f3f5" }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>
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

                  <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "#1e1f22" }}>
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      style={{ color: "#f23f43" }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Log Out
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      className="ml-auto"
                      style={{ background: "#5865f2" }}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="security" className="mt-0">
                  <TwoFactorSection supabase={supabase} toast={toast} />
                </TabsContent>

                <TabsContent value="appearance" className="mt-0">
                  <div className="text-white">Appearance settings coming soon.</div>
                </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
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
      toast({ title: "2FA enabled!", description: "Your account is now protected with two-factor authentication." })
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
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: "#949ba4" }} /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Two-Factor Authentication</h3>
        <p className="text-sm" style={{ color: "#949ba4" }}>
          Add an extra layer of security to your account using an authenticator app (Google Authenticator, Authy, etc.).
        </p>
      </div>

      {/* Current 2FA status */}
      <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: has2FA ? "rgba(35,165,90,0.1)" : "#2b2d31", border: `1px solid ${has2FA ? "#23a55a" : "#1e1f22"}` }}>
        {has2FA
          ? <ShieldCheck className="w-6 h-6 flex-shrink-0" style={{ color: "#23a55a" }} />
          : <ShieldOff className="w-6 h-6 flex-shrink-0" style={{ color: "#4e5058" }} />}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{has2FA ? "2FA is enabled" : "2FA is not enabled"}</p>
          <p className="text-xs" style={{ color: "#949ba4" }}>
            {has2FA ? `${verified.length} authenticator app${verified.length > 1 ? "s" : ""} registered.` : "Your account is protected by password only."}
          </p>
        </div>
        {has2FA
          ? (
            <button onClick={() => handleUnenroll(verified[0].id)} className="px-3 py-1.5 rounded text-sm transition-colors" style={{ background: "rgba(242,63,67,0.15)", color: "#f23f43", border: "1px solid rgba(242,63,67,0.3)" }}>
              Remove
            </button>
          )
          : !qrCode && (
            <button onClick={handleEnroll} disabled={enrolling} className="px-3 py-1.5 rounded text-sm font-semibold transition-colors" style={{ background: "#5865f2", color: "white" }}>
              {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable 2FA"}
            </button>
          )}
      </div>

      {/* QR code enrollment flow */}
      {qrCode && (
        <div className="rounded-lg p-4 space-y-4" style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}>
          <p className="text-sm font-medium text-white">Scan with your authenticator app</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="2FA QR Code" className="w-40 h-40 rounded bg-white p-2 mx-auto" />
          {secret && (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs px-2 py-1.5 rounded break-all" style={{ background: "#1e1f22", color: "#949ba4", fontFamily: "monospace" }}>{secret}</code>
              <button onClick={copySecret} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded" style={{ background: "#383a40", color: "#b5bac1" }} title="Copy secret">
                {copied ? <Check className="w-4 h-4" style={{ color: "#23a55a" }} /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "#b5bac1" }}>Enter the 6-digit code from your app to confirm:</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-32 px-3 py-2 rounded text-center text-lg tracking-widest focus:outline-none"
                style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147", fontFamily: "monospace" }}
              />
              <button onClick={handleVerify} disabled={verifyCode.length !== 6 || verifying} className="px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50" style={{ background: "#5865f2", color: "white" }}>
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
              </button>
              <button onClick={() => { setQrCode(null); setSecret(null); setFactorId(null) }} className="px-3 py-2 rounded text-sm" style={{ color: "#949ba4" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
