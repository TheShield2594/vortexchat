import type { SupabaseClient } from "@supabase/supabase-js"

/** Returns true when either participant has blocked the other. */
export async function isBlockedBetweenUsers(
  supabase: SupabaseClient,
  leftUserId: string,
  rightUserId: string
): Promise<boolean> {
  if (!leftUserId || !rightUserId || leftUserId === rightUserId) return false

  const { data } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "blocked")
    .or(
      `and(requester_id.eq.${leftUserId},addressee_id.eq.${rightUserId}),and(requester_id.eq.${rightUserId},addressee_id.eq.${leftUserId})`
    )
    .limit(1)

  return Boolean(data && data.length > 0)
}

/** Filters mention ids down to users that are not blocked relative to sender. */
export async function filterMentionsByBlockState(
  supabase: SupabaseClient,
  senderUserId: string,
  mentions: string[]
): Promise<{ allowed: string[]; blocked: string[] }> {
  const uniqueMentions = Array.from(new Set(mentions.filter(Boolean))).filter((id) => id !== senderUserId)
  if (uniqueMentions.length === 0) return { allowed: [], blocked: [] }

  const { data } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "blocked")
    .or(
      `and(requester_id.eq.${senderUserId},addressee_id.in.(${uniqueMentions.join(",")})),and(addressee_id.eq.${senderUserId},requester_id.in.(${uniqueMentions.join(",")}))`
    )

  const blockedSet = new Set<string>()
  for (const row of data ?? []) {
    if (row.requester_id === senderUserId) blockedSet.add(row.addressee_id)
    if (row.addressee_id === senderUserId) blockedSet.add(row.requester_id)
  }

  return {
    allowed: uniqueMentions.filter((id) => !blockedSet.has(id)),
    blocked: uniqueMentions.filter((id) => blockedSet.has(id)),
  }
}
