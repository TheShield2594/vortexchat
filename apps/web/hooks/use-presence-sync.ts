"use client"

import { useEffect, useRef } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

/**
 * Syncs the current user's online/offline status via Supabase Realtime Presence
 * on a global channel. When the tab/browser closes, Supabase automatically
 * removes the presence entry, so other clients see them go offline.
 *
 * Also writes status to users table on mount (online) and on beforeunload (offline)
 * so the DB field stays consistent with presence.
 */
export function usePresenceSync(userId: string | null, status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline') {
  const supabase = createClientSupabaseClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!userId) return

    // Mark online in DB
    supabase
      .from("users")
      .update({ status: status ?? "online", updated_at: new Date().toISOString() })
      .eq("id", userId)
      .then()

    // Track in global presence channel
    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    })

    channelRef.current = channel

    channel
      .on("presence", { event: "sync" }, () => {
        // Other components (MemberList) handle reading presence state
      })
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            status: status ?? "online",
            online_at: new Date().toISOString(),
          })
        }
      })

    // Mark offline when tab closes
    function handleBeforeUnload() {
      if (!userId) return
      // Best-effort — may not complete but Supabase Presence auto-expires
      channel.untrack()
      supabase
        .from("users")
        .update({ status: "offline", updated_at: new Date().toISOString() })
        .eq("id", userId)
        .then()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      handleBeforeUnload()
      supabase.removeChannel(channel)
    }
  }, [userId, status])
}
