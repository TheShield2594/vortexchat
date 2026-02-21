"use client"

import { useEffect, useState, useCallback } from "react"
import { UserPlus, Check, X, UserMinus, ShieldOff, Loader2 } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { FriendWithUser } from "@/types/database"

type Tab = "online" | "all" | "pending" | "blocked"

interface FriendsData {
  accepted: FriendWithUser[]
  pending_received: FriendWithUser[]
  pending_sent: FriendWithUser[]
  blocked: FriendWithUser[]
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    invisible: "#80848e",
    offline: "#80848e",
  }
  return (
    <span
      className="w-3 h-3 rounded-full border-2 flex-shrink-0"
      style={{
        background: colors[status] ?? "#80848e",
        borderColor: "#2b2d31",
      }}
    />
  )
}

function FriendEntry({
  entry,
  actions,
}: {
  entry: FriendWithUser
  actions: React.ReactNode
}) {
  const { friend } = entry
  const displayName = friend.display_name || friend.username
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-default hover:bg-white/5 transition-colors group"
    >
      <div className="relative flex-shrink-0">
        <Avatar className="w-9 h-9">
          {friend.avatar_url && <AvatarImage src={friend.avatar_url} />}
          <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: "13px" }}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
          style={{
            background: friend.status === "online" ? "#23a55a"
              : friend.status === "idle" ? "#f0b232"
              : friend.status === "dnd" ? "#f23f43"
              : "#80848e",
            borderColor: "#2b2d31",
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{displayName}</div>
        <div className="text-xs truncate capitalize" style={{ color: "#949ba4" }}>
          {friend.username !== displayName ? `@${friend.username} · ` : ""}
          {friend.status_message || friend.status || "Offline"}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {actions}
      </div>
    </div>
  )
}

function IconButton({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void
  title: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
      style={{
        background: danger ? "rgba(242,63,67,0.15)" : "rgba(255,255,255,0.08)",
        color: danger ? "#f23f43" : "#b5bac1",
      }}
    >
      {children}
    </button>
  )
}

