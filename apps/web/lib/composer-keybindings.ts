export interface ComposerKeybindingState {
  isMentionOpen: boolean
  hasMentionSelection: boolean
  isEmojiOpen: boolean
  hasEmojiSelection: boolean
  isSlashOpen: boolean
  hasSlashSelection: boolean
  hasDraftContent: boolean
  mentionHandledNavigation: boolean
  emojiHandledNavigation: boolean
  slashHandledNavigation: boolean
}

export interface ComposerKeybindingResult {
  preventDefault: boolean
  sendMessage: boolean
  acceptMention: boolean
  closeMention: boolean
  acceptEmoji: boolean
  closeEmoji: boolean
  acceptSlash: boolean
  closeSlash: boolean
  clearDraft: boolean
}

const NOOP: ComposerKeybindingResult = {
  preventDefault: false,
  sendMessage: false,
  acceptMention: false,
  closeMention: false,
  acceptEmoji: false,
  closeEmoji: false,
  acceptSlash: false,
  closeSlash: false,
  clearDraft: false,
}

/**
 * Keyboard action resolver for Discord-like composer behavior.
 */
export function resolveComposerKeybinding(
  key: string,
  shiftKey: boolean,
  state: ComposerKeybindingState
): ComposerKeybindingResult {
  if (state.mentionHandledNavigation || state.emojiHandledNavigation || state.slashHandledNavigation) {
    return { ...NOOP, preventDefault: true }
  }

  // Mention autocomplete takes priority
  if (state.isMentionOpen) {
    if (key === "Escape") {
      return { ...NOOP, preventDefault: true, closeMention: true }
    }
    if (key === "Tab" || (key === "Enter" && !shiftKey)) {
      return {
        ...NOOP,
        preventDefault: state.hasMentionSelection,
        acceptMention: state.hasMentionSelection,
      }
    }
  }

  // Emoji autocomplete
  if (state.isEmojiOpen) {
    if (key === "Escape") {
      return { ...NOOP, preventDefault: true, closeEmoji: true }
    }
    if (key === "Tab" || (key === "Enter" && !shiftKey)) {
      return {
        ...NOOP,
        preventDefault: state.hasEmojiSelection,
        acceptEmoji: state.hasEmojiSelection,
      }
    }
  }

  // Slash command autocomplete
  if (state.isSlashOpen) {
    if (key === "Escape") {
      return { ...NOOP, preventDefault: true, closeSlash: true }
    }
    if (key === "Tab" || (key === "Enter" && !shiftKey)) {
      return {
        ...NOOP,
        preventDefault: state.hasSlashSelection,
        acceptSlash: state.hasSlashSelection,
      }
    }
  }

  if (key === "Enter" && !shiftKey) {
    return { ...NOOP, preventDefault: true, sendMessage: true }
  }

  if (key === "Escape" && state.hasDraftContent) {
    return { ...NOOP, preventDefault: true, clearDraft: true }
  }

  return NOOP
}
