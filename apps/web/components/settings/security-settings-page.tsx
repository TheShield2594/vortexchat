"use client"

import { useState } from "react"
import { Shield, Key, ShieldCheck, ShieldOff, Eye, EyeOff, Loader2, Smartphone, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Props {
  userId: string
  hasTOTP: boolean
  userEmail: string
}

// userId is reserved for future audit-log queries; not used in current UI
export function SecuritySettingsPage({ userId: _userId, hasTOTP, userEmail }: Props) {
  const { toast } = useToast()
  const router = useRouter()
  const [supabase] = useState(() => createClientSupabaseClient())

  // Password change
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Sessions
  const [revokingAll, setRevokingAll] = useState(false)

  // Data export
  const [exporting, setExporting] = useState(false)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match" })
      return
    }
    if (newPassword.length < 12) {
      toast({ variant: "destructive", title: "Password too short", description: "Minimum 12 characters." })
      return
    }

    setChangingPassword(true)
    try {
      const stepUp = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: oldPassword }),
      })
      if (!stepUp.ok) {
        const step = await stepUp.json().catch(() => ({}))
        throw new Error(step.error ?? "Step-up verification failed")
      }

      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to change password")
      toast({ title: "Password changed", description: "Your password has been updated." })
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      setChangingPassword(false)
    }
  }

  async function revokeAllSessions() {
    setRevokingAll(true)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" })
      if (signOutError) {
        toast({ variant: "destructive", title: "Failed to revoke sessions", description: signOutError.message })
        setRevokingAll(false)
        return
      }
      router.replace("/login")
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Failed to revoke sessions", description: err instanceof Error ? err.message : undefined })
      setRevokingAll(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--theme-text-bright)" }}>
          Security &amp; Privacy
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--theme-text-muted)" }}>
          Manage your password, two-factor authentication, and active sessions.
        </p>
      </div>

      {/* 2FA Status */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Two-Factor Authentication
        </h2>
        <div
          className="rounded-lg p-4 flex items-center gap-4"
          style={{
            background: hasTOTP ? "rgba(35,165,90,0.08)" : "var(--theme-bg-secondary)",
            border: `1px solid ${hasTOTP ? "var(--theme-success)" : "var(--theme-bg-tertiary)"}`,
          }}
        >
          {hasTOTP
            ? <ShieldCheck className="w-8 h-8 flex-shrink-0" style={{ color: "var(--theme-success)" }} />
            : <ShieldOff className="w-8 h-8 flex-shrink-0" style={{ color: "var(--theme-text-faint)" }} />}
          <div className="flex-1">
            <p className="font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              {hasTOTP ? "2FA is enabled" : "2FA is not enabled"}
            </p>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              {hasTOTP
                ? "Your account is protected with an authenticator app."
                : "Add an extra layer of security with an authenticator app."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Smartphone className="w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              {hasTOTP ? "Manage via account settings" : "Set up via account settings"}
            </span>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          To manage 2FA enrollment, use the quick-access settings panel (click your name in the bottom-left).
        </p>
      </section>

      {/* Change Password */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Change Password
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="current-password" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showOld ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className="w-full px-3 py-2 pr-10 rounded-md text-sm focus:outline-none focus:ring-2"
                style={{
                  background: "var(--theme-surface-input)",
                  color: "var(--theme-text-primary)",
                  border: "1px solid var(--theme-bg-tertiary)",
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--theme-text-muted)" }}
                aria-label={showOld ? "Hide current password" : "Show current password"}
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                className="w-full px-3 py-2 pr-10 rounded-md text-sm focus:outline-none focus:ring-2"
                style={{
                  background: "var(--theme-surface-input)",
                  color: "var(--theme-text-primary)",
                  border: "1px solid var(--theme-bg-tertiary)",
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--theme-text-muted)" }}
                aria-label={showNew ? "Hide new password" : "Show new password"}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={12}
              className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
              style={{
                background: "var(--theme-surface-input)",
                color: "var(--theme-text-primary)",
                border: "1px solid var(--theme-bg-tertiary)",
              }}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-60 hover:brightness-110"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
            {changingPassword ? "Changing…" : "Change Password"}
          </button>
        </form>
      </section>

      {/* Sessions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Active Sessions
        </h2>
        <div
          className="rounded-lg p-4 flex items-start gap-4"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <Key className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--theme-text-muted)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
              Sign out everywhere
            </p>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              Revoke all active sessions and sign out of every device. You will be redirected to login.
            </p>
          </div>
          <button
            type="button"
            onClick={revokeAllSessions}
            disabled={revokingAll}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition-all"
            style={{
              background: "rgba(242,63,67,0.12)",
              color: "var(--theme-danger)",
              border: "1px solid rgba(242,63,67,0.3)",
            }}
          >
            {revokingAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {revokingAll ? "Signing out…" : "Sign out all"}
          </button>
        </div>
      </section>

      {/* Account email */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Account Email
        </h2>
        <div
          className="rounded-lg p-4 flex items-center gap-3"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <Shield className="w-5 h-5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{userEmail}</p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
              Email changes require verification. Contact support to update.
            </p>
          </div>
        </div>
      </section>

      {/* Data Export */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Your Data
        </h2>
        <div
          className="rounded-lg p-4 flex items-start gap-4"
          style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)" }}
        >
          <Download className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--theme-text-muted)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
              Export your data
            </p>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              Download a JSON file containing your profile, messages, DMs, friends, and server memberships.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                const res = await fetch("/api/users/export")
                if (!res.ok) throw new Error("Export failed")
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "vortexchat-export.json"
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
                toast({ title: "Export downloaded" })
              } catch {
                toast({ variant: "destructive", title: "Failed to export data" })
              } finally {
                setExporting(false)
              }
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            {exporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {exporting ? "Exporting…" : "Download"}
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Your export includes up to 10,000 recent messages and 5,000 reactions. Exports are generated in real time.
        </p>
      </section>
    </div>
  )
}
