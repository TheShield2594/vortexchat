"use client"

import { useEffect, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { MessageWithAuthor } from "@/types/database"

export function useRealtimeMessages(
  channelId: string,
  onInsert: (message: MessageWithAuthor) => void,
  onUpdate: (message: Partial<MessageWithAuthor> & { id: string }) => void
) {
  const supabase = createClientSupabaseClient()
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)

  // Keep refs current so the subscription always calls the latest callbacks
  onInsertRef.current = onInsert
  onUpdateRef.current = onUpdate

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
          if (data) onInsertRef.current(data as MessageWithAuthor)
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
          onUpdateRef.current(payload.new as Partial<MessageWithAuthor> & { id: string })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId, supabase])
}
