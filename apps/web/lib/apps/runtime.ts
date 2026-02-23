export interface AppDefinition {
  id: string
  name: string
  installScopes: string[]
  permissions: string[]
  credentials: Record<string, string>
}

export interface CommandDefinition {
  name: string
  appId: string
  description?: string
  execute: (ctx: RuntimeContext) => Promise<RuntimeResponse> | RuntimeResponse
}

export interface RuntimeContext {
  appId: string
  serverId: string
  actorId: string
  payload?: Record<string, unknown>
}

export interface RuntimeResponse {
  ok: boolean
  message: string
}

export interface EventSubscription {
  appInstallId: string
  appId: string
  eventKey: string
  enabled: boolean
}

export interface RateLimitRule {
  requestsPerMinute: number
}

interface InteractionRecord {
  timestamp: number
}

export class AppInteractionRuntime {
  private commands = new Map<string, CommandDefinition>()
  private subscriptions: EventSubscription[] = []
  private usage = new Map<string, InteractionRecord[]>()

  registerCommand(command: CommandDefinition) {
    const normalized = command.name.trim().toLowerCase()
    this.commands.set(normalized, { ...command, name: normalized })
  }

  subscribeToEvent(subscription: EventSubscription) {
    this.subscriptions = [
      ...this.subscriptions.filter(
        (entry) => !(entry.appInstallId === subscription.appInstallId && entry.eventKey === subscription.eventKey)
      ),
      subscription,
    ]
  }

  getSubscribers(eventKey: string) {
    return this.subscriptions.filter((sub) => sub.eventKey === eventKey && sub.enabled)
  }

  enforceRateLimit(appId: string, rule: RateLimitRule, nowMs = Date.now()) {
    const bucket = this.usage.get(appId) ?? []
    const windowStart = nowMs - 60_000
    const next = bucket.filter((entry) => entry.timestamp >= windowStart)

    if (next.length >= rule.requestsPerMinute) {
      return { allowed: false, remaining: 0 }
    }

    next.push({ timestamp: nowMs })
    this.usage.set(appId, next)

    return {
      allowed: true,
      remaining: Math.max(0, rule.requestsPerMinute - next.length),
    }
  }

  async executeCommand(name: string, context: RuntimeContext, rule?: RateLimitRule) {
    const command = this.commands.get(name.trim().toLowerCase())
    if (!command) {
      return { ok: false, message: `Command ${name} is not registered.` }
    }

    if (command.appId !== context.appId) {
      return { ok: false, message: "Command/app mismatch." }
    }

    if (rule) {
      const rate = this.enforceRateLimit(context.appId, rule)
      if (!rate.allowed) {
        return { ok: false, message: "Rate limit exceeded." }
      }
    }

    return command.execute(context)
  }
}

export function validateInstallPermissions(requested: string[], granted: string[]) {
  return requested.every((permission) => granted.includes(permission))
}

export function redactCredentials(credentials: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(credentials).map(([key]) => [key, "••••••"])
  )
}
