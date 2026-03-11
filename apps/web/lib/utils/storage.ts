/**
 * Shared localStorage helpers — replaces duplicated boolean storage patterns in:
 *   - lib/stores/app-store.ts (loadBooleanStorage / persistBooleanStorage)
 *   - hooks/use-notification-sound.ts
 *   - Any future store that persists boolean flags to localStorage
 */

/** Read a boolean from localStorage with a safe fallback. */
export function loadBooleanStorage(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored == null ? fallback : stored === "true"
  } catch {
    return fallback
  }
}

/** Write a boolean to localStorage (best-effort, no throw). */
export function persistBooleanStorage(key: string, value: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Best effort only — storage may be full or disabled
  }
}

/** Read a string from localStorage with a safe fallback. */
export function loadStringStorage(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

/** Write a string to localStorage (best-effort, no throw). */
export function persistStringStorage(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Best effort only
  }
}
