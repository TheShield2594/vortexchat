"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, ShieldCheck, Sparkles } from "lucide-react"
import { startPasskeyLogin, supportsPasskeys } from "@/lib/auth/passkeys-client"

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
  const supabase = createClientSupabaseClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (error) throw error
      await supabase.from("users").update({ status: "online" }).eq("id", (await supabase.auth.getUser()).data.user!.id)
      router.push("/channels/me")
      router.refresh()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login failed", description: error.message || "Invalid email or password" })
    } finally {
      setLoading(false)
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
          {isNewUser ? "Check your inbox for a verification link, then log in below." : "We’re so excited to see you again!"}
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
