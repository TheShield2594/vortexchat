"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, ShieldCheck, Zap } from "lucide-react"
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
    <div className="rounded-lg p-8 shadow-2xl" style={{ background: "var(--theme-bg-primary)" }}>
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4"><div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--theme-accent)" }}><Zap className="w-7 h-7 text-white" /></div></div>
        <h1 className="text-2xl font-bold text-white">{isNewUser ? "Verify your email" : "Welcome back!"}</h1>
        <p style={{ color: "var(--theme-text-secondary)" }} className="text-sm mt-1">{isNewUser ? "Check your inbox for a verification link, then log in below." : "We’re so excited to see you again!"}</p>
      </div>

      <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "var(--theme-bg-secondary)", border: "1px solid var(--theme-bg-tertiary)", color: "var(--theme-text-secondary)" }}>
        <p className="font-medium text-white flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4" />Passkey-first security</p>
        <p>Use your device passkey for phishing-resistant sign in. If your policy allows it, password and magic link remain available as backups.</p>
      </div>

      <Button type="button" disabled={passkeyLoading} onClick={handlePasskeyLogin} className="w-full h-11 font-medium mb-4" style={{ background: "var(--theme-positive)" }}>
        {passkeyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue with Passkey
      </Button>

      {showFallbacks && (
        <>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>Email <span className="text-red-500">*</span></Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-10" style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>Password <span className="text-red-500">*</span></Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="h-10" style={{ background: "var(--theme-bg-tertiary)", borderColor: "var(--theme-bg-tertiary)", color: "var(--theme-text-primary)" }} />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 font-medium" style={{ background: "var(--theme-accent)" }}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Log In with Password
            </Button>
          </form>

          <Button type="button" variant="outline" disabled={magicLinkLoading} onClick={handleMagicLink} className="w-full h-10 mt-4" style={{ borderColor: "var(--theme-text-faint)", color: "var(--theme-text-secondary)", background: "transparent" }}>
            {magicLinkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Magic Link
          </Button>
        </>
      )}

      {!showFallbacks && <p className="text-xs mt-3" style={{ color: "var(--theme-warning)" }}>Your account policy requires passkey login. Contact an owner/admin if you need recovery help.</p>}

      <p className="text-center text-sm mt-6" style={{ color: "var(--theme-text-secondary)" }}>Need an account? <Link href="/register" className="hover:underline" style={{ color: "var(--theme-link)" }}>Register</Link></p>
    </div>
  )
}
