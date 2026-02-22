"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { PERMISSIONS, type Permission } from "@vortex/shared"

interface Role {
  id: string
  name: string
  color: string
}

interface ChannelPerm {
  role_id: string
  allow_permissions: number
  deny_permissions: number
  role: Role
}

const PERM_LIST: { key: Permission; label: string }[] = [
  { key: "VIEW_CHANNELS", label: "View Channel" },
  { key: "SEND_MESSAGES", label: "Send Messages" },
  { key: "MANAGE_MESSAGES", label: "Manage Messages" },
  { key: "CONNECT_VOICE", label: "Connect to Voice" },
  { key: "SPEAK", label: "Speak" },
  { key: "STREAM", label: "Stream" },
]

export function ChannelPermissionsEditor({ channelId, serverId }: { channelId: string; serverId: string }) {
  const [perms, setPerms] = useState<ChannelPerm[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selected, setSelected] = useState<ChannelPerm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    async function load() {
      const [permsRes, rolesRes] = await Promise.all([
        fetch(`/api/channels/${channelId}/permissions`),
        supabase.from("roles").select("id, name, color").eq("server_id", serverId),
      ])
      if (permsRes.ok) setPerms(await permsRes.json())
      if (rolesRes.data) setRoles(rolesRes.data)
      setLoading(false)
    }
    load()
  }, [channelId, serverId])

  function addRole(role: Role) {
    const override: ChannelPerm = { role_id: role.id, allow_permissions: 0, deny_permissions: 0, role }
    setPerms((prev) => [...prev, override])
    setSelected(override)
  }

  function toggleAllow(key: Permission) {
    if (!selected) return
    const bit = PERMISSIONS[key]
    const newAllow = selected.allow_permissions & bit ? selected.allow_permissions & ~bit : selected.allow_permissions | bit
    const newDeny = selected.deny_permissions & ~bit // can't allow and deny at same time
    const updated = { ...selected, allow_permissions: newAllow, deny_permissions: newDeny }
    setSelected(updated)
    setPerms((prev) => prev.map((p) => p.role_id === selected.role_id ? updated : p))
  }

  function toggleDeny(key: Permission) {
    if (!selected) return
    const bit = PERMISSIONS[key]
    const newDeny = selected.deny_permissions & bit ? selected.deny_permissions & ~bit : selected.deny_permissions | bit
    const newAllow = selected.allow_permissions & ~bit
    const updated = { ...selected, deny_permissions: newDeny, allow_permissions: newAllow }
    setSelected(updated)
    setPerms((prev) => prev.map((p) => p.role_id === selected.role_id ? updated : p))
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    await fetch(`/api/channels/${channelId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: selected.role_id, allowPermissions: selected.allow_permissions, denyPermissions: selected.deny_permissions }),
    })
    setSaving(false)
  }

  async function remove(roleId: string) {
    await fetch(`/api/channels/${channelId}/permissions?roleId=${roleId}`, { method: "DELETE" })
    setPerms((prev) => prev.filter((p) => p.role_id !== roleId))
    if (selected?.role_id === roleId) setSelected(null)
  }

  const unusedRoles = roles.filter((r) => !perms.find((p) => p.role_id === r.id))

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="animate-spin" style={{ color: "#949ba4" }} /></div>

  return (
    <div className="flex gap-3 h-72">
      {/* Role list */}
      <div className="w-40 flex-shrink-0 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#949ba4" }}>Roles</p>
        {perms.map((p) => (
          <button
            key={p.role_id}
            onClick={() => setSelected(p)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left"
            style={{ background: selected?.role_id === p.role_id ? "rgba(255,255,255,0.1)" : "transparent", color: "#f2f3f5" }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.role.color }} />
            <span className="truncate flex-1">{p.role.name}</span>
            <button onClick={(e) => { e.stopPropagation(); remove(p.role_id) }} style={{ color: "#f23f43" }}>
              <Trash2 className="w-3 h-3" />
            </button>
          </button>
        ))}
        {unusedRoles.length > 0 && (
          <div className="pt-2 border-t" style={{ borderColor: "#3f4147" }}>
            <p className="text-xs mb-1" style={{ color: "#4e5058" }}>Add override</p>
            {unusedRoles.map((r) => (
              <button
                key={r.id}
                onClick={() => addRole(r)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-white/5"
                style={{ color: "#b5bac1" }}
              >
                <Plus className="w-3 h-3" />
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Permission editor */}
      {selected ? (
        <div className="flex-1 overflow-y-auto space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#949ba4" }}>
            Permissions for <span style={{ color: selected.role.color }}>{selected.role.name}</span>
          </p>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 items-center">
            <span className="text-xs font-medium" style={{ color: "#b5bac1" }}>Permission</span>
            <span className="text-xs text-center" style={{ color: "#23a55a" }}>Allow</span>
            <span className="text-xs text-center" style={{ color: "#f23f43" }}>Deny</span>
            {PERM_LIST.map(({ key, label }) => (
              <>
                <span key={`${key}-label`} className="text-sm text-white">{label}</span>
                <Switch
                  key={`${key}-allow`}
                  checked={!!(selected.allow_permissions & PERMISSIONS[key])}
                  onCheckedChange={() => toggleAllow(key)}
                />
                <Switch
                  key={`${key}-deny`}
                  checked={!!(selected.deny_permissions & PERMISSIONS[key])}
                  onCheckedChange={() => toggleDeny(key)}
                />
              </>
            ))}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="mt-3 px-3 py-1.5 rounded text-sm font-semibold"
            style={{ background: "#5865f2", color: "white" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "#4e5058" }}>
          Select a role to edit permissions
        </div>
      )}
    </div>
  )
}
