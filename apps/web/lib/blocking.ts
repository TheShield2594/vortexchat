import type { SupabaseClient } from "@supabase/supabase-js"

/** Returns true when either participant has blocked the other. */
export async function isBlockedBetweenUsers(
  supabase: SupabaseClient,
  leftUserId: string,
  rightUserId: string
): Promise<boolean> {
  if (!leftUserId || !rightUserId || leftUserId === rightUserId) return false

  const participantIds = [leftUserId, rightUserId]
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "blocked")
    .in("requester_id", participantIds)
    .in("addressee_id", participantIds)

  if (error) {
    throw new Error(`Failed to evaluate block state: ${error.message}`)
  }

  return (data ?? []).some((row) => {
    const isForward = row.requester_id === leftUserId && row.addressee_id === rightUserId
    const isBackward = row.requester_id === rightUserId && row.addressee_id === leftUserId
    return isForward || isBackward
  })
}

/** Filters mention ids down to users that are not blocked relative to sender. */
export async function filterMentionsByBlockState(
  supabase: SupabaseClient,
  senderUserId: string,
  mentions: string[]
): Promise<{ allowed: string[]; blocked: string[] }> {
  const uniqueMentions = Array.from(new Set(mentions.filter(Boolean))).filter((id) => id !== senderUserId)
  if (uniqueMentions.length === 0) return { allowed: [], blocked: [] }

  const participantIds = [senderUserId, ...uniqueMentions]
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "blocked")
    .in("requester_id", participantIds)
    .in("addressee_id", participantIds)

  if (error) {
    throw new Error(`Failed to evaluate mention block state: ${error.message}`)
  }

  const blockedSet = new Set<string>()
  for (const row of data ?? []) {
    if (row.requester_id === senderUserId && uniqueMentions.includes(row.addressee_id)) blockedSet.add(row.addressee_id)
    if (row.addressee_id === senderUserId && uniqueMentions.includes(row.requester_id)) blockedSet.add(row.requester_id)
  }

  return {
    allowed: uniqueMentions.filter((id) => !blockedSet.has(id)),
    blocked: uniqueMentions.filter((id) => blockedSet.has(id)),
  }
}
