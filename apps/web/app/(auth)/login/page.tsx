"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, ShieldCheck, Sparkles, KeyRound } from "lucide-react"
import { startPasskeyLogin, supportsPasskeys } from "@/lib/auth/passkeys-client"

type LoginStep = "credentials" | "mfa-challenge" | "recovery-code"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isNewUser = searchParams.get("registered") === "true"
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [policy, setPolicy] = useState<{ passkey_first?: boolean; enforce_passkey?: boolean; fallback_password?: boolean; fallback_magic_link?: boolean }>({})
  const [form, setForm] = useState({ email: "", password: "" })
  const [step, setStep] = useState<LoginStep>("credentials")
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [mfaLoading, setMfaLoading] = useState(false)
  const supabase = createClientSupabaseClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      // Use the server-side login endpoint with brute-force protection
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({ variant: "destructive", title: "Login failed", description: data.error || "Invalid credentials" })
        return
      }

      // Check if MFA challenge is needed
      if (data.requiresMfa && data.factorId) {
        setMfaFactorId(data.factorId)
        setStep("mfa-challenge")
        return
      }

      // Login succeeded without MFA — set user online and redirect
      await supabase.from("users").update({ status: "online" }).eq("id", data.userId)
      router.push("/channels/me")
      router.refresh()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login failed", description: error.message || "Something went wrong" })
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaFactorId || totpCode.length !== 6) return
    setMfaLoading(true)
    try {
      const res = await fetch("/api/auth/mfa-challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factorId: mfaFactorId, code: totpCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({ variant: "destructive", title: "Invalid code", description: data.error || "The code you entered is incorrect." })
        setTotpCode("")
        return
      }

      // MFA verified — redirect
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("users").update({ status: "online" }).eq("id", user.id)
      }
      router.push("/channels/me")
      router.refresh()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification failed", description: error.message })
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleRecoveryCodeRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!recoveryCode.trim()) return
    setMfaLoading(true)
    try {
      const res = await fetch("/api/auth/recovery-codes/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, code: recoveryCode.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({ variant: "destructive", title: "Recovery failed", description: data.error || "Invalid recovery code" })
        setRecoveryCode("")
        return
      }

      // Recovery code redeemed — follow the magic link to establish session
      if (data.actionLink) {
        window.location.href = data.actionLink
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Recovery failed", description: error.message })
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleMagicLink() {
    if (!form.email) {
      toast({ variant: "destructive", title: "Enter your email first" })
      return
    }
    setMagicLinkLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: form.email,
        options: { emailRedirectTo: `${window.location.origin}/channels/me` },
      })
      if (error) throw error
      toast({ title: "Magic link sent!", description: `Check ${form.email} for your login link.` })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to send magic link", description: error.message })
    } finally {
      setMagicLinkLoading(false)
    }
  }

  async function handlePasskeyLogin() {
    if (!supportsPasskeys()) {
      toast({ variant: "destructive", title: "Passkeys unavailable", description: "Your browser/device does not support WebAuthn passkeys." })
      return
    }
    setPasskeyLoading(true)
    try {
      const resolvedPolicy = await startPasskeyLogin(form.email || undefined, "Trusted browser")
      if (resolvedPolicy) setPolicy(resolvedPolicy)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Passkey login failed", description: error.message })
    } finally {
      setPasskeyLoading(false)
    }
  }

  const showFallbacks = !policy.enforce_passkey

  // MFA Challenge Screen
  if (step === "mfa-challenge") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-slate-100 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Two-factor authentication
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Enter your 2FA code</h1>
          <p className="mt-1 text-sm text-slate-300">
            Open your authenticator app and enter the 6-digit code.
          </p>
        </div>

        <form onSubmit={handleMfaVerify} className="space-y-4">
          <div className="flex justify-center">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="w-48 rounded-lg border border-white/10 bg-slate-800 px-4 py-3 text-center text-2xl tracking-[0.3em] text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <Button type="submit" disabled={totpCode.length !== 6 || mfaLoading} className="h-11 w-full bg-indigo-500 font-medium text-white transition hover:bg-indigo-400">
            {mfaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify
          </Button>
        </form>

        <div className="mt-6 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setStep("recovery-code")}
            className="flex w-full items-center justify-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <KeyRound className="h-4 w-4" /> Use a recovery code instead
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setStep("credentials"); setTotpCode(""); setMfaFactorId(null) }}
          className="mt-3 w-full text-center text-sm text-slate-400 transition hover:text-slate-200"
        >
          Back to login
        </button>
      </div>
    )
  }

  // Recovery Code Screen
  if (step === "recovery-code") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-slate-100 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
              <KeyRound className="h-3.5 w-3.5" /> Account recovery
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Use a recovery code</h1>
          <p className="mt-1 text-sm text-slate-300">
            Enter one of the recovery codes you saved during 2FA setup. Each code can only be used once.
          </p>
        </div>

        <form onSubmit={handleRecoveryCodeRedeem} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-code" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Recovery Code
            </Label>
            <Input
              id="recovery-code"
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              className="h-10 border-white/10 bg-slate-800 text-center font-mono text-lg tracking-wider text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <Button type="submit" disabled={!recoveryCode.trim() || mfaLoading} className="h-11 w-full bg-amber-600 font-medium text-white transition hover:bg-amber-500">
            {mfaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Redeem Recovery Code
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setStep("mfa-challenge"); setRecoveryCode("") }}
          className="mt-4 w-full text-center text-sm text-slate-400 transition hover:text-slate-200"
        >
          Back to 2FA code entry
        </button>

        <button
          type="button"
          onClick={() => { setStep("credentials"); setRecoveryCode(""); setTotpCode(""); setMfaFactorId(null) }}
          className="mt-2 w-full text-center text-sm text-slate-400 transition hover:text-slate-200"
        >
          Back to login
        </button>
      </div>
    )
  }

  // Credentials Screen (default)
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-slate-100 shadow-2xl backdrop-blur">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" /> Secure sign in
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white">{isNewUser ? "Verify your email" : "Welcome back!"}</h1>
        <p className="mt-1 text-sm text-slate-300">
          {isNewUser ? "Check your inbox for a verification link, then log in below." : "We're so excited to see you again!"}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
        <p className="mb-1 flex items-center gap-2 font-medium text-white"><ShieldCheck className="h-4 w-4 text-emerald-400" />Passkey-first security</p>
        <p>Use your device passkey for phishing-resistant sign in. If your policy allows it, password and magic link remain available as backups.</p>
      </div>

      <Button
        type="button"
        disabled={passkeyLoading}
        onClick={handlePasskeyLogin}
        className="mb-4 h-11 w-full bg-indigo-500 font-medium text-white transition hover:bg-indigo-400"
      >
        {passkeyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue with Passkey
      </Button>

      {showFallbacks && (
        <>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">Email <span className="text-red-400">*</span></Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="h-10 border-white/10 bg-slate-800 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">Password <span className="text-red-400">*</span></Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="h-10 border-white/10 bg-slate-800 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full bg-indigo-500 font-medium text-white transition hover:bg-indigo-400">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Log In with Password
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            disabled={magicLinkLoading}
            onClick={handleMagicLink}
            className="mt-4 h-10 w-full border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
          >
            {magicLinkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Magic Link
          </Button>
        </>
      )}

      {!showFallbacks && <p className="mt-3 text-xs text-amber-300">Your account policy requires passkey login. Contact an owner/admin if you need recovery help.</p>}

      <p className="mt-6 text-center text-sm text-slate-300">
        Need an account? <Link href="/register" className="text-indigo-300 hover:underline">Register</Link>
      </p>
    </div>
  )
}
