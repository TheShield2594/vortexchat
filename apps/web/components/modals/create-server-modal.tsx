"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { cn } from "@/lib/utils/cn"

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateServerModal({ open, onClose }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { addServer } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState("")
  const [mode, setMode] = useState<"create" | "join">("create")
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClientSupabaseClient()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      let iconUrl: string | undefined

      if (iconFile) {
        const ext = iconFile.name.split(".").pop()
        const path = `${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("server-icons")
          .upload(path, iconFile, { upsert: true })
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from("server-icons")
          .getPublicUrl(path)
        iconUrl = urlData.publicUrl
      }

      const { data: server, error } = await supabase
        .from("servers")
        .insert({ name: name.trim(), owner_id: user.id, icon_url: iconUrl })
        .select()
        .single()

      if (error) throw error

      addServer(server)
      toast({ title: `Server "${server.name}" created!` })
      onClose()
      router.push(`/channels/${server.id}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to create server", description: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: server } = await supabase
        .from("servers")
        .select("*")
        .eq("invite_code", joinCode.trim().toLowerCase())
        .single()

      if (!server) throw new Error("Invalid invite code")

      const { error } = await supabase
        .from("server_members")
        .insert({ server_id: server.id, user_id: user.id })

      if (error && !error.message.includes("duplicate")) throw error

      addServer(server)
      toast({ title: `Joined "${server.name}"!` })
      onClose()
      router.push(`/channels/${server.id}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to join server", description: message })
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
  }

  function handleClose() {
    setName("")
    setIconFile(null)
    setIconPreview(null)
    setJoinCode("")
    setMode("create")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[440px] bg-vortex-bg-primary border-vortex-bg-tertiary">
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl">
            {mode === "create" ? "Customize Your Server" : "Join a Server"}
          </DialogTitle>
          <p className="text-center text-sm text-vortex-text-secondary">
            {mode === "create"
              ? "Give your server a personality with a name and icon."
              : "Enter an invite code to join an existing server."}
          </p>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("create")}
            className={cn(
              "flex-1 py-2 rounded text-sm font-medium transition-colors",
              mode === "create"
                ? "bg-vortex-accent text-white"
                : "bg-vortex-bg-secondary text-gray-400 hover:text-gray-200"
            )}
          >
            Create New
          </button>
          <button
            onClick={() => setMode("join")}
            className={cn(
              "flex-1 py-2 rounded text-sm font-medium transition-colors",
              mode === "join"
                ? "bg-vortex-accent text-white"
                : "bg-vortex-bg-secondary text-gray-400 hover:text-gray-200"
            )}
          >
            Join Existing
          </button>
        </div>

        {mode === "create" ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-full border-2 border-dashed border-vortex-text-muted flex items-center justify-center cursor-pointer hover:border-white/50 transition-colors overflow-hidden"
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload className="w-5 h-5 mx-auto mb-1 text-vortex-interactive" />
                    <span className="text-xs text-vortex-interactive">UPLOAD</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                Server Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Server"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="w-full bg-vortex-accent"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Server
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                Invite Code
              </Label>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. abc123def456"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
              />
            </div>

            <Button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              className="w-full bg-vortex-accent"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Server
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
