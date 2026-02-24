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

export function useServerEmojis() {
  return useContext(ServerEmojiContext)
}

/** Fetches and caches server custom emojis, providing a context for child components to resolve :emoji: tokens. */
export function ServerEmojiProvider({ serverId, children }: { serverId: string; children: React.ReactNode }) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    fetch(`/api/servers/${serverId}/emojis`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (!controller.signal.aborted) {
          setEmojis(data)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load emojis", err)
      })
    return () => controller.abort()
  }, [serverId])

  const reload = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/emojis`)
    if (res.ok) setEmojis(await res.json())
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
