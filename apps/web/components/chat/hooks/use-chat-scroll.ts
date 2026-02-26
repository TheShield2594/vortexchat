import { useEffect, useRef, useState, type MutableRefObject } from "react"

interface UseChatScrollArgs {
  hasMoreHistory: boolean
  loadOlderMessages: () => Promise<void>
  messageScrollerRef: MutableRefObject<HTMLDivElement | null>
  paginationRequestRef: MutableRefObject<Promise<unknown> | null>
  scrollStorageKey: string
  unreadAnchorStorageKey: string
  onReachedBottom: () => void
}

export function useChatScroll({
  hasMoreHistory,
  loadOlderMessages,
  messageScrollerRef,
  paginationRequestRef,
  scrollStorageKey,
  unreadAnchorStorageKey,
  onReachedBottom,
}: UseChatScrollArgs) {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const container = messageScrollerRef.current
    if (!container) return

    const persistScroll = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(scrollStorageKey, String(container.scrollTop))
      }
    }

    const onScroll = () => {
      if (container.scrollTop < 120 && hasMoreHistory && !paginationRequestRef.current) {
        void loadOlderMessages()
      }

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const nextIsAtBottom = distanceFromBottom < 120
      setIsAtBottom(nextIsAtBottom)

      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
      }
      scrollSaveTimerRef.current = setTimeout(() => {
        persistScroll()
        scrollSaveTimerRef.current = null
      }, 250)

      if (nextIsAtBottom) {
        onReachedBottom()
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(unreadAnchorStorageKey)
        }
      }
    }

    onScroll()
    container.addEventListener("scroll", onScroll)

    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
      persistScroll()
      container.removeEventListener("scroll", onScroll)
    }
  }, [hasMoreHistory, loadOlderMessages, messageScrollerRef, onReachedBottom, paginationRequestRef, scrollStorageKey, unreadAnchorStorageKey])

  return { isAtBottom, setIsAtBottom }
}
