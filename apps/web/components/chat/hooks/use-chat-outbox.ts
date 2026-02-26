import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import {
  type OutboxEntry,
  getDraft,
  loadOutbox,
  saveOutbox,
  setDraft,
} from "@/lib/chat-outbox"
import type { MessageWithAuthor } from "@/types/database"

interface UseChatOutboxArgs {
  channelId: string
  initialIsOnline: boolean
  makeOptimisticMessage: (entry: OutboxEntry) => MessageWithAuthor
  setMessages: Dispatch<SetStateAction<MessageWithAuthor[]>>
  setReplyTo: Dispatch<SetStateAction<MessageWithAuthor | null>>
}

export function useChatOutbox({
  channelId,
  initialIsOnline,
  makeOptimisticMessage,
  setMessages,
  setReplyTo,
}: UseChatOutboxArgs) {
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])
  const [draft, setDraftState] = useState("")
  const [isOnline, setIsOnline] = useState(initialIsOnline)
  const outboxRef = useRef<OutboxEntry[]>([])
  const draftRef = useRef("")
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setAndPersistOutbox = useCallback((next: OutboxEntry[] | ((current: OutboxEntry[]) => OutboxEntry[])) => {
    const resolved = typeof next === "function" ? next(outboxRef.current) : next
    setOutbox(resolved)
    outboxRef.current = resolved
    saveOutbox(resolved)
  }, [])

  const resetComposerState = useCallback(() => {
    setReplyTo(null)
    setDraftState("")
    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current)
      draftPersistTimerRef.current = null
    }
    setDraft(channelId, "")
  }, [channelId, setReplyTo])

  useEffect(() => {
    const persisted = loadOutbox()
    outboxRef.current = persisted
    setOutbox(persisted)
    setDraftState(getDraft(channelId))

    const channelOutbox = persisted.filter((entry) => entry.channelId === channelId)
    if (channelOutbox.length > 0) {
      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id))
        const optimistic = channelOutbox
          .filter((entry) => !known.has(entry.id))
          .map(makeOptimisticMessage)
        return [...prev, ...optimistic]
      })
    }
  }, [channelId, makeOptimisticMessage, setMessages])

  useEffect(() => {
    outboxRef.current = outbox
  }, [outbox])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    const channelIdAtEffect = channelId
    return () => {
      if (draftPersistTimerRef.current) {
        setDraft(channelIdAtEffect, draftRef.current)
        clearTimeout(draftPersistTimerRef.current)
        draftPersistTimerRef.current = null
      }
    }
  }, [channelId])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  return {
    draft,
    draftPersistTimerRef,
    draftRef,
    isOnline,
    outbox,
    outboxRef,
    resetComposerState,
    setAndPersistOutbox,
    setDraftState,
    setIsOnline,
  }
}
