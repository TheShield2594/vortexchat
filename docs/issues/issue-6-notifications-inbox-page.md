# Build full-screen Notifications inbox page for mobile

## Problem

Notifications currently exist only as a dropdown panel from the `NotificationBell` icon in channel headers. On mobile:

1. The bell icon is small and easy to miss in the channel header
2. The dropdown panel is awkward on mobile viewports (fixed-width, positioned relative to header)
3. There's no way to access notifications without being in a channel first
4. No bottom nav tab for notifications

Discord's mobile app has a dedicated "Notifications" tab showing all mentions, replies, friend requests, and server invites in a scrollable full-screen inbox with filters.

## What Already Exists

The notification infrastructure is complete:

| Component | Status |
|-----------|--------|
| `NotificationBell` component with full CRUD | Done |
| Real-time Supabase subscription for new notifications | Done |
| Notification types: mention, reply, friend_request, server_invite, system | Done |
| Mark as read (individual + bulk) | Done |
| Click-to-navigate (jumps to source message/channel) | Done |
| Notification sound | Done |
| Notification preferences page (`/settings/notifications`) | Done |
| Unread count badge | Done |

The `NotificationBell` already supports a `variant="sidebar"` mode alongside `variant="icon"`. The rendering logic is reusable.

## Proposed Solution

Create `/channels/notifications` as a full-screen page that reuses the existing notification fetching/rendering logic.

```text
/channels/notifications (mobile):
┌───────────────────────────────────────────────────┐
│ Notifications                    [Mark All Read]  │
├───────────────────────────────────────────────────┤
│ [All] [Mentions] [Replies] [Requests]             │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ Today ───────────────────────────────────────┐ │
│ │ @ alice mentioned you in #general             │ │
│ │   "hey @you check this out"           2m ago  │ │
│ ├───────────────────────────────────────────────┤ │
│ │ ↩ bob replied to you in #dev                  │ │
│ │   "that fix worked, thanks!"          15m ago │ │
│ ├───────────────────────────────────────────────┤ │
│ │ 👤 carol sent you a friend request            │ │
│ │   [Accept] [Decline]                  1h ago  │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ┌─ Yesterday ───────────────────────────────────┐ │
│ │ 📧 Invited to "Gaming Server"                 │ │
│ │   [Accept] [Dismiss]                 18h ago  │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
├───────────────────────────────────────────────────┤
│ [💬 Messages] [📡 Servers] [🔔 Notif] [👤 You]   │
└───────────────────────────────────────────────────┘
```

## Implementation

### 1. New route: `apps/web/app/channels/notifications/page.tsx`

```tsx
import { NotificationInbox } from "@/components/notifications/notification-inbox"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return <NotificationInbox userId={user.id} />
}
```

### 2. New component: `apps/web/components/notifications/notification-inbox.tsx`

Extract and expand the existing `NotificationBell` rendering logic into a full-page component:

- **Filter tabs**: All | Mentions | Replies | Requests (filter by `notification.type`)
- **Grouped by date**: Today, Yesterday, This Week, Older
- **Notification rows**: Reuse existing notification row rendering from `NotificationBell`
- **Inline actions**: Accept/decline for friend requests, accept/dismiss for server invites
- **Navigation**: Tap a mention/reply → navigate to the source message
- **Bulk actions**: "Mark all as read" button in header
- **Empty state**: "You're all caught up!" when no notifications

The data fetching and real-time subscription can be lifted from `NotificationBell` (lines 48-79) into a shared hook:

```tsx
// hooks/use-notifications.ts
export function useNotifications(userId: string) {
  // Extract from NotificationBell: loadNotifications, real-time sub, mark-read, dismiss
}
```

### 3. Update bottom tab bar

Add Notifications to the tab bar (this is part of the broader bottom nav redesign from issues #1/#2):

```tsx
{ href: "/channels/notifications", label: "Notifications", icon: Bell }
```

Show unread count badge on the tab icon using the existing `unreadCount` from the notification hook.

### 4. Keep NotificationBell dropdown for desktop

The existing `NotificationBell` dropdown in channel headers remains for desktop. On desktop, `/channels/notifications` renders the same full-page inbox in the main content area (useful for focused notification management).

## Acceptance Criteria

- [ ] `/channels/notifications` renders a full-screen notification inbox
- [ ] Filter tabs: All, Mentions, Replies, Requests
- [ ] Notifications grouped by date
- [ ] Tap notification → navigate to source message/channel
- [ ] Inline friend request accept/decline
- [ ] Inline server invite accept/dismiss
- [ ] "Mark all as read" button
- [ ] Real-time updates (new notifications appear without refresh)
- [ ] Unread badge on bottom nav tab
- [ ] Empty state when no notifications
- [ ] Desktop: NotificationBell dropdown unchanged

## Priority

**P1** — Required for Discord mobile parity

## Labels

`ux`, `mobile`, `feature`, `notifications`
