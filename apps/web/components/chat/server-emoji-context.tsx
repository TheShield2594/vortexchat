"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClientSupabaseClient } from "@/lib/supabase/client"

interface ServerEmoji {
  id: string
  name: string
  image_url: string
}

interface ServerEmojiContextValue {
  emojis: ServerEmoji[]
  getEmoji: (name: string) => ServerEmoji | null
  reload: () => void
}

const ServerEmojiContext = createContext<ServerEmojiContextValue>({
  emojis: [],
  getEmoji: () => null,
  reload: () => {},
})

export function useServerEmojis() {
  return useContext(ServerEmojiContext)
}

export function ServerEmojiProvider({ serverId, children }: { serverId: string; children: React.ReactNode }) {
  const supabase = createClientSupabaseClient()
  const [emojis, setEmojis] = useState<ServerEmoji[]>([])

  const reload = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/emojis`)
    if (res.ok) setEmojis(await res.json())
  }, [serverId])

  useEffect(() => { reload() }, [reload])

  function getEmoji(name: string): ServerEmoji | null {
    return emojis.find((e) => e.name === name) ?? null
  }

  return (
    <ServerEmojiContext.Provider value={{ emojis, getEmoji, reload }}>
      {children}
    </ServerEmojiContext.Provider>
  )
}

// Inline component to render :emoji_name: tokens
export function ServerEmojiImage({ name }: { name: string }) {
  const { getEmoji } = useServerEmojis()
  const emoji = getEmoji(name)
  if (!emoji) return <span>:{name}:</span>
  return (
    <img
      src={emoji.image_url}
      alt={`:${name}:`}
      title={`:${name}:`}
      className="inline-block align-middle"
      style={{ width: 22, height: 22, objectFit: "contain" }}
    />
  )
}
