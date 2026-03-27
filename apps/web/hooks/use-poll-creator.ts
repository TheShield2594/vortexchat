"use client"

import { useState, useCallback } from "react"

interface UsePollCreatorOptions {
  content: string
  onContentChange: (content: string) => void
  onCursorChange: (position: number) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

interface UsePollCreatorReturn {
  showPollCreator: boolean
  setShowPollCreator: (show: boolean) => void
  pollQuestion: string
  setPollQuestion: (question: string) => void
  pollOptions: string[]
  setPollOptions: React.Dispatch<React.SetStateAction<string[]>>
  canInsertPoll: boolean
  handleCreatePoll: () => void
  handlePollInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  removePollOption: (index: number) => void
  resetPollDraftToBlank: () => void
  openPollCreator: (initialQuestion?: string) => void
}

export function usePollCreator({ content, onContentChange, onCursorChange, textareaRef }: UsePollCreatorOptions): UsePollCreatorReturn {
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])

  const canInsertPoll = pollQuestion.trim().length > 0 && pollOptions.filter((option) => option.trim().length > 0).length >= 2

  const resetPollDraftToBlank = useCallback(() => {
    setPollQuestion("")
    setPollOptions([])
  }, [])

  const handleCreatePoll = useCallback(() => {
    const question = pollQuestion.trim()
    const options = pollOptions.map((option) => option.trim()).filter(Boolean)
    if (!question || options.length < 2) return

    const pollBlock = ["[POLL]", question, ...options.map((option) => `- ${option}`), "[/POLL]"].join("\n")
    const spacer = content.trim() ? "\n\n" : ""
    const next = `${content}${spacer}${pollBlock}`
    onContentChange(next)
    onCursorChange(next.length)
    setShowPollCreator(false)
    setPollQuestion("")
    setPollOptions(["", ""])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      if (textareaRef.current) {
        textareaRef.current.selectionStart = next.length
        textareaRef.current.selectionEnd = next.length
      }
    })
  }, [pollQuestion, pollOptions, content, onContentChange, onCursorChange, textareaRef])

  const handlePollInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return
    if (!canInsertPoll) return
    event.preventDefault()
    handleCreatePoll()
  }, [canInsertPoll, handleCreatePoll])

  const removePollOption = useCallback((index: number) => {
    if (pollOptions.length <= 2) return
    setPollOptions((prev) => prev.filter((_, optionIndex) => optionIndex !== index))
  }, [pollOptions.length])

  const openPollCreator = useCallback((initialQuestion?: string) => {
    if (pollOptions.length === 0) setPollOptions(["", ""])
    if (initialQuestion) setPollQuestion(initialQuestion)
    setShowPollCreator(true)
  }, [pollOptions.length])

  return {
    showPollCreator, setShowPollCreator,
    pollQuestion, setPollQuestion,
    pollOptions, setPollOptions,
    canInsertPoll,
    handleCreatePoll,
    handlePollInputKeyDown,
    removePollOption,
    resetPollDraftToBlank,
    openPollCreator,
  }
}
