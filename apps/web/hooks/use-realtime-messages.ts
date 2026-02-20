"use client"

import { useEffect } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { MessageWithAuthor } from "@/types/database"

export function useRealtimeMessages(
  channelId: string,
  onInsert: (message: MessageWithAuthor) => void,
  onUpdate: (message: Partial<MessageWithAuthor> & { id: string }) => void
) {
  const supabase = createClientSupabaseClient()

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
            .select(`*, author:users(*), attachments(*), reactions(*)`)
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
          onUpdate(payload.new as any)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId])
}
