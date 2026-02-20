"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Hash, Volume2, FolderOpen } from "lucide-react"
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
  serverId: string
  categoryId?: string
}

type ChannelType = "text" | "voice" | "category"

export function CreateChannelModal({ open, onClose, serverId, categoryId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { addChannel } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<ChannelType>("text")
  const supabase = createClientSupabaseClient()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const channelName = type === "category"
        ? name.trim()
        : name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")

      const { data: channel, error } = await supabase
        .from("channels")
        .insert({
          server_id: serverId,
          name: channelName,
          type,
          parent_id: categoryId || null,
        })
        .select()
        .single()

      if (error) throw error

      addChannel(channel)
      toast({ title: `Channel #${channel.name} created!` })
      onClose()

      if (type === "text") {
        router.push(`/channels/${serverId}/${channel.id}`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to create channel", description: message })
    } finally {
      setLoading(false)
      setName("")
      setType("text")
    }
  }

  const channelTypes: { type: ChannelType; label: string; description: string; icon: React.ReactNode }[] = [
    {
      type: "text",
      label: "Text",
      description: "Send messages, images, GIFs, emoji, and more",
      icon: <Hash className="w-5 h-5" />,
    },
    {
      type: "voice",
      label: "Voice",
      description: "Hang out together with voice and video",
      icon: <Volume2 className="w-5 h-5" />,
    },
    {
      type: "category",
      label: "Category",
      description: "Organize channels into groups",
      icon: <FolderOpen className="w-5 h-5" />,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={() => { setName(""); setType("text"); onClose() }}>
      <DialogContent className="max-w-[460px] bg-vortex-bg-primary border-vortex-bg-tertiary">
        <DialogHeader>
          <DialogTitle className="text-white">Create Channel</DialogTitle>
          {categoryId && (
            <p className="text-sm text-vortex-text-secondary">in a category</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-3 block text-vortex-text-secondary">
              Channel Type
            </Label>
            <div className="space-y-2">
              {channelTypes.map(({ type: t, label, description, icon }) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded cursor-pointer transition-colors text-left",
                    type === t
                      ? "bg-vortex-accent border border-vortex-accent"
                      : "bg-vortex-bg-secondary border border-transparent"
                  )}
                >
                  <span className={type === t ? "text-white" : "text-vortex-interactive"}>{icon}</span>
                  <div>
                    <div className="font-medium text-white text-sm">{label}</div>
                    <div className={cn(
                      "text-xs",
                      type === t ? "text-white/70" : "text-vortex-interactive"
                    )}>
                      {description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
              Channel Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              {type === "text" && (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vortex-interactive" />
              )}
              {type === "voice" && (
                <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vortex-interactive" />
              )}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "category" ? "New Category" : type === "voice" ? "General" : "new-channel"}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className={cn(
                  "bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary",
                  type !== "category" && "pl-8"
                )}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => { setName(""); setType("text"); onClose() }}
              className="flex-1 text-vortex-text-secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="flex-1 bg-vortex-accent"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Channel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
