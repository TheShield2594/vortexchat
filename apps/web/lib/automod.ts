/**
 * AutoMod engine — evaluates configured rules against incoming messages.
 *
 * Rules are fetched once per server then applied in-process, so the critical
 * path for message delivery stays fast (one extra DB query to fetch rules).
 */

import type {
  AutoModRuleWithParsed,
  AutoModAction,
  KeywordFilterConfig,
  MentionSpamConfig,
  LinkSpamConfig,
} from "@/types/database"

// ── Regex helpers ────────────────────────────────────────────────────────────

// Third alternative uses an explicit TLD whitelist to avoid matching benign
// word pairs like "hello.world" that the previous bare /\b[a-z0-9-]+\.[a-z]{2,}/
// pattern would incorrectly flag as links.
const URL_RE =
  /https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-z0-9-]+\.)+(?:com|org|net|io|edu|gov|co|uk|de|fr|jp|au|ca|us|app|dev|ai|tech|info|biz)(?:\/[^\s]*)?/gi

function countLinks(text: string): number {
  return (text.match(URL_RE) ?? []).length
}

// Counts @mentions in the raw message text (e.g. "<@uuid>") as well as
// the pre-resolved `mentions` array length coming from the client.
function countMentions(text: string, mentions: string[]): number {
  const inlineCount = (text.match(/<@[0-9a-f-]+>/gi) ?? []).length
  return Math.max(inlineCount, mentions.length)
}

// ── Rule evaluators ──────────────────────────────────────────────────────────

export interface RuleViolation {
  rule_id: string
  rule_name: string
  trigger_type: string
  actions: AutoModAction[]
  /** Human-readable reason logged in the audit trail */
  reason: string
}

/**
 * Test a single rule against the message content/mentions.
 * Returns a RuleViolation if the rule is triggered, otherwise null.
 */
