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

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
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
      router.push("/channels/@me")
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid email or password",
      })
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
        options: { emailRedirectTo: `${window.location.origin}/channels/@me` },
      })
      if (error) throw error
      toast({
        title: "Magic link sent!",
        description: `Check ${form.email} for your login link.`,
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to send magic link",
        description: error.message,
      })
    } finally {
      setMagicLinkLoading(false)
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
        <h1 className="text-2xl font-bold text-white">Welcome back!</h1>
        <p style={{ color: '#b5bac1' }} className="text-sm mt-1">
          We&apos;re so excited to see you again!
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
              Password <span className="text-red-500">*</span>
            </Label>
          </div>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            className="h-10"
            style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 font-medium"
          style={{ background: '#5865f2' }}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Log In
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" style={{ borderColor: '#4e5058' }} />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span style={{ background: '#313338', color: '#4e5058' }} className="px-2">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={magicLinkLoading}
        onClick={handleMagicLink}
        className="w-full h-10"
        style={{ borderColor: '#4e5058', color: '#b5bac1', background: 'transparent' }}
      >
        {magicLinkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send Magic Link
      </Button>

      <p className="text-center text-sm mt-6" style={{ color: '#b5bac1' }}>
        Need an account?{" "}
        <Link href="/register" className="hover:underline" style={{ color: '#00a8fc' }}>
          Register
        </Link>
      </p>
    </div>
  )
}
