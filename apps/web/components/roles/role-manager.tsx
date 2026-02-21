"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2, X } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { RoleRow, UserRow } from "@/types/database"
import { PERMISSIONS, type Permission } from "@vortex/shared"

const PERMISSION_LIST: { key: Permission; label: string; description: string }[] = [
  { key: "ADMINISTRATOR", label: "Administrator", description: "All permissions — use with care" },
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
  const [roleMembers, setRoleMembers] = useState<UserRow[]>([])
  const [allMembers, setAllMembers] = useState<(UserRow & { user_id: string })[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    fetchRoles()
    fetchAllMembers()
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

  async function fetchAllMembers() {
    const { data } = await supabase
      .from("server_members")
      .select("user_id, users(*)")
      .eq("server_id", serverId)
    type MemberWithUser = { user_id: string; users: UserRow | null }
    setAllMembers(
      ((data ?? []) as unknown as MemberWithUser[])
        .filter((m) => m.users !== null)
        .map((m) => ({ ...m.users!, user_id: m.user_id }))
    )
  }

  async function fetchRoleMembers(roleId: string) {
    const { data } = await supabase
      .from("member_roles")
      .select("user_id, users(*)")
      .eq("server_id", serverId)
      .eq("role_id", roleId)
    type RoleMemberWithUser = { user_id: string; users: UserRow | null }
    setRoleMembers(
      ((data ?? []) as unknown as RoleMemberWithUser[])
        .map((m) => m.users)
        .filter((u): u is UserRow => u !== null)
    )
  }

  function selectRole(role: RoleRow) {
    setSelectedRole(role)
    setEditName(role.name)
    setEditColor(role.color)
    setEditPermissions(role.permissions)
    setEditHoisted(role.is_hoisted)
    setEditMentionable(role.mentionable)
    setShowAddMember(false)
    if (!role.is_default) {
      fetchRoleMembers(role.id)
    } else {
      setRoleMembers([])
    }
  }

  async function handleAddMemberToRole(userId: string) {
    if (!selectedRole) return
    try {
      const { error } = await supabase
        .from("member_roles")
        .insert({ server_id: serverId, user_id: userId, role_id: selectedRole.id })
      if (error) throw error
      await fetchRoleMembers(selectedRole.id)
      setShowAddMember(false)
      toast({ title: "Member added to role" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to add member", description: error.message })
    }
  }

  async function handleRemoveMemberFromRole(userId: string) {
    if (!selectedRole) return
    try {
      const { error } = await supabase
        .from("member_roles")
        .delete()
        .eq("server_id", serverId)
        .eq("user_id", userId)
        .eq("role_id", selectedRole.id)
      if (error) throw error
      setRoleMembers((prev) => prev.filter((m) => m.id !== userId))
      toast({ title: "Member removed from role" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to remove member", description: error.message })
    }
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
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to create role", description: error.message })
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
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save role", description: error.message })
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
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to delete role", description: error.message })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: '#949ba4' }} /></div>
  }

  return (
    <div className="flex gap-4 h-full min-h-[28rem]">
      {/* Role list */}
      <div className="w-40 flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#949ba4' }}>Roles</span>
          {isOwner && (
            <button onClick={handleCreateRole} style={{ color: '#23a55a' }}>
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-0.5 overflow-y-auto max-h-80">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => selectRole(role)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors"
              style={{
                background: selectedRole?.id === role.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: '#f2f3f5',
              }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
              <span className="truncate">{role.name}</span>
              {role.is_default && (
                <span className="ml-auto text-xs" style={{ color: '#949ba4' }}>default</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Role editor */}
      {selectedRole ? (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
              Role Name
            </Label>
            <div className="flex items-center gap-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={selectedRole.is_default}
                className="flex-1"
                style={{ background: '#1e1f22', borderColor: '#1e1f22', color: '#f2f3f5' }}
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer border-0 p-0.5"
                  style={{ background: '#1e1f22' }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Switch checked={editHoisted} onCheckedChange={setEditHoisted} disabled={selectedRole.is_default} />
              <Label className="text-sm text-white whitespace-nowrap">Hoist (show separately)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editMentionable} onCheckedChange={setEditMentionable} disabled={selectedRole.is_default} />
              <Label className="text-sm text-white">Mentionable</Label>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: '#b5bac1' }}>
              Permissions
            </Label>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 2rem)' }}>
              {PERMISSION_LIST.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium text-white">{label}</div>
                    <div className="text-xs" style={{ color: '#949ba4' }}>{description}</div>
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

          {/* Members with this role */}
          {!selectedRole.is_default && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b5bac1' }}>
                  Members — {roleMembers.length}
                </Label>
                {isOwner && (
                  <button
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="text-xs px-2 py-1 rounded transition-colors hover:bg-white/10"
                    style={{ color: '#23a55a' }}
                  >
                    <Plus className="w-3.5 h-3.5 inline mr-1" />
                    Add
                  </button>
                )}
              </div>

              {showAddMember && (() => {
                const availableMembers = allMembers.filter((m) => !roleMembers.some((rm) => rm.id === m.id))
                return (
                <div className="mb-2 p-2 rounded space-y-1 max-h-32 overflow-y-auto" style={{ background: '#1e1f22' }}>
                  {availableMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleAddMemberToRole(member.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-white/10 transition-colors"
                        style={{ color: '#f2f3f5' }}
                      >
                        <Avatar className="w-5 h-5">
                          {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                          <AvatarFallback style={{ background: '#5865f2', color: 'white', fontSize: '10px' }}>
                            {(member.display_name || member.username).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{member.display_name || member.username}</span>
                      </button>
                    ))}
                  {availableMembers.length === 0 && (
                    <p className="text-xs text-center py-1" style={{ color: '#949ba4' }}>All members have this role</p>
                  )}
                </div>
                )
              })()}

              <div className="space-y-1 max-h-28 overflow-y-auto">
                {roleMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm group"
                    style={{ background: '#2b2d31', color: '#f2f3f5' }}
                  >
                    <Avatar className="w-5 h-5">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback style={{ background: '#5865f2', color: 'white', fontSize: '10px' }}>
                        {(member.display_name || member.username).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{member.display_name || member.username}</span>
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveMemberFromRole(member.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: '#f23f43' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {roleMembers.length === 0 && (
                  <p className="text-xs py-1" style={{ color: '#949ba4' }}>No members have this role</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {!selectedRole.is_default && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteRole(selectedRole.id)}
                style={{ color: '#f23f43' }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSaveRole}
              disabled={saving}
              style={{ background: '#5865f2' }}
              className="ml-auto"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{ color: '#949ba4' }}>
          Select a role to edit
        </div>
      )}
    </div>
  )
}
