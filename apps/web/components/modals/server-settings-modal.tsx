"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Copy, RefreshCw, Trash2, Webhook, Smile, Plus, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { ServerRow } from "@/types/database"
import { RoleManager } from "@/components/roles/role-manager"

interface Channel {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  server: ServerRow
  isOwner: boolean
  channels?: Channel[]
}

export function ServerSettingsModal({ open, onClose, server, isOwner, channels = [] }: Props) {
  const { toast } = useToast()
  const { updateServer, servers } = useAppStore()
  const liveServer = servers.find((s) => s.id === server.id) ?? server
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(liveServer.name)
  const [description, setDescription] = useState(liveServer.description ?? "")
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    setName(liveServer.name)
    setDescription(liveServer.description ?? "")
  }, [liveServer.name, liveServer.description])

  async function handleSave() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from("servers")
        .update({ name: name.trim(), description: description.trim() || null })
        .eq("id", server.id)

      if (error) throw error
      updateServer(server.id, { name: name.trim(), description: description.trim() || null })
      toast({ title: "Server settings saved!" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerateInvite() {
    try {
      const newCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

      const { error } = await supabase
        .from("servers")
        .update({ invite_code: newCode })
        .eq("id", server.id)

      if (error) throw error
      updateServer(server.id, { invite_code: newCode })
      toast({ title: "Invite code regenerated!" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to regenerate", description: error.message })
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(liveServer.invite_code)
    toast({ title: "Invite code copied!" })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden p-0"
        style={{ background: '#313338', borderColor: '#1e1f22' }}
      >
        <Tabs defaultValue="overview" orientation="vertical" className="flex h-[80vh]">
          {/* Settings sidebar */}
          <div className="w-48 flex-shrink-0 p-4 flex flex-col" style={{ background: '#2b2d31' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#949ba4' }}>
              {liveServer.name}
            </h3>
            <TabsList className="flex flex-col h-auto bg-transparent gap-0.5 w-full">
              <TabsTrigger value="overview" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                Overview
              </TabsTrigger>
              <TabsTrigger value="roles" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                Roles
              </TabsTrigger>
              <TabsTrigger value="invites" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                Invites
              </TabsTrigger>
              {isOwner && (
                <>
                  <TabsTrigger value="emojis" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                    Emoji
                  </TabsTrigger>
                  <TabsTrigger value="webhooks" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                    Integrations
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
                  Server Name
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner}
                  style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
                  Description
                </Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isOwner}
                  rows={3}
                  className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none"
                  style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #1e1f22' }}
                  placeholder="What's this server about?"
                />
              </div>

              {isOwner && (
                <Button onClick={handleSave} disabled={loading} style={{ background: '#5865f2' }}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              )}
            </TabsContent>

            <TabsContent value="roles" className="mt-0">
              <RoleManager serverId={server.id} isOwner={isOwner} />
            </TabsContent>

            <TabsContent value="invites" className="mt-0 space-y-4">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: '#b5bac1' }}>
                  Invite Code
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={liveServer.invite_code}
                    readOnly
                    style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyInvite}
                    style={{ color: '#949ba4' }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {isOwner && (
                <Button
                  variant="outline"
                  onClick={handleRegenerateInvite}
                  style={{ borderColor: '#4e5058', color: '#b5bac1', background: 'transparent' }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Code
                </Button>
              )}
              <p className="text-xs" style={{ color: '#949ba4' }}>
                Share this code with friends to invite them to your server.
              </p>
            </TabsContent>

            <TabsContent value="emojis" className="mt-0">
              <EmojisTab serverId={server.id} />
            </TabsContent>

            <TabsContent value="webhooks" className="mt-0">
              <WebhooksTab serverId={server.id} channels={channels} open={open} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ── Emojis Tab ────────────────────────────────────────────────────────────────

interface EmojiEntry {
  id: string
  name: string
  image_url: string
}

function EmojisTab({ serverId }: { serverId: string }) {
  const { toast } = useToast()
  const [emojis, setEmojis] = useState<EmojiEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [newName, setNewName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/servers/${serverId}/emojis`)
      .then((r) => r.json())
      .then((d) => { setEmojis(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [serverId])

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !newName.trim()) return
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    form.append("name", newName.trim())
    const res = await fetch(`/api/servers/${serverId}/emojis`, { method: "POST", body: form })
    if (res.ok) {
      const emoji = await res.json()
      setEmojis((prev) => [...prev, emoji])
      setNewName("")
      if (fileRef.current) fileRef.current.value = ""
      toast({ title: "Emoji uploaded" })
    } else {
      toast({ variant: "destructive", title: "Failed to upload emoji" })
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/servers/${serverId}/emojis?emojiId=${id}`, { method: "DELETE" })
    if (res.ok) {
      setEmojis((prev) => prev.filter((e) => e.id !== id))
      toast({ title: "Emoji deleted" })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-semibold mb-0.5">Custom Emoji</p>
        <p className="text-xs" style={{ color: '#949ba4' }}>
          Upload custom emoji to use in messages on this server. Max 256 KB, PNG/GIF/WEBP.
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-lg p-4 space-y-3" style={{ background: '#2b2d31', border: '1px solid #1e1f22' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>Upload Emoji</p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())}
            placeholder="emoji_name"
            className="flex-1 min-w-0 px-3 py-2 rounded text-sm focus:outline-none"
            style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
          />
          <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded text-sm transition-colors"
            style={{ background: '#383a40', color: '#b5bac1' }}
          >
            Choose file
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !newName.trim()}
            className="px-3 py-2 rounded text-sm font-semibold disabled:opacity-50"
            style={{ background: '#5865f2', color: 'white' }}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Emoji list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin" style={{ color: '#949ba4' }} />
        </div>
      ) : emojis.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: '#949ba4' }}>
          No custom emoji yet.
        </div>
      ) : (
        <div className="space-y-1">
          {emojis.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: '#2b2d31' }}>
              <img src={e.image_url} alt={e.name} className="w-8 h-8 object-contain rounded" />
              <span className="flex-1 text-sm text-white">:{e.name}:</span>
              <button
                onClick={() => handleDelete(e.id)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors"
                style={{ color: '#4e5058' }}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Webhooks Tab ──────────────────────────────────────────────────────────────

interface WebhookEntry {
  id: string
  name: string
  channel_id: string
  url: string
  created_at: string
}

function WebhooksTab({ serverId, channels, open }: { serverId: string; channels: Channel[]; open: boolean }) {
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

  // Update default channel when channels list arrives
  useEffect(() => {
    if (!newChannelId && channels[0]) setNewChannelId(channels[0].id)
  }, [channels, newChannelId])

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
    <div className="space-y-4">
      <div>
        <p className="text-white font-semibold mb-0.5 flex items-center gap-2">
          <Webhook className="w-4 h-4" style={{ color: '#5865f2' }} />
          Webhooks
        </p>
        <p className="text-xs" style={{ color: '#949ba4' }}>
          Create URLs that allow external services to post messages to your server.
        </p>
      </div>

      {/* Create form */}
      <div className="rounded-lg p-4 space-y-3" style={{ background: '#2b2d31', border: '1px solid #1e1f22' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>New Webhook</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Webhook name"
            className="flex-1 px-3 py-2 rounded text-sm focus:outline-none"
            style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
          />
          <select
            value={newChannelId}
            onChange={(e) => setNewChannelId(e.target.value)}
            className="px-2 py-2 rounded text-sm focus:outline-none"
            style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={creating || !newChannelId}
            className="px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: '#5865f2', color: 'white' }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin" style={{ color: '#949ba4' }} />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: '#949ba4' }}>
          No webhooks yet. Create one above.
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-lg p-3" style={{ background: '#2b2d31', border: '1px solid #1e1f22' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-medium text-white">{wh.name}</p>
                  <p className="text-xs" style={{ color: '#949ba4' }}>#{channelName(wh.channel_id)}</p>
                </div>
                <button
                  onClick={() => handleDelete(wh.id)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors"
                  style={{ color: '#4e5058' }}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs px-2 py-1 rounded truncate" style={{ background: '#1e1f22', color: '#949ba4', fontFamily: 'monospace' }}>
                  {wh.url}
                </code>
                <button
                  onClick={() => copyUrl(wh.id, wh.url)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-white/10"
                  style={{ color: copiedId === wh.id ? '#23a55a' : '#949ba4' }}
                  title="Copy URL"
                >
                  {copiedId === wh.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
