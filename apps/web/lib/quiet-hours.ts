/**
 * Checks whether the current time falls within a user's configured quiet hours.
 * Used by the push notification path to suppress notifications during DND schedule.
 */
export function isInQuietHours(
  enabled: boolean,
  start: string,   // "HH:MM"
  end: string,     // "HH:MM"
  timezone: string  // IANA timezone (e.g. "America/New_York")
): boolean {
  if (!enabled) return false

  let now: Date
  try {
    // Get current time in user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date())
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)
    now = new Date(2000, 0, 1, hour, minute)
  } catch {
    // Invalid timezone — fail open (don't suppress)
    return false
  }

  const [startH, startM] = start.split(":").map(Number)
  const [endH, endM] = end.split(":").map(Number)

  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g., 09:00 → 17:00)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }
  // Overnight range (e.g., 22:00 → 08:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}
