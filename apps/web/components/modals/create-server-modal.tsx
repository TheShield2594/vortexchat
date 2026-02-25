"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import type { ServerRow } from "@/types/database"
import { TemplateManager } from "@/components/modals/template-manager"

interface Props {
  open: boolean
  onClose: () => void
}

/** Dialog for creating a new server (with icon upload), joining via invite code, or applying a server template. */
export function CreateServerModal({ open, onClose }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { addServer } = useAppStore(
    useShallow((s) => ({ addServer: s.addServer }))
  )
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState("")
  const [mode, setMode] = useState<"create" | "join" | "template">("create")
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  // Revoke blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (iconPreview && iconPreview.startsWith("blob:")) {
        URL.revokeObjectURL(iconPreview)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      // Insert and fetch separately — PostgREST's INSERT RETURNING
      // can't read back the row within the same statement due to the
      // SELECT RLS policy checking server_members (added by AFTER INSERT trigger).
      // The fetch-back filters on owner_id + name to narrow the race window;
      // concurrent creates of the same-named server by one user is practically
      // impossible, but an RPC returning the inserted row would eliminate it entirely.
      const serverName = name.trim()
      const { error: insertError } = await supabase
        .from("servers")
        .insert({ name: serverName, owner_id: user.id, icon_url: iconUrl })

      if (insertError) throw insertError

      const { data: server, error } = await supabase
        .from("servers")
        .select()
        .eq("owner_id", user.id)
        .eq("name", serverName)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (error) throw error

      addServer(server)
      toast({ title: `Server "${server.name}" created!` })
      onClose()
      router.push(`/channels/${server.id}`)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to create server", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .rpc("join_server_by_invite", { p_invite_code: joinCode.trim() })

      if (error) {
        if (error.message.includes("Invalid invite code")) {
          throw new Error("Invalid invite code. Please check and try again.")
        }
        throw error
      }

      const server = data as unknown as ServerRow
      addServer(server)
      toast({ title: `Joined "${server.name}"!` })
      onClose()
      router.push(`/channels/${server.id}`)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to join server", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    if (iconPreview) URL.revokeObjectURL(iconPreview)
    setIconPreview(URL.createObjectURL(file))
  }

  function handleClose() {
    setName("")
    setIconFile(null)
    if (iconPreview) URL.revokeObjectURL(iconPreview)
    setIconPreview(null)
    setJoinCode("")
    setMode("create")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ background: 'var(--theme-bg-primary)', borderColor: 'var(--theme-bg-tertiary)', maxWidth: '440px' }}>
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl">
            {mode === "create" ? "Customize Your Server" : "Join a Server"}
          </DialogTitle>
          <p className="text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
            {mode === "create"
              ? "Give your server a personality with a name and icon."
              : "Enter an invite code to join an existing server."}
          </p>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${mode === "create" ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
            style={{ background: mode === "create" ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)' }}
          >
            Create New
          </button>
          <button
            onClick={() => setMode("join")}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${mode === "join" ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
            style={{ background: mode === "join" ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)' }}
          >
            Join Existing
          </button>
          <button
            onClick={() => setMode("template")}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${mode === "template" ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
            style={{ background: mode === "template" ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)' }}
          >
            Import Template
          </button>
        </div>

        {mode === "create" ? (
          <div className="space-y-4">
            {/* Icon upload */}
            <div className="flex justify-center">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-white/50 transition-colors overflow-hidden"
                style={{ borderColor: 'var(--theme-text-faint)' }}
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--theme-text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>UPLOAD</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
                Server Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Server"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={{ background: 'var(--theme-bg-tertiary)', borderColor: 'var(--theme-bg-tertiary)', color: 'var(--theme-text-primary)' }}
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="w-full"
              style={{ background: 'var(--theme-accent)' }}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Server
            </Button>
          </div>
        ) : mode === "join" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
                Invite Code
              </Label>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. abc123def456"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                style={{ background: 'var(--theme-bg-tertiary)', borderColor: 'var(--theme-bg-tertiary)', color: 'var(--theme-text-primary)' }}
              />
            </div>

            <Button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              className="w-full"
              style={{ background: 'var(--theme-accent)' }}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Server
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
                Server Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template Powered Server"
                style={{ background: 'var(--theme-bg-tertiary)', borderColor: 'var(--theme-bg-tertiary)', color: 'var(--theme-text-primary)' }}
              />
            </div>
            <TemplateManager
              createName={name}
              createDescription={""}
              onServerCreated={(server) => {
                addServer(server)
                onClose()
                router.push(`/channels/${server.id}`)
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
