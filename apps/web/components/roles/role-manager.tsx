"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { RoleRow } from "@/types/database"
import { PERMISSIONS, type Permission } from "@vortex/shared"
import { cn } from "@/lib/utils/cn"

const PERMISSION_LIST: { key: Permission; label: string; description: string }[] = [
  { key: "ADMINISTRATOR", label: "Administrator", description: "All permissions \u2014 use with care" },
  { key: "MANAGE_CHANNELS", label: "Manage Channels", description: "Create, edit, delete channels" },
  { key: "MANAGE_ROLES", label: "Manage Roles", description: "Create and assign roles below this one" },
  { key: "KICK_MEMBERS", label: "Kick Members", description: "Remove members from the server" },
  { key: "BAN_MEMBERS", label: "Ban Members", description: "Permanently ban members" },
  { key: "MANAGE_MESSAGES", label: "Manage Messages", description: "Delete others' messages" },
  { key: "VIEW_CHANNELS", label: "View Channels", description: "See channels and receive messages" },
  { key: "SEND_MESSAGES", label: "Send Messages", description: "Post in text channels" },
  { key: "CONNECT_VOICE", label: "Connect to Voice", description: "Join voice channels" },
  { key: "SPEAK", label: "Speak", description: "Transmit audio in voice channels" },
  { key: "MUTE_MEMBERS", label: "Mute Members", description: "Mute others in voice channels" },
  { key: "STREAM", label: "Stream / Share Screen", description: "Share video or screen" },
]

interface Props {
  serverId: string
  isOwner: boolean
}

export function RoleManager({ serverId, isOwner }: Props) {
  const { toast } = useToast()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState("#99aab5")
  const [editPermissions, setEditPermissions] = useState(0)
  const [editHoisted, setEditHoisted] = useState(false)
  const [editMentionable, setEditMentionable] = useState(false)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    fetchRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  async function fetchRoles() {
    setLoading(true)
    const { data } = await supabase
      .from("roles")
      .select("*")
      .eq("server_id", serverId)
      .order("position", { ascending: false })
    setRoles(data ?? [])
    setLoading(false)
  }

  function selectRole(role: RoleRow) {
    setSelectedRole(role)
    setEditName(role.name)
    setEditColor(role.color)
    setEditPermissions(role.permissions)
    setEditHoisted(role.is_hoisted)
    setEditMentionable(role.mentionable)
  }

  function togglePermission(permission: Permission) {
    const bit = PERMISSIONS[permission]
    setEditPermissions((prev) => (prev & bit ? prev & ~bit : prev | bit))
  }

  async function handleCreateRole() {
    try {
      const { data, error } = await supabase
        .from("roles")
        .insert({
          server_id: serverId,
          name: "New Role",
          color: "#99aab5",
          permissions: 3,
          position: roles.length,
        })
        .select()
        .single()

      if (error) throw error
      const newRoles = [data, ...roles]
      setRoles(newRoles)
      selectRole(data)
      toast({ title: "Role created!" })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to create role", description: message })
    }
  }

  async function handleSaveRole() {
    if (!selectedRole) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from("roles")
        .update({
          name: editName,
          color: editColor,
          permissions: editPermissions,
          is_hoisted: editHoisted,
          mentionable: editMentionable,
        })
        .eq("id", selectedRole.id)

      if (error) throw error

      setRoles(roles.map((r) => r.id === selectedRole.id
        ? { ...r, name: editName, color: editColor, permissions: editPermissions, is_hoisted: editHoisted, mentionable: editMentionable }
        : r
      ))
      toast({ title: "Role saved!" })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to save role", description: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRole(roleId: string) {
    try {
      const { error } = await supabase.from("roles").delete().eq("id", roleId)
      if (error) throw error
      setRoles(roles.filter((r) => r.id !== roleId))
      if (selectedRole?.id === roleId) setSelectedRole(null)
      toast({ title: "Role deleted" })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({ variant: "destructive", title: "Failed to delete role", description: message })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-vortex-interactive" /></div>
  }

  return (
    <div className="flex gap-4 h-96">
      {/* Role list */}
      <div className="w-48 flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-vortex-interactive">Roles</span>
          {isOwner && (
            <button onClick={handleCreateRole} className="text-vortex-success">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-0.5 overflow-y-auto max-h-80">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => selectRole(role)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors text-vortex-text-primary",
                selectedRole?.id === role.id ? "bg-white/10" : "bg-transparent hover:bg-white/5"
              )}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
              <span className="truncate">{role.name}</span>
              {role.is_default && (
                <span className="ml-auto text-xs text-vortex-interactive">default</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Role editor */}
      {selectedRole ? (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                Role Name
              </Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={selectedRole.is_default}
                className="bg-vortex-bg-tertiary border-vortex-bg-tertiary text-vortex-text-primary"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-vortex-text-secondary">
                Color
              </Label>
              <input
                type="color"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className="w-10 h-9 rounded cursor-pointer border-0 p-0.5 bg-vortex-bg-tertiary"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={editHoisted} onCheckedChange={setEditHoisted} disabled={selectedRole.is_default} />
              <Label className="text-sm text-white">Hoist (show separately)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editMentionable} onCheckedChange={setEditMentionable} disabled={selectedRole.is_default} />
              <Label className="text-sm text-white">Mentionable</Label>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block text-vortex-text-secondary">
              Permissions
            </Label>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {PERMISSION_LIST.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium text-white">{label}</div>
                    <div className="text-xs text-vortex-interactive">{description}</div>
                  </div>
                  <Switch
                    checked={!!(editPermissions & PERMISSIONS[key])}
                    onCheckedChange={() => togglePermission(key)}
                    disabled={selectedRole.is_default && key === "VIEW_CHANNELS"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {!selectedRole.is_default && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteRole(selectedRole.id)}
                className="text-vortex-danger"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSaveRole}
              disabled={saving}
              className="ml-auto bg-vortex-accent"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-vortex-interactive">
          Select a role to edit
        </div>
      )}
    </div>
  )
}
