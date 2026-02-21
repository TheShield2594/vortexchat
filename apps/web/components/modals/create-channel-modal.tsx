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

      const { data: existing, error: checkError } = await supabase
        .from("channels")
        .select("id")
        .eq("server_id", serverId)
        .eq("name", channelName)
        .eq("type", type)
        .maybeSingle()

      if (checkError) throw checkError
      if (existing) {
        throw new Error(`A ${type} channel named "${channelName}" already exists.`)
      }

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
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to create channel", description: error.message })
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
      <DialogContent style={{ background: '#313338', borderColor: '#1e1f22', maxWidth: '460px' }}>
        <DialogHeader>
          <DialogTitle className="text-white">Create Channel</DialogTitle>
          {categoryId && (
            <p className="text-sm" style={{ color: '#b5bac1' }}>in a category</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: '#b5bac1' }}>
              Channel Type
            </Label>
            <div className="space-y-2">
              {channelTypes.map(({ type: t, label, description, icon }) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="w-full flex items-center gap-3 p-3 rounded cursor-pointer transition-colors text-left"
                  style={{
                    background: type === t ? '#5865f2' : '#2b2d31',
                    border: `1px solid ${type === t ? '#5865f2' : 'transparent'}`,
                  }}
                >
                  <span style={{ color: type === t ? 'white' : '#949ba4' }}>{icon}</span>
                  <div>
                    <div className="font-medium text-white text-sm">{label}</div>
                    <div className="text-xs" style={{ color: type === t ? 'rgba(255,255,255,0.7)' : '#949ba4' }}>
                      {description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
              Channel Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              {type === "text" && (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#949ba4' }} />
              )}
              {type === "voice" && (
                <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#949ba4' }} />
              )}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "category" ? "New Category" : type === "voice" ? "General" : "new-channel"}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className={type !== "category" ? "pl-8" : ""}
                style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => { setName(""); setType("text"); onClose() }}
              className="flex-1"
              style={{ color: '#b5bac1' }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="flex-1"
              style={{ background: '#5865f2' }}
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
