"use client"

import { useEffect, useMemo } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

const BASE_TITLE = "VortexChat — Chat, Hang Out, Belong"

export function useTabUnreadTitle(userId: string | null) {
  const supabase = useMemo(() => createClientSupabaseClient(), [])

  useEffect(() => {
    if (!userId) return
    const currentUserId = userId

    let cancelled = false
    async function refresh() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
         .eq("user_id", currentUserId)
        .is("read_at", null)
      if (cancelled) return
      const unread = count ?? 0
      document.title = unread > 0 ? `(${unread}) VortexChat` : BASE_TITLE
    }

    refresh()
    const interval = window.setInterval(refresh, 30000)
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.title = BASE_TITLE
    }
  }, [supabase, userId])
}
