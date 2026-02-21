"use client"

import { useEffect } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { MessageWithAuthor, ReactionRow } from "@/types/database"

export function useRealtimeMessages(
  channelId: string,
  onInsert: (message: MessageWithAuthor) => void,
  onUpdate: (message: Partial<MessageWithAuthor> & { id: string }) => void,
  onReactionChange?: (reaction: ReactionRow, eventType: "INSERT" | "DELETE") => void
) {
  const supabase = createClientSupabaseClient()

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${channelId}`)
      // New message
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select(`*, author:users(*), attachments(*), reactions(*)`)
            .eq("id", payload.new.id)
            .single()
          if (data) onInsert(data as unknown as MessageWithAuthor)
        }
      )
      // Edited / soft-deleted message
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          onUpdate(payload.new as any)
        }
      )
      // Reaction added
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reactions",
        },
        (payload) => {
          onReactionChange?.(payload.new as ReactionRow, "INSERT")
        }
      )
      // Reaction removed
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "reactions",
        },
        (payload) => {
          onReactionChange?.(payload.old as ReactionRow, "DELETE")
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId])
}
