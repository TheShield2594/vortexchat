"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Copy, RefreshCw, Trash2, Webhook, Smile, Plus, Check, Shield, ShieldCheck, Zap } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/stores/app-store"
import type { ServerRow, AutoModRuleRow, AutoModAction, ScreeningConfigRow } from "@/types/database"
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
                  <div className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#949ba4' }}>
                    Moderation
                  </div>
                  <TabsTrigger value="moderation" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    Settings
                  </TabsTrigger>
                  <TabsTrigger value="screening" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    Screening
                  </TabsTrigger>
                  <TabsTrigger value="automod" className="w-full justify-start text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white rounded" style={{ color: '#b5bac1' }}>
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    AutoMod
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

            <TabsContent value="moderation" className="mt-0">
              <ModerationTab serverId={server.id} open={open} />
            </TabsContent>

            <TabsContent value="screening" className="mt-0">
              <ScreeningTab serverId={server.id} open={open} />
            </TabsContent>

            <TabsContent value="automod" className="mt-0">
              <AutoModTab serverId={server.id} channels={channels} open={open} />
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

// ── Moderation Settings Tab ───────────────────────────────────────────────────

const VERIFICATION_LEVELS = [
  { value: 0, label: "None", description: "Unrestricted" },
  { value: 1, label: "Low", description: "Must have verified email" },
  { value: 2, label: "Medium", description: "Must be registered for > 5 min" },
  { value: 3, label: "High", description: "Must be a member for > 10 min" },
  { value: 4, label: "Very High", description: "Must have verified phone" },
]

const CONTENT_FILTERS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "Scan messages from members without roles" },
  { value: 2, label: "Scan all messages" },
]

interface ModerationSettings {
  verification_level: number
  explicit_content_filter: number
  default_message_notifications: number
  screening_enabled: boolean
}

