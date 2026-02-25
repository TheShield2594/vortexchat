"use client"

import { useEffect, useMemo } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { MessageWithAuthor, MessageRow, ReactionRow } from "@/types/database"

/** Subscribes to real-time message inserts, updates, and reaction changes for a channel via Supabase Realtime postgres_changes. */
export function useRealtimeMessages(
  channelId: string,
  onInsert: (message: MessageWithAuthor) => void,
  onUpdate: (message: MessageRow) => void,
  onReactionInsert?: (reaction: ReactionRow) => void,
  onReactionDelete?: (reaction: ReactionRow) => void
) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          // Fetch full message with relations
          const { data } = await supabase
            .from("messages")
            .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*), reply_to:messages!messages_reply_to_id_fkey(*, author:users!messages_author_id_fkey(*))`)
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
          filter: `channel_id=eq.${channelId}`,
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
      supabase.removeChannel(channel)
    }
  }, [channelId])
}
