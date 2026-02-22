"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Copy, Check, Webhook } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

interface Channel {
  id: string
  name: string
}

interface WebhookEntry {
  id: string
  name: string
  channel_id: string
  url: string
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  serverId: string
  channels: Channel[]
}

export function WebhooksModal({ open, onClose, serverId, channels }: Props) {
  const { toast } = useToast()
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("Webhook")
  const [newChannelId, setNewChannelId] = useState(channels[0]?.id ?? "")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/servers/${serverId}/webhooks`)
      .then((r) => r.json())
      .then((d) => { setWebhooks(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, serverId])

  async function handleCreate() {
    if (!newChannelId) return
    setCreating(true)
    const res = await fetch(`/api/servers/${serverId}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: newChannelId, name: newName.trim() || "Webhook" }),
    })
    if (res.ok) {
      const wh = await res.json()
      setWebhooks((prev) => [...prev, wh])
      setNewName("Webhook")
      toast({ title: "Webhook created" })
    } else {
      toast({ variant: "destructive", title: "Failed to create webhook" })
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/servers/${serverId}/webhooks?webhookId=${id}`, { method: "DELETE" })
    if (res.ok) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      toast({ title: "Webhook deleted" })
    }
  }

  function copyUrl(id: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function channelName(channelId: string) {
    return channels.find((c) => c.id === channelId)?.name ?? "Unknown"
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" style={{ background: "#313338", borderColor: "#1e1f22" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Webhook className="w-5 h-5" style={{ color: "#5865f2" }} />
            Webhooks
          </DialogTitle>
          <p className="text-sm" style={{ color: "#949ba4" }}>
            Create URLs that allow external services to post messages to your server.
          </p>
        </DialogHeader>

        {/* Create form */}
        <div className="rounded-lg p-4 space-y-3" style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#b5bac1" }}>New Webhook</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Webhook name"
              className="flex-1 px-3 py-2 rounded text-sm focus:outline-none"
              style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
            />
            <select
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              className="px-2 py-2 rounded text-sm focus:outline-none"
              style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={creating || !newChannelId}
              className="px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: "#5865f2", color: "white" }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin" style={{ color: "#949ba4" }} />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "#949ba4" }}>
            No webhooks yet. Create one above.
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((wh) => (
              <div key={wh.id} className="rounded-lg p-3" style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium text-white">{wh.name}</p>
                    <p className="text-xs" style={{ color: "#949ba4" }}>#{channelName(wh.channel_id)}</p>
                  </div>
                  <button onClick={() => handleDelete(wh.id)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors" style={{ color: "#4e5058" }} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs px-2 py-1 rounded truncate" style={{ background: "#1e1f22", color: "#949ba4", fontFamily: "monospace" }}>
                    {wh.url}
                  </code>
                  <button
                    onClick={() => copyUrl(wh.id, wh.url)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-white/10"
                    style={{ color: copiedId === wh.id ? "#23a55a" : "#949ba4" }}
                    title="Copy URL"
                  >
                    {copiedId === wh.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
