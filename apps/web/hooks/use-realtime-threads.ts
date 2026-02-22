"use client"

import { useEffect } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { ThreadRow, MessageWithAuthor, MessageRow, ReactionRow } from "@/types/database"

/**
 * Subscribes to realtime events for:
 * - Thread inserts/updates in a parent channel
 * - Message inserts/updates inside a specific thread
 */
export function useRealtimeThreads(
  channelId: string,
  onThreadInsert: (thread: ThreadRow) => void,
  onThreadUpdate: (thread: ThreadRow) => void
) {
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    const subscription = supabase
      .channel(`threads:channel:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "threads",
          filter: `parent_channel_id=eq.${channelId}`,
        },
        (payload) => {
          onThreadInsert(payload.new as ThreadRow)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "threads",
          filter: `parent_channel_id=eq.${channelId}`,
        },
        (payload) => {
          onThreadUpdate(payload.new as ThreadRow)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [channelId])
}

/**
 * Subscribes to realtime message events inside a single thread.
 */
export function useRealtimeThreadMessages(
  threadId: string,
  onInsert: (message: MessageWithAuthor) => void,
  onUpdate: (message: MessageRow) => void,
  onReactionInsert?: (reaction: ReactionRow) => void,
  onReactionDelete?: (reaction: ReactionRow) => void
) {
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    const subscription = supabase
      .channel(`thread_messages:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
            .eq("id", payload.new.id)
            .single()
          if (data) onInsert(data as unknown as MessageWithAuthor)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          onUpdate(payload.new as MessageRow)
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload) => {
          if (onReactionInsert) onReactionInsert(payload.new as ReactionRow)
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (payload) => {
          if (onReactionDelete) onReactionDelete(payload.old as ReactionRow)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [threadId])
}
