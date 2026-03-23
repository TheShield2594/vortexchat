"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Loader2 } from "lucide-react"
import { VortexLogo } from "@/components/ui/vortex-logo"

export default function RegisterPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
    confirmPassword: "",
  })
  const supabase = createClientSupabaseClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (form.password !== form.confirmPassword) {
      toast({ variant: "destructive", title: "Passwords do not match" })
      return
    }

    if (form.password.length < 12) {
      toast({ variant: "destructive", title: "Password must be at least 12 characters" })
      return
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/
    if (!usernameRegex.test(form.username)) {
      toast({
        variant: "destructive",
        title: "Invalid username",
        description: "Username must be 3-32 characters, letters, numbers, and underscores only",
      })
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            username: form.username.toLowerCase(),
            display_name: form.displayName || form.username,
          },
          emailRedirectTo: `${window.location.origin}/channels/me`,
        },
      })
      if (error) throw error

      toast({
        title: "Account created!",
        description: "Check your email to verify your account, then log in.",
      })
      router.push("/login?registered=true")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-surface rounded-2xl border p-8 shadow-2xl backdrop-blur">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <VortexLogo size={48} />
        </div>
        <h1 className="text-2xl font-bold font-display" style={{ color: 'var(--theme-text-bright)' }}>Create an account</h1>
        <p style={{ color: 'var(--theme-text-secondary)' }} className="text-sm mt-1">
          Join Vortex — then add a passkey in Security settings for passkey-first login.
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
            Email <span style={{ color: 'var(--theme-danger)' }}>*</span>
          </Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="auth-input h-10 border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
            Username <span style={{ color: 'var(--theme-danger)' }}>*</span>
          </Label>
          <Input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="cooluser123"
            required
            className="auth-input h-10 border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
            Display Name
          </Label>
          <Input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="How others see you"
            className="auth-input h-10 border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
            Password <span style={{ color: 'var(--theme-danger)' }}>*</span>
          </Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            className="auth-input h-10 border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
            Confirm Password <span style={{ color: 'var(--theme-danger)' }}>*</span>
          </Label>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
            className="auth-input h-10 border"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="auth-btn-accent w-full h-11 font-medium mt-2 border-0"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: 'var(--theme-text-secondary)' }}>
        Already have an account?{" "}
        <Link href="/login" className="hover:underline" style={{ color: 'var(--theme-link)' }}>
          Log In
        </Link>
      </p>

      <p className="text-center text-xs mt-4" style={{ color: 'var(--theme-text-faint)' }}>
        By registering, you agree to Vortex&apos;s{" "}
        <Link href="/terms" className="underline" style={{ color: "var(--theme-accent)" }}>Terms of Service</Link>
        {" "}and{" "}
        <Link href="/privacy" className="underline" style={{ color: "var(--theme-accent)" }}>Privacy Policy</Link>
        . Keep password/magic link recovery enabled until you add a backup passkey on another device.
      </p>
    </div>
  )
}
