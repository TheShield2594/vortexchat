import webpush from "web-push"
import { createServerSupabaseClient } from "@/lib/supabase/server"

// VAPID keys — set these env vars (generate once with: npx web-push generate-vapid-keys)
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ""
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@vortexchat.app"

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured || !VAPID_PUBLIC || !VAPID_PRIVATE) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
}

/**
 * Send a push notification to all subscriptions for a given user.
 * Silently removes stale subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return // push not configured
  ensureVapid()

  const supabase = createServerSupabaseClient()
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)

  if (!subs?.length) return

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 }
      ).catch(async (err: any) => {
        // 410 = subscription expired; clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id)
        }
      })
    )
  )
}

/**
 * Send a push notification to all members of a channel except the sender.
 * Respects notification_settings (muted/mentions-only) when channelId + mentionedIds provided.
 */
export async function sendPushToChannel(opts: {
  serverId?: string
  channelId?: string
  dmChannelId?: string
  senderName: string
  content: string
  mentionedIds?: string[]
  excludeUserId: string
}): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return

  const { serverId, channelId, dmChannelId, senderName, content, mentionedIds = [], excludeUserId } = opts
  const supabase = createServerSupabaseClient()

  let memberIds: string[] = []

  if (dmChannelId) {
    const { data: members } = await supabase
      .from("dm_channel_members")
      .select("user_id")
      .eq("dm_channel_id", dmChannelId)
      .neq("user_id", excludeUserId)
    memberIds = members?.map((m) => m.user_id) ?? []
  } else if (serverId && channelId) {
    const { data: members } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .neq("user_id", excludeUserId)
    memberIds = members?.map((m) => m.user_id) ?? []
  }

  if (!memberIds.length) return

  // Fetch notification settings for all potential recipients
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, mode, server_id, channel_id")
    .in("user_id", memberIds)

  const settingsMap: Record<string, string> = {}
  for (const s of settings ?? []) {
    const key = s.user_id
    // Channel-level overrides server-level
    if (channelId && s.channel_id === channelId) settingsMap[key] = s.mode
    else if (serverId && s.server_id === serverId && !settingsMap[key]) settingsMap[key] = s.mode
  }

  const payload: PushPayload = {
    title: senderName,
    body: content.length > 100 ? content.slice(0, 97) + "…" : content,
    url: channelId && serverId
      ? `/channels/${serverId}/${channelId}`
      : dmChannelId
      ? `/channels/@me/${dmChannelId}`
      : "/channels/@me",
    tag: channelId ?? dmChannelId ?? "message",
  }

  await Promise.allSettled(
    memberIds.map((uid) => {
      const mode = settingsMap[uid] ?? "all"
      if (mode === "muted") return
      if (mode === "mentions" && !mentionedIds.includes(uid)) return
      return sendPushToUser(uid, payload)
    })
  )
}
