"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

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
  activeChannelId: string | null
) {
  const supabase = createClientSupabaseClient()
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set())
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({})
  const activeChannelRef = useRef(activeChannelId)
  activeChannelRef.current = activeChannelId

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
      await supabase.rpc("mark_channel_read", { p_channel_id: channelId })
    },
    [supabase]
  )

  // Load initial unread state
  useEffect(() => {
    if (channelIds.length === 0) return

    async function loadInitialUnread() {
      // 1. Fetch this user's read_states for these channels
      const { data: readStates } = await supabase
        .from("read_states")
        .select("channel_id, last_read_at, mention_count")
        .eq("user_id", currentUserId)
        .in("channel_id", channelIds)

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
        const { data: latestMessages } = await supabase
          .from("messages")
          .select("channel_id, created_at")
          .in("channel_id", channelsWithReadState)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })

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
    }

    loadInitialUnread()
  }, [serverId, currentUserId])

  // Mark currently active channel as read on activation
  useEffect(() => {
    if (activeChannelId) {
      markRead(activeChannelId)
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
        },
        (payload) => {
          const msg = payload.new as { channel_id: string; author_id: string }

          // Only care about channels in this server
          if (!channelIds.includes(msg.channel_id)) return

          // Don't mark as unread if it's own message or if channel is active
          if (msg.author_id === currentUserId) return
          if (msg.channel_id === activeChannelRef.current) return

          setUnreadChannelIds((prev) => {
            if (prev.has(msg.channel_id)) return prev
            const next = new Set(prev)
            next.add(msg.channel_id)
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [serverId, channelIds.join(","), currentUserId])

  return { unreadChannelIds, mentionCounts, markRead }
}
