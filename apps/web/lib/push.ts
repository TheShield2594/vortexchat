import webpush from "web-push"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { resolveNotification } from "@/lib/notification-resolver"
import { isInQuietHours } from "@/lib/quiet-hours"

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
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return // push not configured
    ensureVapid()

    const supabase = await createServerSupabaseClient()

    // Check quiet hours — suppress push if the user is in their scheduled DND window
    const { data: quietPrefs, error: quietError } = await supabase
      .from("user_notification_preferences")
      .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
      .eq("user_id", userId)
      .maybeSingle()

    if (quietError) {
      console.error("Failed to fetch quiet hours preferences:", quietError.message)
      // Continue sending — fail open rather than suppressing notifications
    }

    if (quietPrefs && isInQuietHours(
      quietPrefs.quiet_hours_enabled ?? false,
      quietPrefs.quiet_hours_start ?? "22:00",
      quietPrefs.quiet_hours_end ?? "08:00",
      quietPrefs.quiet_hours_timezone ?? "UTC",
    )) {
      return // suppress during quiet hours
    }

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
        ).catch(async (err: unknown) => {
          const statusCode = (err as { statusCode?: number }).statusCode
          // 410 = subscription expired; clean it up
          if (statusCode === 410 || statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id).catch(() => {
              console.error(`sendPushToUser: failed to remove stale subscription ${sub.id}`)
            })
          } else {
            console.error(`sendPushToUser: push to ${sub.endpoint.slice(0, 50)}… failed`, statusCode ?? err)
          }
        })
      )
    )
  } catch (err) {
    console.error("sendPushToUser: unexpected error", err)
  }
}

/**
 * Send a push notification to all members of a channel except the sender.
 * Respects notification_settings (muted/mentions-only) when channelId + mentionedIds provided.
 */
export async function sendPushToChannel(opts: {
  serverId?: string
  channelId?: string
  threadId?: string
  dmChannelId?: string
  senderName: string
  content: string
  mentionedIds?: string[]
  excludeUserId: string
}): Promise<void> {
  try {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  ensureVapid()

  const { serverId, channelId, threadId, dmChannelId, senderName, content, mentionedIds = [], excludeUserId } = opts
  const mentionedSet = new Set(mentionedIds)
  const supabase = await createServerSupabaseClient()

  let memberIds: string[] = []

  if (dmChannelId) {
    const { data: members } = await supabase
      .from("dm_channel_members")
      .select("user_id")
      .eq("dm_channel_id", dmChannelId)
      .neq("user_id", excludeUserId)
    memberIds = members?.map((m) => m.user_id) ?? []
  } else if (threadId) {
    const { data: members } = await supabase
      .from("thread_members")
      .select("user_id")
      .eq("thread_id", threadId)
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

    // Fetch only relevant notification settings for potential recipients
  const settingsBatches: Array<Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>> = []

  if (threadId) {
    const { data: threadSettings } = await supabase
      .from("notification_settings")
      .select("user_id, mode, server_id, channel_id, thread_id")
      .in("user_id", memberIds)
      .eq("thread_id", threadId)
    settingsBatches.push((threadSettings ?? []) as Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>)
  }

  if (channelId) {
    const { data: channelSettings } = await supabase
      .from("notification_settings")
      .select("user_id, mode, server_id, channel_id, thread_id")
      .in("user_id", memberIds)
      .eq("channel_id", channelId)
    settingsBatches.push((channelSettings ?? []) as Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>)
  }

  if (serverId) {
    const { data: serverSettings } = await supabase
      .from("notification_settings")
      .select("user_id, mode, server_id, channel_id, thread_id")
      .in("user_id", memberIds)
      .eq("server_id", serverId)
    settingsBatches.push((serverSettings ?? []) as Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>)
  }

  const { data: globalSettings } = await supabase
    .from("notification_settings")
    .select("user_id, mode, server_id, channel_id, thread_id")
    .in("user_id", memberIds)
    .is("server_id", null)
    .is("channel_id", null)
    .is("thread_id", null)
  settingsBatches.push((globalSettings ?? []) as Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>)

  const settings = settingsBatches.flat()

  // Fetch global notification type preferences so mention opt-outs are respected
  const { data: globalTypePrefs } = await supabase
    .from("user_notification_preferences")
    .select("user_id, mention_notifications")
    .in("user_id", memberIds)
  const globalTypePrefMap = new Map(
    (globalTypePrefs ?? []).map((p) => [p.user_id, p])
  )

  const payload: PushPayload = {
    title: senderName,
    body: content.length > 100 ? content.slice(0, 97) + "…" : content,
    url: channelId && serverId
      ? `/channels/${serverId}/${channelId}${threadId ? `?thread=${threadId}` : ""}`
      : dmChannelId
      ? `/channels/me/${dmChannelId}`
      : "/channels/me",
    tag: threadId ?? channelId ?? dmChannelId ?? "message",
  }

  await Promise.allSettled(
    memberIds.map((uid) => {
      const eventType = mentionedSet.has(uid) ? "mention" : "message"
      const resolved = resolveNotification(
        uid,
        serverId ?? null,
        channelId ?? null,
        threadId ?? null,
        eventType,
        (settings ?? []) as Array<{ user_id: string; mode: "all" | "mentions" | "muted"; server_id?: string | null; channel_id?: string | null; thread_id?: string | null }>
      )

      if (!resolved.shouldPush) return

      // Respect global mention opt-out even when channel mode allows it
      if (eventType === "mention") {
        const typePrefs = globalTypePrefMap.get(uid)
        if (typePrefs && typePrefs.mention_notifications === false) return
      }

      return sendPushToUser(uid, payload)
    })
  )
  } catch (err) {
    console.error("sendPushToChannel: unexpected error", err)
  }
}
