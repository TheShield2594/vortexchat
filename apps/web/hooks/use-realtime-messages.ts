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
          // Fetch full message with relations (reply_to hydrated separately to
          // avoid depending on the self-referential FK being in PostgREST cache)
          const replyToId = (payload.new as any).reply_to_id
          const [messageResult, replyResult] = await Promise.all([
            supabase
              .from("messages")
              .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
              .eq("id", payload.new.id)
              .single(),
            replyToId
              ? supabase
                  .from("messages")
                  .select(`*, author:users!messages_author_id_fkey(*)`)
                  .eq("id", replyToId)
                  .single()
              : Promise.resolve({ data: null }),
          ])
          const data = messageResult.data
          if (!data) return
          const replyTo = replyResult.data ?? null
          onInsert({ ...data, reply_to: replyTo } as unknown as MessageWithAuthor)
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
