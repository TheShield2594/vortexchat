import { NextResponse } from "next/server"
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server"
import { rateLimiter } from "@/lib/rate-limit"
import { sendPushToChannel } from "@/lib/push"
import {
  evaluateAllRules,
  shouldBlockMessage,
  shouldQuarantineMessage,
  getTimeoutDuration,
  getAlertChannels,
} from "@/lib/automod"
import { SYSTEM_BOT_ID } from "@/lib/server-auth"
import type { AutoModRuleWithParsed } from "@/types/database"
import { getChannelPermissions, hasPermission } from "@/lib/permissions"
import { filterMentionsByBlockState } from "@/lib/blocking"
import { validateAttachments } from "@/lib/attachment-validation"

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get("channelId")
  const before = searchParams.get("before")
  const around = searchParams.get("around")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 })
  }

  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id, server_id")
    .eq("id", channelId)
    .single()

  if (channelError || !channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  if (channel.server_id) {
    const { isAdmin, permissions } = await getChannelPermissions(supabase, channel.server_id, channel.id, user.id)
    if (!isAdmin && !hasPermission(permissions, "VIEW_CHANNELS")) {
      return NextResponse.json({ error: "Missing VIEW_CHANNELS permission" }, { status: 403 })
    }
  }

  if (around) {
    const { data: target } = await supabase
      .from("messages")
      .select("id, channel_id, created_at")
      .eq("id", around)
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    const sideLimit = Math.max(1, Math.min(limit, 60))
    const [{ data: beforeRows, error: beforeError }, { data: afterRows, error: afterError }] = await Promise.all([
      supabase
        .from("messages")
        .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .lt("created_at", target.created_at)
        .order("created_at", { ascending: false })
        .limit(sideLimit + 1),
      supabase
        .from("messages")
        .select(`*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`)
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .gte("created_at", target.created_at)
        .order("created_at", { ascending: true })
        .limit(sideLimit + 1),
    ])

    if (beforeError || afterError) {
      return NextResponse.json({ error: beforeError?.message ?? afterError?.message ?? "Failed to load message context" }, { status: 500 })
    }

    const hasMoreBefore = (beforeRows?.length ?? 0) > sideLimit
    const hasMoreAfter = (afterRows?.length ?? 0) > sideLimit
    const trimmedBefore = (beforeRows ?? []).slice(0, sideLimit).reverse()
    const trimmedAfter = (afterRows ?? []).slice(0, sideLimit)

    const deduped = [...trimmedBefore, ...trimmedAfter].filter((message, index, all) =>
      all.findIndex((candidate) => candidate.id === message.id) === index
    )

    return NextResponse.json({
      messages: deduped,
      hasMoreBefore,
      hasMoreAfter,
    })
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

  const { channelId, content, replyToId, mentions: rawMentions, mentionEveryone = false, attachments: rawAttachments } = body
  const mentions = rawMentions ?? []
  const attachments = rawAttachments ?? []

  if (!Array.isArray(mentions)) return NextResponse.json({ error: "Invalid mentions" }, { status: 400 })
  if (!Array.isArray(attachments)) return NextResponse.json({ error: "Invalid attachments" }, { status: 400 })
  if (!mentions.every((mention) => typeof mention === "string" && mention.trim().length > 0)) {
    return NextResponse.json({ error: "Invalid mention elements" }, { status: 400 })
  }
  if (!attachments.every((attachment) => {
    if (!attachment || typeof attachment !== "object") return false
    const candidate = attachment as Record<string, unknown>
    return (
      typeof candidate.url === "string"
      && typeof candidate.filename === "string"
      && typeof candidate.size === "number"
      && typeof candidate.content_type === "string"
    )
  })) {
    return NextResponse.json({ error: "Invalid attachment elements" }, { status: 400 })
  }

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 })
  if (!content?.trim() && attachments.length === 0) {
    return NextResponse.json({ error: "Message must have content or attachments" }, { status: 400 })
  }

  const attachmentValidation = validateAttachments(attachments)
  if (!attachmentValidation.valid) {
    return NextResponse.json({ error: attachmentValidation.error }, { status: 400 })
  }

  let safeMentions: string[]
  try {
    const filteredMentions = await filterMentionsByBlockState(supabase as any, user.id, mentions)
    safeMentions = filteredMentions.allowed
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate mentions" },
      { status: 400 }
    )
  }

  // --- Fetch channel for server context and slowmode check ---
  const { data: channel } = await supabase
    .from("channels")
    .select("slowmode_delay, server_id")
    .eq("id", channelId)
    .single()

  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  const serverId: string | null = channel.server_id ?? null

  if (serverId) {
    // --- Permission checks ---
    // screeningEnabled comes from the same servers row getMemberPermissions already fetches,
    // so no separate servers query is needed below.
    const { isAdmin, permissions, screeningEnabled } = await getChannelPermissions(supabase, serverId, channelId, user.id)

    if (!isAdmin && !hasPermission(permissions, "SEND_MESSAGES")) {
      return NextResponse.json({ error: "Missing SEND_MESSAGES permission" }, { status: 403 })
    }

    // @everyone / @here mentions require the MENTION_EVERYONE permission
    if (mentionEveryone && !isAdmin && !hasPermission(permissions, "MENTION_EVERYONE")) {
      return NextResponse.json({ error: "Missing MENTION_EVERYONE permission" }, { status: 403 })
    }

    // --- Member screening and timeout queries concurrently ---
    const [screeningResult, timeoutResult] = await Promise.all([
      supabase
        .from("member_screening")
        .select("accepted_at")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("member_timeouts")
        .select("timed_out_until")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

    const screeningPassed = screeningResult.data
    const timeout = timeoutResult.data

    if (screeningEnabled && !screeningPassed) {
      return NextResponse.json(
        { error: "You must accept the server rules before sending messages.", code: "SCREENING_REQUIRED" },
        { status: 403 }
      )
    }

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
    const [{ data: automodSettingsRaw }, { data: memberRoles }] = await Promise.all([
      supabase
        .from("servers")
        .select("automod_dry_run, automod_emergency_disable")
        .eq("id", serverId)
        .maybeSingle(),
      supabase
        .from("member_roles")
        .select("role_id")
        .eq("server_id", serverId)
        .eq("user_id", user.id),
    ])

    const automodSettings = (automodSettingsRaw ?? {}) as { automod_dry_run?: boolean; automod_emergency_disable?: boolean }

    if (automodSettings.automod_emergency_disable) {
      // Emergency kill switch: bypass all runtime checks.
    } else {
    const { data: rawRules } = await supabase
      .from("automod_rules")
      .select("id, name, trigger_type, config, conditions, actions, enabled, priority")
      .eq("server_id", serverId)
      .eq("enabled", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })

    if (rawRules?.length) {
      const earliestWindowSeconds = rawRules.reduce((acc, rule) => {
        const cfg = rule.config as Record<string, unknown>
        const windowSeconds = typeof cfg.window_seconds === "number" ? cfg.window_seconds : null
        if (!windowSeconds) return acc
        if (acc === null) return windowSeconds
        return Math.max(acc, windowSeconds)
      }, null as number | null)

      let recentMessageCount = 0
      if (earliestWindowSeconds) {
        const since = new Date(Date.now() - earliestWindowSeconds * 1000).toISOString()
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channelId)
          .eq("author_id", user.id)
          .gte("created_at", since)
        recentMessageCount = count ?? 0
      }

      const accountAgeMinutes = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 60_000)

      // Validate and normalize each rule before evaluation to avoid crashes on
      // malformed JSONB config/actions stored in the database.
      const rules: AutoModRuleWithParsed[] = rawRules.reduce<AutoModRuleWithParsed[]>((acc, r) => {
        if (!r || typeof r !== "object") return acc
        const config =
          r.config && typeof r.config === "object" && !Array.isArray(r.config) ? r.config : {}
        const conditions =
          r.conditions && typeof r.conditions === "object" && !Array.isArray(r.conditions)
            ? r.conditions
            : {}
        const actions = Array.isArray(r.actions)
          ? r.actions.filter((a: any) => a && typeof a === "object" && typeof a.type === "string")
          : []
        acc.push({ ...r, config, conditions, actions } as unknown as AutoModRuleWithParsed)
        return acc
      }, [])

      const violations = evaluateAllRules(rules, content.trim(), mentions, {
        channelId,
        memberRoleIds: (memberRoles ?? []).map((r) => r.role_id),
        accountAgeMinutes,
        recentMessageCount,
      })

      if (violations.length > 0) {
        // Determine whether the message will be blocked before writing the audit
        // log so the action name accurately reflects what happened.
        const blocked = shouldBlockMessage(violations)
        const quarantined = shouldQuarantineMessage(violations)
        const dryRun = Boolean(automodSettings?.automod_dry_run)

        await supabase.from("audit_logs").insert({
          server_id: serverId,
          actor_id: user.id,
          action: dryRun ? "automod_dry_run" : blocked ? "automod_block" : "automod_action",
          target_id: user.id,
          target_type: "user",
          changes: {
            channel_id: channelId,
            blocked,
            quarantined,
            dry_run: dryRun,
            violations: violations.map((v) => ({ rule_id: v.rule_id, rule_name: v.rule_name, reason: v.reason })),
          },
        })

        for (const violation of violations) {
          await (supabase as any).rpc("increment_automod_rule_hit", { p_rule_id: violation.rule_id })
        }

        // Apply timeout if any rule demands it
        const timeoutDuration = getTimeoutDuration(violations)
        if (timeoutDuration && !dryRun) {
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

        // Send alerts to mod channels (fire-and-forget).
        // Uses the service role client so the message is attributed to the
        // system bot (SYSTEM_BOT_ID) rather than the violating user, bypassing
        // the messages RLS policy that would otherwise reject author_id ≠ uid().
        const alertChannels = getAlertChannels(violations)
        if (alertChannels.length > 0 && !dryRun) {
          // createServiceRoleClient is async; resolve once, then iterate.
          createServiceRoleClient()
            .then((serviceSupabase) => {
              for (const alertChannelId of alertChannels) {
                Promise.resolve(
                  serviceSupabase
                    .from("messages")
                    .insert({
                      channel_id: alertChannelId,
                      author_id: SYSTEM_BOT_ID,
                      content: `⚠️ AutoMod flagged a message from <@${user.id}>: ${violations[0].reason}`,
                      mentions: [],
                      mention_everyone: false,
                    })
                    .then(() =>
                      supabase.from("audit_logs").insert({
                        server_id: serverId,
                        actor_id: null,
                        action: "automod_alert",
                        target_id: user.id,
                        target_type: "user",
                        changes: { channel_id: alertChannelId, reason: violations[0].reason },
                      })
                    )
                ).catch(() => {})
              }
            })
            .catch(() => {})
        }

        // Block the message if any rule says to
        if (!dryRun && (blocked || quarantined)) {
          return NextResponse.json(
            {
              error: blocked ? "Your message was blocked by AutoMod." : "Your message was quarantined for moderator review.",
              code: blocked ? "AUTOMOD_BLOCKED" : "AUTOMOD_QUARANTINED",
              reason: violations[0].reason,
            },
            { status: 403 }
          )
        }
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
      mentions: safeMentions,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderName = (message as any)?.author?.display_name || (message as any)?.author?.username || "Someone"

  // --- Insert in-app inbox notifications for mentions/replies (fire-and-forget) ---
  Promise.resolve()
    .then(async () => {
      const MAX_NOTIFICATION_BODY_LENGTH = 512
      const serviceSupabase = await createServiceRoleClient()
      const recipientIds = new Set<string>()

      for (const mentionedUserId of safeMentions) {
        if (mentionedUserId && mentionedUserId !== user.id) {
          recipientIds.add(mentionedUserId)
        }
      }

      let replyAuthorId: string | null = null
      if (replyToId) {
        const { data: repliedMessage } = await serviceSupabase
          .from("messages")
          .select("author_id")
          .eq("id", replyToId)
          .maybeSingle()
        replyAuthorId = repliedMessage?.author_id ?? null
      }

      if (replyAuthorId && replyAuthorId !== user.id) {
        recipientIds.add(replyAuthorId)
      }

      if (recipientIds.size === 0) return

      const bodyPreview = (content?.trim() || "Sent an attachment").slice(0, MAX_NOTIFICATION_BODY_LENGTH)
      const rows = Array.from(recipientIds).map((recipientId) => {
        const isMentionTarget = safeMentions.includes(recipientId)

        return {
          user_id: recipientId,
          type: isMentionTarget ? "mention" as const : "reply" as const,
          title: isMentionTarget
            ? `${senderName} mentioned you`
            : `${senderName} replied to your message`,
          body: bodyPreview,
          server_id: channel.server_id,
          channel_id: channelId,
          message_id: message.id,
        }
      })

      await serviceSupabase.from("notifications").insert(rows)
    })
    .catch(() => {})

  sendPushToChannel({
    serverId: channel.server_id,
    channelId,
    senderName,
    content: content?.trim() ?? "Sent an attachment",
    mentionedIds: safeMentions,
    excludeUserId: user.id,
  }).catch(() => {})

  return NextResponse.json(message, { status: 201 })
}
