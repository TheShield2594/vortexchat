export interface ComposerKeybindingState {
  isMentionOpen: boolean
  hasMentionSelection: boolean
  hasDraftContent: boolean
  mentionHandledNavigation: boolean
}

export interface ComposerKeybindingResult {
  preventDefault: boolean
  sendMessage: boolean
  acceptMention: boolean
  closeMention: boolean
  clearDraft: boolean
}

/**
 * Keyboard action resolver for Discord-like composer behavior.
 */
export function resolveComposerKeybinding(
  key: string,
  shiftKey: boolean,
  state: ComposerKeybindingState
): ComposerKeybindingResult {
  if (state.mentionHandledNavigation) {
    return {
      preventDefault: true,
      sendMessage: false,
      acceptMention: false,
      closeMention: false,
      clearDraft: false,
    }
  }

  if (state.isMentionOpen) {
    if (key === "Escape") {
      return {
        preventDefault: true,
        sendMessage: false,
        acceptMention: false,
        closeMention: true,
        clearDraft: false,
      }
    }

    if (key === "Tab" || (key === "Enter" && !shiftKey)) {
      return {
        preventDefault: state.hasMentionSelection,
        sendMessage: false,
        acceptMention: state.hasMentionSelection,
        closeMention: false,
        clearDraft: false,
      }
    }
  }

  if (key === "Enter" && !shiftKey) {
    return {
      preventDefault: true,
      sendMessage: true,
      acceptMention: false,
      closeMention: false,
      clearDraft: false,
    }
  }

  if (key === "Escape" && state.hasDraftContent) {
    return {
      preventDefault: true,
      sendMessage: false,
      acceptMention: false,
      closeMention: false,
      clearDraft: true,
    }
  }

  return {
    preventDefault: false,
    sendMessage: false,
    acceptMention: false,
    closeMention: false,
    clearDraft: false,
  }
}

