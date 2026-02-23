export type OutboxStatus = "queued" | "sending" | "failed"

export interface OutboxEntry {
  id: string
  channelId: string
  authorId: string
  content: string
  replyToId: string | null
  createdAt: string
  status: OutboxStatus
  retryCount: number
  lastError: string | null
}

const OUTBOX_KEY = "vortexchat:chat:outbox:v1"
const DRAFTS_KEY = "vortexchat:chat:drafts:v1"

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function loadOutbox(storage: Pick<Storage, "getItem"> = window.localStorage): OutboxEntry[] {
  return safeParse<OutboxEntry[]>(storage.getItem(OUTBOX_KEY), [])
}

export function saveOutbox(entries: OutboxEntry[], storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(OUTBOX_KEY, JSON.stringify(entries))
}

export function upsertOutboxEntry(entries: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  const existingIndex = entries.findIndex((candidate) => candidate.id === entry.id)
  if (existingIndex === -1) return [...entries, entry]
  const next = [...entries]
  next[existingIndex] = entry
  return next
}

export function removeOutboxEntry(entries: OutboxEntry[], id: string): OutboxEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

export function updateOutboxStatus(
  entries: OutboxEntry[],
  id: string,
  patch: Partial<Pick<OutboxEntry, "status" | "retryCount" | "lastError">>
): OutboxEntry[] {
  return entries.map((entry) => {
    if (entry.id !== id) return entry
    return { ...entry, ...patch }
  })
}

/**
 * Replay protocol: queued/failed entries are replayed by client creation time.
 * Ties are broken by deterministic id ordering to keep retries idempotent.
 */
export function resolveReplayOrder(entries: OutboxEntry[]): OutboxEntry[] {
  return entries
    .filter((entry) => entry.status === "queued" || entry.status === "failed")
    .sort((left, right) => {
      const byTime = left.createdAt.localeCompare(right.createdAt)
      if (byTime !== 0) return byTime
      return left.id.localeCompare(right.id)
    })
}

export function loadDraftMap(storage: Pick<Storage, "getItem"> = window.localStorage): Record<string, string> {
  return safeParse<Record<string, string>>(storage.getItem(DRAFTS_KEY), {})
}

export function saveDraftMap(drafts: Record<string, string>, storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

export function setDraft(channelId: string, value: string, storage: Storage = window.localStorage): Record<string, string> {
  const drafts = loadDraftMap(storage)
  if (value.trim().length === 0) {
    delete drafts[channelId]
  } else {
    drafts[channelId] = value
  }
  saveDraftMap(drafts, storage)
  return drafts
}

export function getDraft(channelId: string, storage: Storage = window.localStorage): string {
  const drafts = loadDraftMap(storage)
  return drafts[channelId] ?? ""
}