export function FriendsSidebar() {
  const [friends, setFriends] = useState<FriendsData>({
    accepted: [],
    pending_received: [],
    pending_sent: [],
    blocked: [],
  })
  const [tab, setTab] = useState<Tab>("online")
  const [addUsername, setAddUsername] = useState("")
  const [addStatus, setAddStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchFriends = useCallback(async () => {
    const res = await fetch("/api/friends")
    if (res.ok) {
      const data = await res.json()
      setFriends(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addUsername.trim() || addLoading) return
    setAddLoading(true)
    setAddStatus(null)
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: addUsername.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      setAddStatus({ type: "success", msg: json.message })
      setAddUsername("")
      fetchFriends()
    } else {
      setAddStatus({ type: "error", msg: json.error })
    }
    setAddLoading(false)
  }

  async function handleAccept(id: string) {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: id, action: "accept" }),
    })
    fetchFriends()
  }

  async function handleDecline(id: string) {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: id, action: "decline" }),
    })
    fetchFriends()
  }

  async function handleBlock(id: string) {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: id, action: "block" }),
    })
    fetchFriends()
  }

  async function handleRemove(id: string) {
    await fetch(`/api/friends?id=${id}`, { method: "DELETE" })
    fetchFriends()
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "online", label: "Online" },
    { id: "all", label: "All" },
    {
      id: "pending",
      label: "Pending",
      count: friends.pending_received.length,
    },
    { id: "blocked", label: "Blocked" },
  ]

  const onlineFriends = friends.accepted.filter((f) =>
    f.friend.status === "online" || f.friend.status === "idle" || f.friend.status === "dnd"
  )

  const displayList =
    tab === "online"
      ? onlineFriends
      : tab === "all"
      ? friends.accepted
      : tab === "blocked"
      ? friends.blocked
      : []

  const pendingReceivedList = tab === "pending" ? friends.pending_received : []
  const pendingSentList = tab === "pending" ? friends.pending_sent : []

  return (
    <div className="flex flex-col h-full" style={{ background: "#313338" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "#1e1f22" }}
      >
        <UserPlus className="w-5 h-5 flex-shrink-0" style={{ color: "#b5bac1" }} />
        <span className="font-semibold text-white">Friends</span>
      </div>

      {/* Add friend input */}
      <form onSubmit={handleAdd} className="px-4 py-3 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={addUsername}
            onChange={(e) => { setAddUsername(e.target.value); setAddStatus(null) }}
            placeholder="Add friend by username…"
            className="flex-1 px-3 py-2 rounded text-sm focus:outline-none"
            style={{
              background: "#1e1f22",
              color: "#f2f3f5",
              border: "1px solid #3f4147",
            }}
          />
          <button
            type="submit"
            disabled={addLoading || !addUsername.trim()}
            className="px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "#5865f2", color: "white" }}
          >
            {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
          </button>
        </div>
        {addStatus && (
          <p
            className="mt-1 text-xs px-1"
            style={{ color: addStatus.type === "success" ? "#23a55a" : "#f23f43" }}
          >
            {addStatus.msg}
          </p>
        )}
      </form>

      {/* Tabs */}
      <div
        className="flex gap-1 px-4 pb-2 flex-shrink-0 border-b"
        style={{ borderColor: "#1e1f22" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={{
              background: tab === t.id ? "#404249" : "transparent",
              color: tab === t.id ? "#f2f3f5" : "#949ba4",
            }}
          >
            {t.label}
            {t.count && t.count > 0 ? (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "#f23f43", color: "white" }}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#949ba4" }} />
          </div>
        ) : (
          <>
            {/* Pending received */}
            {pendingReceivedList.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase px-1 mb-1" style={{ color: "#949ba4" }}>
                  Incoming — {pendingReceivedList.length}
                </p>
                {pendingReceivedList.map((entry) => (
                  <FriendEntry
                    key={entry.id}
                    entry={entry}
                    actions={
                      <>
                        <IconButton onClick={() => handleAccept(entry.id)} title="Accept">
                          <Check className="w-4 h-4" />
                        </IconButton>
                        <IconButton onClick={() => handleDecline(entry.id)} title="Decline" danger>
                          <X className="w-4 h-4" />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            )}

            {/* Pending sent */}
            {pendingSentList.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase px-1 mb-1" style={{ color: "#949ba4" }}>
                  Outgoing — {pendingSentList.length}
                </p>
                {pendingSentList.map((entry) => (
                  <FriendEntry
                    key={entry.id}
                    entry={entry}
                    actions={
                      <IconButton onClick={() => handleRemove(entry.id)} title="Cancel request" danger>
                        <X className="w-4 h-4" />
                      </IconButton>
                    }
                  />
                ))}
              </div>
            )}

            {/* Main list */}
            {displayList.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase px-1 mb-1" style={{ color: "#949ba4" }}>
                  {tab === "online"
                    ? `Online — ${displayList.length}`
                    : tab === "all"
                    ? `All Friends — ${displayList.length}`
                    : `Blocked — ${displayList.length}`}
                </p>
                {displayList.map((entry) => (
                  <FriendEntry
                    key={entry.id}
                    entry={entry}
                    actions={
                      tab === "blocked" ? (
                        <IconButton onClick={() => handleRemove(entry.id)} title="Unblock">
                          <ShieldOff className="w-4 h-4" />
                        </IconButton>
                      ) : (
                        <>
                          <IconButton onClick={() => handleBlock(entry.id)} title="Block" danger>
                            <ShieldOff className="w-4 h-4" />
                          </IconButton>
                          <IconButton onClick={() => handleRemove(entry.id)} title="Remove friend" danger>
                            <UserMinus className="w-4 h-4" />
                          </IconButton>
                        </>
                      )
                    }
                  />
                ))}
              </div>
            )}

            {/* Empty states */}
            {tab === "pending" && pendingReceivedList.length === 0 && pendingSentList.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: "#949ba4" }}>
                No pending friend requests
              </p>
            )}
            {tab !== "pending" && displayList.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: "#949ba4" }}>
                {tab === "online"
                  ? "No friends online"
                  : tab === "all"
                  ? "You haven't added any friends yet"
                  : "No blocked users"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
