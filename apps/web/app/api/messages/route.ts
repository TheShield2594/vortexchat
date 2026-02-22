import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { rateLimiter } from "@/lib/rate-limit"
import { sendPushToChannel } from "@/lib/push"
import {
  evaluateAllRules,
  shouldBlockMessage,
  getTimeoutDuration,
  getAlertChannels,
} from "@/lib/automod"
import type { AutoModRuleWithParsed } from "@/types/database"

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get("channelId")
  const before = searchParams.get("before")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 })
  }

  let query = supabase
    .from("messages")
    .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt("created_at", before)
  }

  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((messages ?? []).reverse())
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // --- Rate limit: max 5 messages per 10 seconds per user ---
  const rl = rateLimiter.check(`msg:${user.id}`, { limit: 5, windowMs: 10_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You are sending messages too fast. Slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  let body: {
    channelId: string
    content?: string
    replyToId?: string
    mentions?: string[]
    mentionEveryone?: boolean
    attachments?: Array<{
      url: string
      filename: string
      size: number
      content_type: string
      width?: number
      height?: number
    }>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { channelId, content, replyToId, mentions = [], mentionEveryone = false, attachments = [] } = body

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })
  if (!content?.trim() && attachments.length === 0) {
    return NextResponse.json({ error: "Message must have content or attachments" }, { status: 400 })
  }

  // --- Fetch channel for slowmode check and server context ---
  const { data: channel } = await supabase
    .from("channels")
    .select("slowmode_delay, server_id")
    .eq("id", channelId)
    .single()

  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  const serverId: string | null = channel.server_id ?? null

  // --- Screening check: if server has screening enabled, the member must have accepted ---
  if (serverId) {
    const { data: server } = await supabase
      .from("servers")
      .select("screening_enabled")
      .eq("id", serverId)
      .single()

    if (server?.screening_enabled) {
      const { data: screeningPassed } = await supabase
        .from("member_screening")
        .select("accepted_at")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (!screeningPassed) {
        return NextResponse.json(
          { error: "You must accept the server rules before sending messages.", code: "SCREENING_REQUIRED" },
          { status: 403 }
        )
      }
    }
  }

  // --- Timeout check: timed-out members cannot send messages ---
  if (serverId) {
    const { data: timeout } = await supabase
      .from("member_timeouts")
      .select("timed_out_until")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (timeout && new Date(timeout.timed_out_until) > new Date()) {
      return NextResponse.json(
        {
          error: `You are timed out until ${new Date(timeout.timed_out_until).toISOString()}.`,
          code: "TIMED_OUT",
          until: timeout.timed_out_until,
        },
        { status: 403 }
      )
    }
  }

  // --- Slowmode: check time since last message from this user in this channel ---
  if (channel.slowmode_delay > 0) {
    const { data: lastMsg } = await supabase
      .from("messages")
      .select("created_at")
      .eq("channel_id", channelId)
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (lastMsg) {
      const elapsedMs = Date.now() - new Date(lastMsg.created_at).getTime()
      const cooldownMs = channel.slowmode_delay * 1000
      if (elapsedMs < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsedMs) / 1000)
        return NextResponse.json(
          { error: `Slowmode: wait ${retryAfter}s before sending again.` },
          { status: 429, headers: { "Retry-After": String(retryAfter) } }
        )
      }
    }
  }

  // --- AutoMod evaluation (only for server channels) ---
  if (serverId && content?.trim()) {
    const { data: rawRules } = await supabase
      .from("automod_rules")
      .select("*")
      .eq("server_id", serverId)
      .eq("enabled", true)

    if (rawRules?.length) {
      const rules = rawRules as unknown as AutoModRuleWithParsed[]
      const violations = evaluateAllRules(rules, content.trim(), mentions)

      if (violations.length > 0) {
        // Always log first violation to audit trail
        await supabase.from("audit_logs").insert({
          server_id: serverId,
          actor_id: user.id,
          action: "automod_block",
          target_id: user.id,
          target_type: "user",
          changes: {
            channel_id: channelId,
            violations: violations.map((v) => ({ rule_id: v.rule_id, rule_name: v.rule_name, reason: v.reason })),
          },
        })

        // Apply timeout if any rule demands it
        const timeoutDuration = getTimeoutDuration(violations)
        if (timeoutDuration) {
          const until = new Date(Date.now() + timeoutDuration * 1000).toISOString()
          await supabase.from("member_timeouts").upsert(
            {
              server_id: serverId,
              user_id: user.id,
              timed_out_until: until,
              moderator_id: null,
              reason: `AutoMod: ${violations[0].reason}`,
              created_at: new Date().toISOString(),
            },
            { onConflict: "server_id,user_id" }
          )

          await supabase.from("audit_logs").insert({
            server_id: serverId,
            actor_id: null,
            action: "automod_timeout",
            target_id: user.id,
            target_type: "user",
            changes: { duration_seconds: timeoutDuration, reason: violations[0].reason },
          })
        }

        // Send alerts to mod channels (fire-and-forget)
        const alertChannels = getAlertChannels(violations)
        for (const alertChannelId of alertChannels) {
          Promise.resolve(
            supabase
              .from("messages")
              .insert({
                channel_id: alertChannelId,
                author_id: user.id,
                content: `⚠️ AutoMod flagged a message from <@${user.id}>: ${violations[0].reason}`,
                mentions: [],
                mention_everyone: false,
              })
              .then(() => {
                void supabase.from("audit_logs").insert({
                  server_id: serverId,
                  actor_id: null,
                  action: "automod_alert",
                  target_id: user.id,
                  target_type: "user",
                  changes: { channel_id: alertChannelId, reason: violations[0].reason },
                })
              })
          ).catch(() => {})
        }

        // Block the message if any rule says to
        if (shouldBlockMessage(violations)) {
          return NextResponse.json(
            {
              error: "Your message was blocked by AutoMod.",
              code: "AUTOMOD_BLOCKED",
              reason: violations[0].reason,
            },
            { status: 403 }
          )
        }
      }
    }
  }

  // --- Insert message ---
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      author_id: user.id,
      content: content?.trim() || null,
      reply_to_id: replyToId || null,
      mentions,
      mention_everyone: mentionEveryone,
    })
    .select(`*, author:users(*), attachments(*), reactions(*)`)
    .single()

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

  // --- Insert attachments ---
  if (attachments.length > 0 && message) {
    await supabase.from("attachments").insert(
      attachments.map((a) => ({ ...a, message_id: message.id }))
    )
  }

  // --- Send push notifications (fire-and-forget) ---
  const senderName = (message as any)?.author?.display_name || (message as any)?.author?.username || "Someone"
  sendPushToChannel({
    serverId: channel.server_id,
    channelId,
    senderName,
    content: content?.trim() ?? "Sent an attachment",
    mentionedIds: mentions,
    excludeUserId: user.id,
  }).catch(() => {})

  return NextResponse.json(message, { status: 201 })
}
