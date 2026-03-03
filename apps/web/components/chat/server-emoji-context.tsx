"use client"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react"

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

/** Returns the current server's custom emoji list, a name-based lookup, and a reload function. */
export function useServerEmojis() {
  return useContext(ServerEmojiContext)
}

export type { ServerEmoji }

/** Fetches and caches server custom emojis, providing a context for child components to resolve :emoji: tokens. */
export function ServerEmojiProvider({ serverId, initialEmojis, children }: { serverId: string; initialEmojis?: ServerEmoji[]; children: React.ReactNode }) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>(initialEmojis ?? [])
  const controllerRef = useRef<AbortController | null>(null)

  // When serverId changes (navigating between servers), reset to SSR-provided data
  useEffect(() => {
    setEmojis(initialEmojis ?? [])
  }, [serverId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const res = await fetch(`/api/servers/${serverId}/emojis`, { signal: controller.signal })
      if (res.ok && !controller.signal.aborted) setEmojis(await res.json())
    } catch (err: any) {
      if (err.name !== "AbortError") console.error("Failed to reload emojis", err)
    }
  }, [serverId])

  const getEmoji = useCallback((name: string): ServerEmoji | null => {
    return emojis.find((e) => e.name === name) ?? null
  }, [emojis])

  const value = useMemo(() => ({ emojis, getEmoji, reload }), [emojis, getEmoji, reload])

  return (
    <ServerEmojiContext.Provider value={value}>
      {children}
    </ServerEmojiContext.Provider>
  )
}

/** Inline component to render :emoji_name: tokens. */
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
