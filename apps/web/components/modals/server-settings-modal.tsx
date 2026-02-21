"use client"

import { useState, useEffect } from "react"
import { Loader2, Copy, RefreshCw, Trash2 } from "lucide-react"
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

interface Props {
  open: boolean
  onClose: () => void
  server: ServerRow
  isOwner: boolean
}

export function ServerSettingsModal({ open, onClose, server, isOwner }: Props) {
  const { toast } = useToast()
  const { updateServer, servers } = useAppStore()
  const liveServer = servers.find((s) => s.id === server.id) ?? server
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(liveServer.name)
  const [description, setDescription] = useState(liveServer.description ?? "")
  const supabase = createClientSupabaseClient()

  // Sync form state when liveServer changes (e.g., realtime update from another tab)
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
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
