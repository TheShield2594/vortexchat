export const APPEAL_STATUSES = ["submitted", "reviewing", "approved", "denied", "closed"] as const
export type AppealStatus = (typeof APPEAL_STATUSES)[number]

const allowedTransitions: Record<AppealStatus, AppealStatus[]> = {
  submitted: ["reviewing", "closed"],
  reviewing: ["approved", "denied", "closed"],
  approved: ["closed"],
  denied: ["closed"],
  closed: [],
}

export function isValidAppealStatus(status: string): status is AppealStatus {
  return APPEAL_STATUSES.includes(status as AppealStatus)
}

export function isValidAppealTransition(from: AppealStatus, to: AppealStatus) {
  return allowedTransitions[from].includes(to)
}

export function computeAntiAbuseScore(input: {
  statement: string
  evidenceAttachments: string[]
  recentAppealCount: number
}) {
  let score = 0
  if (input.statement.length < 80) score += 15
  if (input.statement.length > 2000) score += 10
  if (input.evidenceAttachments.length > 8) score += 25
  if (input.recentAppealCount > 2) score += 30
  return Math.min(100, score)
}

export function sanitizeEvidenceAttachments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 10)
}
