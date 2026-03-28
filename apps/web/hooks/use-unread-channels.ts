"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

function isMessagePayload(
  obj: unknown
): obj is { channel_id: string; author_id: string; mentions?: string[] } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "channel_id" in obj &&
    typeof (obj as Record<string, unknown>).channel_id === "string" &&
    "author_id" in obj &&
    typeof (obj as Record<string, unknown>).author_id === "string"
  )
}

/**
 * Tracks which channels have unread messages for the current user.
 *
 * Strategy:
 *   1. On mount: load read_states from DB (last_read_at per channel).
 *      Fetch the latest message timestamp per channel and compare.
 *   2. Subscribe to message INSERTs across all channels in the server.
 *      If the message lands in a channel that isn't currently active → mark unread.
 *   3. When activeChannelId changes: mark that channel read in DB and clear local unread.
 */
export function useUnreadChannels(
  serverId: string,
  channelIds: string[],
  currentUserId: string,
  activeChannelId: string | null,
  onNewUnread?: () => void,
  initialData?: { unreadChannelIds: string[]; mentionCounts: Record<string, number> }
) {
  const onNewUnreadRef = useRef(onNewUnread)
  onNewUnreadRef.current = onNewUnread
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(
    () => new Set(initialData?.unreadChannelIds ?? [])
  )
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>(
    initialData?.mentionCounts ?? {}
  )
  const activeChannelRef = useRef(activeChannelId)
  activeChannelRef.current = activeChannelId
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mark active channel as read in DB + clear local unread
  const markRead = useCallback(
    async (channelId: string) => {
      setUnreadChannelIds((prev) => {
        if (!prev.has(channelId)) return prev
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
      setMentionCounts((prev) => {
        if (!prev[channelId]) return prev
        const next = { ...prev }
        delete next[channelId]
        return next
      })
      // Upsert in DB
      try {
        const { error } = await supabase.rpc("mark_channel_read", { p_channel_id: channelId })
        if (error) console.error("useUnreadChannels: mark_channel_read RPC failed", error.message)
      } catch (err) {
        console.error("useUnreadChannels: mark_channel_read failed", err)
      }
    },
    [supabase]
  )

  // Load initial unread state
  useEffect(() => {
    if (channelIds.length === 0) return
    if (initialData) return

    async function loadInitialUnread(): Promise<void> {
      try {
        // 1. Fetch this user's read_states for these channels
        const { data: readStates, error: rsError } = await supabase
          .from("read_states")
          .select("channel_id, last_read_at, mention_count")
          .eq("user_id", currentUserId)
          .in("channel_id", channelIds)

        if (rsError) {
          console.error("useUnreadChannels: failed to load read_states", rsError.message)
          return
        }

        const readMap: Record<string, string> = {}
        const mentionMap: Record<string, number> = {}
        for (const rs of readStates ?? []) {
          readMap[rs.channel_id] = rs.last_read_at
          if (rs.mention_count > 0) mentionMap[rs.channel_id] = rs.mention_count
        }

        // 2. For channels with a known read state, check if there's a newer message
        const unread = new Set<string>()
        const channelsWithReadState = Object.keys(readMap)

        if (channelsWithReadState.length > 0) {
          const { data: latestMessages, error: msgError } = await supabase
            .from("messages")
            .select("channel_id, created_at")
            .in("channel_id", channelsWithReadState)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(Math.max(channelsWithReadState.length * 10, 100))

          if (msgError) {
            console.error("useUnreadChannels: failed to load latest messages", msgError.message)
            return
          }

          // Build a map of latest message time per channel (first occurrence per channel since ordered desc)
          const latestPerChannel: Record<string, string> = {}
          for (const msg of latestMessages ?? []) {
            if (!latestPerChannel[msg.channel_id]) {
              latestPerChannel[msg.channel_id] = msg.created_at
            }
          }

          for (const channelId of channelsWithReadState) {
            const latest = latestPerChannel[channelId]
            const lastRead = readMap[channelId]
            if (latest && latest > lastRead && channelId !== activeChannelRef.current) {
              unread.add(channelId)
            }
          }
        }

        setUnreadChannelIds(unread)
        setMentionCounts(mentionMap)
      } catch (err) {
        console.error("useUnreadChannels: loadInitialUnread failed", err)
      }
    }

    loadInitialUnread()
  }, [serverId, currentUserId])

  // Mark currently active channel as read after 500ms debounce (avoids rapid-switch RPC calls).
  // Also flush markRead on cleanup so that messages arriving while the user
  // was viewing the channel don't cause a false unread indicator.
  useEffect(() => {
    if (markReadTimerRef.current) {
      clearTimeout(markReadTimerRef.current)
      markReadTimerRef.current = null
    }
    if (activeChannelId) {
      markReadTimerRef.current = setTimeout(() => {
        markRead(activeChannelId)
        markReadTimerRef.current = null
      }, 500)
    }
    return () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current)
        markReadTimerRef.current = null
      }
      // Flush: update last_read_at to departure time so late-arriving
      // messages don't leave a stale unread indicator.
      if (activeChannelId) {
        markRead(activeChannelId)
      }
    }
  }, [activeChannelId, markRead])

  // Subscribe to new messages across this server's channels
  useEffect(() => {
    if (channelIds.length === 0) return

    const channel = supabase
      .channel(`server-messages:${serverId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=in.(${channelIds.join(",")})`,
        },
        (payload) => {
          if (!isMessagePayload(payload.new)) return
          const msg = payload.new

          // Don't mark as unread if it's own message or if channel is active
          if (msg.author_id === currentUserId) return
          if (msg.channel_id === activeChannelRef.current) return

          setUnreadChannelIds((prev) => {
            if (prev.has(msg.channel_id)) return prev
            const next = new Set(prev)
            next.add(msg.channel_id)
            // Only fire notification on read→unread transition
            onNewUnreadRef.current?.()
            return next
          })

          // Update mention counts from realtime messages
          const mentions = Array.isArray(msg.mentions) ? msg.mentions : []
          if (mentions.includes(currentUserId)) {
            setMentionCounts((prev) => ({
              ...prev,
              [msg.channel_id]: (prev[msg.channel_id] ?? 0) + 1,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [serverId, [...channelIds].sort().join(","), currentUserId])

  return { unreadChannelIds, mentionCounts, markRead }
}
