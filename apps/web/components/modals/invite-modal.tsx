"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, Check, Trash2, Plus, Loader2, X, Link } from "lucide-react"
import { format } from "date-fns"

interface Invite {
  code: string
  server_id: string
  created_by: string | null
  max_uses: number | null
  uses: number
  expires_at: string | null
  temporary: boolean
  created_at: string
  creator?: { username: string; display_name: string | null } | null
}

interface Props {
  serverId: string
  serverName: string
  onClose: () => void
}

const EXPIRE_OPTIONS = [
  { label: "Never", value: null },
  { label: "30 minutes", value: 0.5 },
  { label: "1 hour", value: 1 },
  { label: "6 hours", value: 6 },
  { label: "12 hours", value: 12 },
  { label: "1 day", value: 24 },
  { label: "7 days", value: 168 },
]

const USE_OPTIONS = [
  { label: "No limit", value: null },
  { label: "1 use", value: 1 },
  { label: "5 uses", value: 5 },
  { label: "10 uses", value: 10 },
  { label: "25 uses", value: 25 },
  { label: "50 uses", value: 50 },
  { label: "100 uses", value: 100 },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-white/10"
      title={copied ? "Copied!" : "Copy link"}
      style={{ color: copied ? "#23a55a" : "#b5bac1" }}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

export function InviteModal({ serverId, serverName, onClose }: Props) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expiresIn, setExpiresIn] = useState<number | null>(null)
  const [maxUses, setMaxUses] = useState<number | null>(null)

  const fetchInvites = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/invites`)
    if (res.ok) {
      const data = await res.json()
      setInvites(data)
    }
    setLoading(false)
  }, [serverId])

  useEffect(() => {
    fetchInvites()
  }, [fetchInvites])

  async function handleCreate() {
    setCreating(true)
    const res = await fetch(`/api/servers/${serverId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn, maxUses }),
    })
    if (res.ok) fetchInvites()
    setCreating(false)
  }

  async function handleRevoke(code: string) {
    await fetch(`/api/servers/${serverId}/invites?code=${code}`, { method: "DELETE" })
    setInvites((prev) => prev.filter((i) => i.code !== code))
  }

  function inviteUrl(code: string) {
    return `${window.location.origin}/invite/${code}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "#2b2d31", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#1e1f22" }}>
          <div>
            <h2 className="text-lg font-bold text-white">Invite people to {serverName}</h2>
            <p className="text-xs mt-0.5" style={{ color: "#949ba4" }}>
              Share an invite link to let others join
            </p>
          </div>
          <button onClick={onClose} style={{ color: "#949ba4" }} className="hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create invite */}
        <div className="px-5 py-4 border-b" style={{ borderColor: "#1e1f22" }}>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: "#949ba4" }}>
                Expire after
              </label>
              <select
                value={expiresIn ?? ""}
                onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded px-2 py-1.5 text-sm focus:outline-none"
                style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
              >
                {EXPIRE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ""}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: "#949ba4" }}>
                Max uses
              </label>
              <select
                value={maxUses ?? ""}
                onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded px-2 py-1.5 text-sm focus:outline-none"
                style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}
              >
                {USE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ""}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ background: "#5865f2", color: "white" }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>

        {/* Invite list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#949ba4" }} />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8">
              <Link className="w-8 h-8 mx-auto mb-2" style={{ color: "#4e5058" }} />
              <p className="text-sm" style={{ color: "#949ba4" }}>No invite links yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => {
                const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date()
                const isExhausted = invite.max_uses !== null && invite.uses >= invite.max_uses
                const url = inviteUrl(invite.code)
                return (
                  <div
                    key={invite.code}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: "#1e1f22",
                      opacity: isExpired || isExhausted ? 0.5 : 1,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-white">{invite.code}</code>
                        {(isExpired || isExhausted) && (
                          <span className="text-xs px-1 rounded" style={{ background: "#f23f43", color: "white" }}>
                            {isExpired ? "Expired" : "Exhausted"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5 flex gap-2" style={{ color: "#949ba4" }}>
                        <span>{invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ""} uses</span>
                        {invite.expires_at && (
                          <span>· Expires {format(new Date(invite.expires_at), "MMM d, h:mm a")}</span>
                        )}
                        {invite.creator && (
                          <span>· by {invite.creator.display_name || invite.creator.username}</span>
                        )}
                      </div>
                    </div>
                    <CopyButton text={url} />
                    <button
                      onClick={() => handleRevoke(invite.code)}
                      className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-red-500/20"
                      style={{ color: "#f23f43" }}
                      title="Revoke"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
