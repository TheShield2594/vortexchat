"use client"

import { useState, useCallback } from "react"

type EmojiPickerType = (typeof import("frimousse"))["EmojiPicker"]

let _cached: EmojiPickerType | null = null
let _promise: Promise<EmojiPickerType> | null = null

function load(): Promise<EmojiPickerType> {
  if (!_promise) {
    _promise = import("frimousse").then((m) => {
      _cached = m.EmojiPicker
      return m.EmojiPicker
    })
  }
  return _promise
}

/** Lazy-loads the frimousse EmojiPicker compound component on first request.
 *  The module is cached at the module level so subsequent calls are instant. */
export function useLazyEmojiPicker(): {
  EmojiPicker: EmojiPickerType | null
  loadEmojiPicker: () => Promise<void>
  isLoaded: boolean
} {
  const [picker, setPicker] = useState<EmojiPickerType | null>(_cached)

  const loadEmojiPicker = useCallback(async () => {
    if (_cached) {
      setPicker(() => _cached)
      return
    }
    const mod = await load()
    setPicker(() => mod)
  }, [])

  return { EmojiPicker: picker, loadEmojiPicker, isLoaded: picker !== null }
}
