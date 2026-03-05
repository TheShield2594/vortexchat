export interface LoginFingerprint {
  userId: string
  ipAddress: string | null
  userAgent: string | null
  locationHint: string | null
}

export interface PreviousLoginFingerprint {
  ipAddress: string | null
  userAgent: string | null
  locationHint: string | null
}

function subnet(ip: string | null) {
  if (!ip) return null
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":")
  const p = ip.split(".")
  if (p.length !== 4) return ip
  return `${p[0]}.${p[1]}.${p[2]}`
}

export function computeLoginRisk(current: LoginFingerprint, previous: PreviousLoginFingerprint | null) {
  if (!previous) {
    return { riskScore: 25, suspicious: false, reasons: ["first_seen_login"] }
  }

  const reasons: string[] = []
  let score = 0

  if (subnet(current.ipAddress) && subnet(current.ipAddress) !== subnet(previous.ipAddress)) {
    score += 45
    reasons.push("new_ip_subnet")
  }

  if (current.locationHint && previous.locationHint && current.locationHint !== previous.locationHint) {
    score += 25
    reasons.push("new_location")
  }

  if (current.userAgent && previous.userAgent && current.userAgent !== previous.userAgent) {
    score += 30
    reasons.push("new_device_signature")
  }

  return { riskScore: Math.min(score, 100), suspicious: score >= 60, reasons }
}
