"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Zap } from "lucide-react"

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
    <div className="rounded-lg p-8 shadow-2xl" style={{ background: '#313338' }}>
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#5865f2' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white">Create an account</h1>
        <p style={{ color: '#b5bac1' }} className="text-sm mt-1">
          Join Vortex — it&apos;s free, no strings attached.
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Username <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="cooluser123"
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Display Name
          </Label>
          <Input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="How others see you"
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Password <span className="text-red-500">*</span>
          </Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Confirm Password <span className="text-red-500">*</span>
          </Label>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 font-medium mt-2"
          style={{ background: '#5865f2' }}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: '#b5bac1' }}>
        Already have an account?{" "}
        <Link href="/login" className="hover:underline" style={{ color: '#00a8fc' }}>
          Log In
        </Link>
      </p>

      <p className="text-center text-xs mt-4" style={{ color: '#4e5058' }}>
        By registering, you agree to Vortex&apos;s terms of service.
        No data is sold. This is self-hosted.
      </p>
    </div>
  )
}
