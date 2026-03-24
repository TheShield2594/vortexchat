"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { openDmChannel, sendFriendRequest } from "@/lib/social-actions"

type FriendshipStatus = "none" | "friends" | "pending_sent" | "pending_received" | "blocked" | "self"

interface UseFriendshipActionsOptions {
  userId?: string
  username?: string
  currentUserId?: string
  /** When true, fetch friendship status immediately on mount. When false, call fetchStatus manually (e.g. on popover open). */
  fetchOnMount?: boolean
}

interface UseFriendshipActionsReturn {
  friendshipStatus: FriendshipStatus
  friendshipId: string | null
  actionLoading: "message" | "friend" | null
  isOtherUser: boolean
  handleMessage: () => Promise<void>
  handleAddFriend: () => Promise<void>
  handleRemoveFriend: () => Promise<void>
  fetchStatus: () => Promise<void>
}

/** Shared hook for friendship status fetching and friend/message actions used by ProfilePanel and UserProfilePopover. */
export function useFriendshipActions({
  userId,
  username,
  currentUserId,
  fetchOnMount = false,
}: UseFriendshipActionsOptions): UseFriendshipActionsReturn {
  const router = useRouter()
  const { toast } = useToast()
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>("none")
  const [friendshipId, setFriendshipId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<"message" | "friend" | null>(null)
  const [statusLoaded, setStatusLoaded] = useState(false)

  const isOtherUser = Boolean(userId && currentUserId && userId !== currentUserId)

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (!isOtherUser || !userId || statusLoaded) return
    try {
      const res = await fetch(`/api/friends/status?userId=${userId}`)
      if (res.ok) {
        const json = (await res.json()) as { status: FriendshipStatus; friendshipId?: string }
        setFriendshipStatus(json.status)
        setFriendshipId(json.friendshipId ?? null)
      }
    } catch {
      // silently ignore; default to "none"
    } finally {
      setStatusLoaded(true)
    }
  }, [userId, isOtherUser, statusLoaded])

  useEffect(() => {
    if (!fetchOnMount) return
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!isOtherUser || !userId) return
      try {
        const res = await fetch(`/api/friends/status?userId=${userId}`)
        if (res.ok && !cancelled) {
          const json = (await res.json()) as { status: FriendshipStatus; friendshipId?: string }
          setFriendshipStatus(json.status)
          setFriendshipId(json.friendshipId ?? null)
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setStatusLoaded(true)
      }
    }
    run()
    return () => { cancelled = true }
  }, [userId, isOtherUser, fetchOnMount])

  const handleMessage = useCallback(async (): Promise<void> => {
    if (!userId || actionLoading) return
    setActionLoading("message")
    try {
      // openDmChannel handles its own toast on errors
      await openDmChannel(userId, router, toast)
    } catch (error) {
      console.error("Failed to open DM:", error)
    } finally {
      setActionLoading(null)
    }
  }, [userId, actionLoading, router, toast])

  const handleAddFriend = useCallback(async (): Promise<void> => {
    if (!username || actionLoading) return
    setActionLoading("friend")
    try {
      // sendFriendRequest handles its own toast feedback
      const success = await sendFriendRequest(username, toast)
      if (success) {
        setFriendshipStatus("pending_sent")
      }
    } catch (error) {
      console.error("Failed to send friend request:", error)
    } finally {
      setActionLoading(null)
    }
  }, [username, actionLoading, toast])

  const handleRemoveFriend = useCallback(async (): Promise<void> => {
    if (!friendshipId || actionLoading) return
    setActionLoading("friend")
    try {
      const res = await fetch(`/api/friends?id=${friendshipId}`, { method: "DELETE" })
      let errorMessage = "Failed to remove friend"
      try {
        const json = await res.json()
        if (res.ok) {
          toast({ title: "Friend removed" })
          setFriendshipStatus("none")
          setFriendshipId(null)
          return
        }
        errorMessage = json.error || errorMessage
      } catch {
        // Response was not valid JSON
      }
      toast({ variant: "destructive", title: errorMessage })
    } catch (error) {
      console.error("Failed to remove friend:", error)
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Network error while removing friend",
      })
    } finally {
      setActionLoading(null)
    }
  }, [friendshipId, actionLoading, toast])

  return {
    friendshipStatus,
    friendshipId,
    actionLoading,
    isOtherUser,
    handleMessage,
    handleAddFriend,
    handleRemoveFriend,
    fetchStatus,
  }
}
