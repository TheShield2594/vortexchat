// ── Notification preferences ────────────────────────────────────────────────

/** Shape of user notification preferences stored in user_notification_preferences. */
export interface UserNotificationPreferences {
  mention_notifications: boolean
  reply_notifications: boolean
  friend_request_notifications: boolean
  server_invite_notifications: boolean
  system_notifications: boolean
  sound_enabled: boolean
  notification_volume: number
  suppress_everyone: boolean
  suppress_role_mentions: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  quiet_hours_timezone: string
  push_notifications: boolean
  show_message_preview: boolean
  show_unread_badge: boolean
}

// ── App marketplace curation ────────────────────────────────────────────────

/** A curated app within a discovery section. */
export interface CuratedApp {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  trust_badge: "verified" | "partner" | "internal" | null
  average_rating: number
  review_count: number
  icon_url: string | null
}

/** A curated section on the app discover page (Featured, Trending, Staff Picks). */
export interface CuratedSection {
  id: string
  slug: string
  title: string
  description: string | null
  apps: CuratedApp[]
}