function ModerationTab({ serverId, open }: { serverId: string; open: boolean }) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<ModerationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/servers/${serverId}/moderation`)
      .then((r) => r.json())
      .then((d) => { setSettings(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, serverId])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    const res = await fetch(`/api/servers/${serverId}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    if (res.ok) {
      toast({ title: "Moderation settings saved" })
    } else {
      const d = await res.json()
      toast({ variant: "destructive", title: "Failed to save", description: d.error })
    }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: '#949ba4' }} /></div>
  if (!settings) return null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-white font-semibold flex items-center gap-2 mb-0.5">
          <Shield className="w-4 h-4" style={{ color: '#5865f2' }} />
          Moderation Settings
        </p>
        <p className="text-xs" style={{ color: '#949ba4' }}>
          Configure server-level safety and content filters.
        </p>
      </div>

      {/* Verification Level */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
          Verification Level
        </Label>
        <select
          value={settings.verification_level}
          onChange={(e) => setSettings({ ...settings, verification_level: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded text-sm focus:outline-none"
          style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
        >
          {VERIFICATION_LEVELS.map((v) => (
            <option key={v.value} value={v.value}>{v.label} — {v.description}</option>
          ))}
        </select>
      </div>

      {/* Explicit Content Filter */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
          Explicit Content Filter
        </Label>
        <select
          value={settings.explicit_content_filter}
          onChange={(e) => setSettings({ ...settings, explicit_content_filter: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded text-sm focus:outline-none"
          style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
        >
          {CONTENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Default Notifications */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
          Default Message Notifications
        </Label>
        <select
          value={settings.default_message_notifications}
          onChange={(e) => setSettings({ ...settings, default_message_notifications: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded text-sm focus:outline-none"
          style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
        >
          <option value={0}>All Messages</option>
          <option value={1}>Only @mentions</option>
        </select>
      </div>

      {/* Screening Toggle */}
      <div className="flex items-center justify-between rounded-lg p-3" style={{ background: '#2b2d31' }}>
        <div>
          <p className="text-sm font-medium text-white">Membership Screening</p>
          <p className="text-xs" style={{ color: '#949ba4' }}>Require new members to accept rules before participating</p>
        </div>
        <button
          onClick={() => setSettings({ ...settings, screening_enabled: !settings.screening_enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.screening_enabled ? 'bg-indigo-600' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.screening_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <Button onClick={handleSave} disabled={saving} style={{ background: '#5865f2' }}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Changes
      </Button>
    </div>
  )
}

// ── Screening Tab ────────────────────────────────────────────────────────────

function ScreeningTab({ serverId, open }: { serverId: string; open: boolean }) {
  const { toast } = useToast()
  const [config, setConfig] = useState<ScreeningConfigRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("Server Rules")
  const [description, setDescription] = useState("")
  const [rulesText, setRulesText] = useState("")
  const [requireAcceptance, setRequireAcceptance] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/servers/${serverId}/screening`)
      .then((r) => r.json())
      .then((d) => {
        const cfg = d.config as ScreeningConfigRow | null
        setConfig(cfg)
        if (cfg) {
          setTitle(cfg.title)
          setDescription(cfg.description ?? "")
          setRulesText(cfg.rules_text)
          setRequireAcceptance(cfg.require_acceptance)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, serverId])

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/servers/${serverId}/screening`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: description || null, rules_text: rulesText, require_acceptance: requireAcceptance }),
    })
    if (res.ok) {
      const updated = await res.json()
      setConfig(updated)
      toast({ title: "Screening rules saved" })
    } else {
      const d = await res.json()
      toast({ variant: "destructive", title: "Failed to save", description: d.error })
    }
    setSaving(false)
  }

  async function handleDelete() {
    await fetch(`/api/servers/${serverId}/screening`, { method: "DELETE" })
    setConfig(null)
    setTitle("Server Rules")
    setDescription("")
    setRulesText("")
    toast({ title: "Screening config removed" })
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: '#949ba4' }} /></div>

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-semibold flex items-center gap-2 mb-0.5">
          <ShieldCheck className="w-4 h-4" style={{ color: '#5865f2' }} />
          Membership Screening
        </p>
        <p className="text-xs" style={{ color: '#949ba4' }}>
          New members must read and accept these rules before they can send messages.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ background: '#1e1f22', borderColor: '#3f4147', color: '#f2f3f5' }}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>Description (optional)</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short intro shown above the rules"
          style={{ background: '#1e1f22', borderColor: '#3f4147', color: '#f2f3f5' }}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>Rules Text</Label>
        <textarea
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          rows={8}
          className="w-full rounded px-3 py-2 text-sm resize-none focus:outline-none"
          placeholder="1. Be respectful&#10;2. No spam&#10;..."
          style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setRequireAcceptance(!requireAcceptance)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${requireAcceptance ? 'bg-indigo-600' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requireAcceptance ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm text-white">Require acceptance to participate</span>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} style={{ background: '#5865f2' }}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Rules
        </Button>
        {config && (
          <Button variant="ghost" onClick={handleDelete} style={{ color: '#ed4245' }}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

// ── AutoMod Tab ──────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  keyword_filter: "Keyword Filter",
  mention_spam: "Mention Spam",
  link_spam: "Link Spam",
}

interface AutoModRuleForm {
  name: string
  trigger_type: string
  // keyword_filter
  keywords: string
  regex_patterns: string
  // mention_spam
  mention_threshold: number
  // link_spam
  link_threshold: number
  // actions
  block_message: boolean
  timeout_member: boolean
  timeout_duration: number
  alert_channel: boolean
  alert_channel_id: string
  enabled: boolean
}

const DEFAULT_FORM: AutoModRuleForm = {
  name: "",
  trigger_type: "keyword_filter",
  keywords: "",
  regex_patterns: "",
  mention_threshold: 5,
  link_threshold: 3,
  block_message: true,
  timeout_member: false,
  timeout_duration: 60,
  alert_channel: false,
  alert_channel_id: "",
  enabled: true,
}

function formToPayload(f: AutoModRuleForm) {
  let config: Record<string, unknown> = {}
  if (f.trigger_type === "keyword_filter") {
    config = {
      keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      regex_patterns: f.regex_patterns.split(",").map((p) => p.trim()).filter(Boolean),
    }
  } else if (f.trigger_type === "mention_spam") {
    config = { mention_threshold: f.mention_threshold }
  } else if (f.trigger_type === "link_spam") {
    config = { link_threshold: f.link_threshold }
  }

  const actions: AutoModAction[] = []
  if (f.block_message) actions.push({ type: "block_message" })
  if (f.timeout_member) actions.push({ type: "timeout_member", duration_seconds: f.timeout_duration })
  if (f.alert_channel && f.alert_channel_id) actions.push({ type: "alert_channel", channel_id: f.alert_channel_id })

  return { name: f.name, trigger_type: f.trigger_type, config, actions, enabled: f.enabled }
}

function ruleToForm(rule: AutoModRuleRow): AutoModRuleForm {
  const cfg = rule.config as any
  const actions = rule.actions as unknown as AutoModAction[]
  return {
    name: rule.name,
    trigger_type: rule.trigger_type,
    keywords: (cfg.keywords ?? []).join(", "),
    regex_patterns: (cfg.regex_patterns ?? []).join(", "),
    mention_threshold: cfg.mention_threshold ?? 5,
    link_threshold: cfg.link_threshold ?? 3,
    block_message: actions.some((a) => a.type === "block_message"),
    timeout_member: actions.some((a) => a.type === "timeout_member"),
    timeout_duration: actions.find((a) => a.type === "timeout_member")?.duration_seconds ?? 60,
    alert_channel: actions.some((a) => a.type === "alert_channel"),
    alert_channel_id: actions.find((a) => a.type === "alert_channel")?.channel_id ?? "",
    enabled: rule.enabled,
  }
}

function AutoModTab({ serverId, channels, open }: { serverId: string; channels: Channel[]; open: boolean }) {
  const { toast } = useToast()
  const [rules, setRules] = useState<AutoModRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [form, setForm] = useState<AutoModRuleForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/servers/${serverId}/automod`)
      .then((r) => r.json())
      .then((d) => { setRules(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, serverId])

  function startNew() {
    setForm({ ...DEFAULT_FORM, alert_channel_id: channels[0]?.id ?? "" })
    setEditingId("new")
  }

  function startEdit(rule: AutoModRuleRow) {
    setForm(ruleToForm(rule))
    setEditingId(rule.id)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const payload = formToPayload(form)
    let res: Response
    if (editingId === "new") {
      res = await fetch(`/api/servers/${serverId}/automod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch(`/api/servers/${serverId}/automod/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    }
    if (res.ok) {
      const saved = await res.json()
      if (editingId === "new") {
        setRules((prev) => [...prev, saved])
      } else {
        setRules((prev) => prev.map((r) => (r.id === editingId ? saved : r)))
      }
      setEditingId(null)
      toast({ title: editingId === "new" ? "Rule created" : "Rule updated" })
    } else {
      const d = await res.json()
      toast({ variant: "destructive", title: "Failed to save", description: d.error })
    }
    setSaving(false)
  }

  async function handleDelete(ruleId: string) {
    const res = await fetch(`/api/servers/${serverId}/automod/${ruleId}`, { method: "DELETE" })
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      if (editingId === ruleId) setEditingId(null)
      toast({ title: "Rule deleted" })
    }
  }

  async function toggleEnabled(rule: AutoModRuleRow) {
    const res = await fetch(`/api/servers/${serverId}/automod/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
    }
  }

  function f(key: keyof AutoModRuleForm, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: '#949ba4' }} /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white font-semibold flex items-center gap-2 mb-0.5">
            <Zap className="w-4 h-4" style={{ color: '#5865f2' }} />
            AutoMod Rules
          </p>
          <p className="text-xs" style={{ color: '#949ba4' }}>
            Rules that automatically moderate messages in this server.
          </p>
        </div>
        <Button size="sm" onClick={startNew} style={{ background: '#5865f2' }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New Rule
        </Button>
      </div>

      {/* Existing rules list */}
      {rules.length === 0 && editingId !== "new" && (
        <div className="text-center py-8 text-sm" style={{ color: '#949ba4' }}>
          No AutoMod rules yet. Create one to get started.
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-lg p-3 flex items-center gap-3" style={{ background: '#2b2d31', border: '1px solid #1e1f22' }}>
            <button
              onClick={() => toggleEnabled(rule)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${rule.enabled ? 'bg-indigo-600' : 'bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{rule.name}</p>
              <p className="text-xs" style={{ color: '#949ba4' }}>{TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => startEdit(rule)}
                className="text-xs px-2 py-1 rounded transition-colors hover:bg-white/10"
                style={{ color: '#b5bac1' }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                className="text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
                style={{ color: '#ed4245' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Rule editor form */}
      {editingId !== null && (
        <div className="rounded-lg p-4 space-y-3" style={{ background: '#2b2d31', border: '1px solid #3f4147' }}>
          <p className="text-sm font-semibold text-white">{editingId === "new" ? "New Rule" : "Edit Rule"}</p>

          <div className="space-y-1">
            <label className="text-xs" style={{ color: '#b5bac1' }}>Rule name</label>
            <input
              value={form.name}
              onChange={(e) => f("name", e.target.value)}
              placeholder="My Rule"
              className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
              style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs" style={{ color: '#b5bac1' }}>Trigger type</label>
            <select
              value={form.trigger_type}
              onChange={(e) => f("trigger_type", e.target.value)}
              className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
              style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
            >
              <option value="keyword_filter">Keyword Filter</option>
              <option value="mention_spam">Mention Spam</option>
              <option value="link_spam">Link Spam</option>
            </select>
          </div>

          {form.trigger_type === "keyword_filter" && (
            <>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: '#b5bac1' }}>Blocked keywords (comma-separated)</label>
                <input
                  value={form.keywords}
                  onChange={(e) => f("keywords", e.target.value)}
                  placeholder="spam, badword, ..."
                  className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
                  style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: '#b5bac1' }}>Regex patterns (comma-separated, optional)</label>
                <input
                  value={form.regex_patterns}
                  onChange={(e) => f("regex_patterns", e.target.value)}
                  placeholder="\\bspam\\b, ..."
                  className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
                  style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
                />
              </div>
            </>
          )}

          {form.trigger_type === "mention_spam" && (
            <div className="space-y-1">
              <label className="text-xs" style={{ color: '#b5bac1' }}>Max mentions per message</label>
              <input
                type="number"
                min={1}
                value={form.mention_threshold}
                onChange={(e) => f("mention_threshold", Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
                style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
              />
            </div>
          )}

          {form.trigger_type === "link_spam" && (
            <div className="space-y-1">
              <label className="text-xs" style={{ color: '#b5bac1' }}>Max links per message</label>
              <input
                type="number"
                min={1}
                value={form.link_threshold}
                onChange={(e) => f("link_threshold", Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded text-sm focus:outline-none"
                style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
              />
            </div>
          )}

          {/* Actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#b5bac1' }}>Actions</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.block_message} onChange={(e) => f("block_message", e.target.checked)} className="rounded" />
                <span className="text-sm text-white">Block message</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.timeout_member} onChange={(e) => f("timeout_member", e.target.checked)} className="rounded" />
                <span className="text-sm text-white">Timeout member</span>
              </label>
              {form.timeout_member && (
                <div className="ml-6 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={form.timeout_duration}
                    onChange={(e) => f("timeout_duration", Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded text-sm focus:outline-none"
                    style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
                  />
                  <span className="text-xs" style={{ color: '#949ba4' }}>seconds</span>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.alert_channel} onChange={(e) => f("alert_channel", e.target.checked)} className="rounded" />
                <span className="text-sm text-white">Alert mod channel</span>
              </label>
              {form.alert_channel && (
                <div className="ml-6">
                  <select
                    value={form.alert_channel_id}
                    onChange={(e) => f("alert_channel_id", e.target.value)}
                    className="w-full px-2 py-1 rounded text-sm focus:outline-none"
                    style={{ background: '#1e1f22', color: '#f2f3f5', border: '1px solid #3f4147' }}
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving} style={{ background: '#5865f2' }}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {editingId === "new" ? "Create" : "Update"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} style={{ color: '#b5bac1' }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