export function evaluateRule(
  rule: AutoModRuleWithParsed,
  content: string,
  mentions: string[]
): RuleViolation | null {
  if (!rule.enabled) return null

  const lower = content.toLowerCase()

  switch (rule.trigger_type) {
    case "keyword_filter": {
      const cfg = rule.config as KeywordFilterConfig
      const hitKeyword = cfg.keywords?.find((kw) =>
        lower.includes(kw.toLowerCase())
      )
      if (hitKeyword) {
        return {
          rule_id: rule.id,
          rule_name: rule.name,
          trigger_type: rule.trigger_type,
          actions: rule.actions,
          reason: `Blocked keyword: "${hitKeyword}"`,
        }
      }
      // Optional regex patterns — enforce a max length and a wall-clock budget
      // to limit ReDoS risk from complex user-supplied patterns.
      const MAX_PATTERN_LENGTH = 200
      const REGEX_BUDGET_MS = 50
      if (cfg.regex_patterns?.length) {
        const deadline = Date.now() + REGEX_BUDGET_MS
        for (const pattern of cfg.regex_patterns) {
          if (Date.now() > deadline) break // time budget exhausted; skip remaining
          if (typeof pattern !== "string" || pattern.length > MAX_PATTERN_LENGTH) continue
          try {
            const re = new RegExp(pattern, "i")
            if (re.test(content)) {
              return {
                rule_id: rule.id,
                rule_name: rule.name,
                trigger_type: rule.trigger_type,
                actions: rule.actions,
                reason: `Matched regex pattern: ${pattern}`,
              }
            }
          } catch {
            // Ignore invalid patterns
          }
        }
      }
      return null
    }

    case "mention_spam": {
      const cfg = rule.config as MentionSpamConfig
      const count = countMentions(content, mentions)
      if (count >= (cfg.mention_threshold ?? 5)) {
        return {
          rule_id: rule.id,
          rule_name: rule.name,
          trigger_type: rule.trigger_type,
          actions: rule.actions,
          reason: `Mention spam: ${count} mentions (threshold ${cfg.mention_threshold})`,
        }
      }
      return null
    }

    case "link_spam": {
      const cfg = rule.config as LinkSpamConfig
      const count = countLinks(content)
      if (count >= (cfg.link_threshold ?? 3)) {
        return {
          rule_id: rule.id,
          rule_name: rule.name,
          trigger_type: rule.trigger_type,
          actions: rule.actions,
          reason: `Link spam: ${count} links (threshold ${cfg.link_threshold})`,
        }
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Evaluate ALL enabled rules for a server against the given message.
 * Returns the list of triggered violations in rule order.
 */
export function evaluateAllRules(
  rules: AutoModRuleWithParsed[],
  content: string,
  mentions: string[] = []
): RuleViolation[] {
  if (!content) return []
  const violations: RuleViolation[] = []
  for (const rule of rules) {
    const v = evaluateRule(rule, content, mentions)
    if (v) violations.push(v)
  }
  return violations
}

/**
 * Determine if any violation contains a `block_message` action.
 * Used by the message POST handler to decide whether to reject the message.
 */
export function shouldBlockMessage(violations: RuleViolation[]): boolean {
  return violations.some((v) =>
    v.actions.some((a) => a.type === "block_message")
  )
}

/**
 * Collect all `timeout_member` actions from the violations, returning the
 * maximum duration so we apply the harshest penalty.
 */
export function getTimeoutDuration(violations: RuleViolation[]): number | null {
  let max = 0
  for (const v of violations) {
    for (const a of v.actions) {
      if (a.type === "timeout_member") {
        const duration = a.duration_seconds ?? 60
        if (duration > max) max = duration
      }
    }
  }
  return max > 0 ? max : null
}

/**
 * Collect all `alert_channel` actions from the violations.
 */
export function getAlertChannels(violations: RuleViolation[]): string[] {
  const channels = new Set<string>()
  for (const v of violations) {
    for (const a of v.actions) {
      if (a.type === "alert_channel" && a.channel_id) {
        channels.add(a.channel_id)
      }
    }
  }
  return Array.from(channels)
}

// ─── Rule input validation (used by the automod API route handlers) ──────────

export const VALID_TRIGGER_TYPES = ["keyword_filter", "mention_spam", "link_spam"] as const
export const VALID_ACTION_TYPES = ["block_message", "timeout_member", "alert_channel"] as const

/**
 * Validates the config and actions for an automod rule.
 * Returns an error string if invalid, or null if valid.
 */
// Detects ReDoS-prone nested quantifiers such as (a+)+, (.*)*, ([a-z]+\s)+.
// Heuristic: a group whose body contains a quantifier is itself quantified.
const UNSAFE_REGEX_RE = /\([^)]*[+*?][^)]*\)[+*?{]/

export function validateConfigAndActions(
  trigger_type: string,
  config: unknown,
  actions: unknown
): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "config must be a non-null object"
  }
  const cfg = config as Record<string, unknown>

  if (trigger_type === "keyword_filter") {
    if (!Array.isArray(cfg.keywords) || cfg.keywords.some((k) => typeof k !== "string")) {
      return "keyword_filter config must have keywords: string[]"
    }
    if (cfg.keywords.length === 0) {
      return "keyword_filter config.keywords must not be empty"
    }
    if (cfg.regex_patterns !== undefined) {
      if (!Array.isArray(cfg.regex_patterns) || cfg.regex_patterns.some((p) => typeof p !== "string")) {
        return "keyword_filter config.regex_patterns must be string[] if provided"
      }
      for (const pattern of cfg.regex_patterns as string[]) {
        if (UNSAFE_REGEX_RE.test(pattern)) {
          return `regex pattern contains unsafe nested quantifiers and was rejected: ${pattern}`
        }
      }
    }
  } else if (trigger_type === "mention_spam") {
    if (typeof cfg.mention_threshold !== "number") {
      return "mention_spam config must have mention_threshold: number"
    }
    if (cfg.mention_threshold <= 0) {
      return "mention_spam config.mention_threshold must be greater than 0"
    }
  } else if (trigger_type === "link_spam") {
    if (typeof cfg.link_threshold !== "number") {
      return "link_spam config must have link_threshold: number"
    }
    if (cfg.link_threshold <= 0) {
      return "link_spam config.link_threshold must be greater than 0"
    }
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    return "actions must be a non-empty array"
  }
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return "each action must be an object"
    }
    const a = action as Record<string, unknown>
    if (!(VALID_ACTION_TYPES as readonly string[]).includes(a.type as string)) {
      return `action.type must be one of: ${VALID_ACTION_TYPES.join(", ")}`
    }
    if (a.type === "alert_channel" && (typeof a.channel_id !== "string" || a.channel_id === "")) {
      return "alert_channel action must include a non-empty channel_id"
    }
  }

  return null
}
