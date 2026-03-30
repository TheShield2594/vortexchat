"use client"

import { useEffect, useMemo, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useNotificationSound } from "@/hooks/use-notification-sound"
import { shouldNotify, showBrowserNotification } from "@/lib/notification-manager"

/**
 * Global DM notification sound hook — mounted in AppProvider so it fires
 * even when the DMList component is not rendered (e.g. user is on a server).
 *
 * Listens for direct_messages INSERTs for the current user's DM channels
 * and plays a notification sound + shows browser notification when appropriate.
 */
export function useDmNotificationSound(userId: string | null): void {
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const { playNotification } = useNotificationSound()
  const playRef = useRef(playNotification)
  playRef.current = playNotification

  useEffect(() => {
    if (!userId) return

    // Subscribe to all direct_messages sent TO this user (sender_id != userId)
    // We filter by the table and check sender_id in the callback since
    // Supabase realtime doesn't support != filters.
    const ch = supabase
      .channel(`dm-notif-sound:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const msg = payload.new as {
            id?: string
            sender_id?: string
            dm_channel_id?: string
            content?: string
          } | undefined

          if (!msg?.sender_id || msg.sender_id === userId) return

          const { shouldPlaySound, shouldShowBrowserNotification } = shouldNotify({
            dmChannelId: msg.dm_channel_id,
            messageId: msg.id,
          })

          if (shouldPlaySound) {
            playRef.current()
          }

          if (shouldShowBrowserNotification) {
            showBrowserNotification({
              title: "New Message",
              body: msg.content?.slice(0, 100) || "Sent a message",
              channelId: msg.dm_channel_id,
              url: msg.dm_channel_id ? `/channels/me/${msg.dm_channel_id}` : "/channels/me",
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId, supabase])
}
