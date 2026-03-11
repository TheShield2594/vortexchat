# Option B: Dedicated "Servers" tab with card-style server list (mobile-first)

## Summary

Add a dedicated "Servers" tab to the mobile bottom nav that opens a full-page server list with rich cards showing unread counts, voice activity, and member counts. This is a mobile-first approach that replaces the hidden hamburger → server icon paradigm.

**Target:** 3 taps from cold start (Servers → Server card → Channel), but the Servers tab can auto-navigate to the last server to achieve 2 taps for returning users.

## Architecture

### New Mobile Screens

```
1. Servers Tab (new page):
┌───────────────────────────────────────────────────┐
│ Servers                                 [search]  │
├───────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐   │
│ │ [🟢] My Server                              │   │
│ │     3 unread · #general was active 2m ago   │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [🔴] Dev Team                               │   │
│ │     @2 mentions in #code-review             │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [🎮] Gaming                                 │   │
│ │     🔊 3 in voice · #lfg                    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [+ Create Server]           [🧭 Discover Servers] │
├───────────────────────────────────────────────────┤
│ [🏠 Home] [📡 Servers] [🔔 Notif] [👤 You]       │
└───────────────────────────────────────────────────┘

2. Server Channel List:
┌───────────────────────────────────────────────────┐
│ ← Servers    My Server             [⚙️ settings]  │
├───────────────────────────────────────────────────┤
│ ▸ TEXT CHANNELS                                   │
│   # general                          ●            │
│   # random                                        │
│   # announcements                    2            │
│ ▸ VOICE CHANNELS                                  │
│   🔊 General Voice (2 connected)                  │
│   🔊 Gaming                                       │
├───────────────────────────────────────────────────┤
│ [🏠 Home] [📡 Servers] [🔔 Notif] [👤 You]       │
└───────────────────────────────────────────────────┘

3. Channel View (full-screen, same as Option A):
┌───────────────────────────────────────────────────┐
│ ← My Server   #general                    [...]   │
├───────────────────────────────────────────────────┤
│ Messages...                                       │
└───────────────────────────────────────────────────┘
```

## File Changes

### New Files

```
apps/web/
├── app/channels/
│   ├── servers/
│   │   └── page.tsx              ← Server list page (card layout)
│   ├── notifications/
│   │   └── page.tsx              ← Notifications page (mentions, unreads)
│   └── you/
│       └── page.tsx              ← Profile page (replaces /profile)
├── components/
│   ├── servers/
│   │   ├── server-list-page.tsx  ← Full server list with rich cards
│   │   └── server-card.tsx       ← Individual server card component
│   └── layout/
│       └── mobile-back-header.tsx ← "← Back" header for drill-down navigation
```

### Modified Files

```
apps/web/components/layout/
├── mobile-bottom-tab-bar.tsx      ← REWRITE: 4 new tabs
├── channels-shell.tsx             ← MODIFY: hide guild rail on mobile
├── server-sidebar-wrapper.tsx     ← MODIFY: desktop-only (hidden on mobile)
└── mobile-nav.tsx                 ← SIMPLIFY: remove hamburger, add back-nav
```

## Route Structure

```
/channels/me                    → Home (DMs) — bottom nav visible
/channels/me/:channelId         → DM chat — full-screen
/channels/servers               → NEW: Server list page — bottom nav visible
/channels/notifications         → NEW: Notifications — bottom nav visible
/channels/you                   → NEW: Profile — bottom nav visible
/channels/discover              → Server discovery (linked from servers page)
/channels/:serverId             → Channel list — bottom nav visible
/channels/:serverId/:channelId  → Channel view — full-screen (no bottom nav)
/channels/friends               → Friends list — bottom nav visible
```

### React Router / App Router Setup

```
apps/web/app/channels/
├── layout.tsx                  (existing — auth + server list loader)
├── servers/
│   └── page.tsx                (NEW)
├── notifications/
│   └── page.tsx                (NEW)
├── you/
│   └── page.tsx                (NEW)
├── me/                         (existing)
├── friends/                    (existing)
├── discover/                   (existing)
├── profile/                    (existing — redirect to /you)
└── [serverId]/                 (existing)
```

## Bottom Tab Bar

```tsx
// mobile-bottom-tab-bar.tsx
const TABS = [
  { href: "/channels/me", label: "Home", icon: Home },
  { href: "/channels/servers", label: "Servers", icon: Server },
  { href: "/channels/notifications", label: "Notifications", icon: Bell },
  { href: "/channels/you", label: "You", icon: UserRound },
]

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/channels/me") {
    return pathname.startsWith("/channels/me") || pathname.startsWith("/channels/friends")
  }
  if (href === "/channels/servers") {
    return pathname === "/channels/servers" ||
      pathname.startsWith("/channels/discover") ||
      // Any server route
      (pathname.startsWith("/channels/") &&
       !pathname.startsWith("/channels/me") &&
       !pathname.startsWith("/channels/notifications") &&
       !pathname.startsWith("/channels/you") &&
       !pathname.startsWith("/channels/servers") &&
       !pathname.startsWith("/channels/friends") &&
       !pathname.startsWith("/channels/discover"))
  }
  return pathname.startsWith(href)
}
```

## Server Card Component

```tsx
// components/servers/server-card.tsx
interface ServerCardProps {
  server: ServerRow
  unreadCount: number
  mentionCount: number
  voiceCount: number
  lastActiveChannel?: string
  onClick: () => void
}

export function ServerCard({ server, unreadCount, mentionCount, voiceCount, lastActiveChannel, onClick }: ServerCardProps) {
  return (
    <button onClick={onClick} className="w-full p-3 rounded-lg flex items-center gap-3 ...">
      <Avatar server={server} size={48} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{server.name}</div>
        <div className="text-sm text-muted truncate">
          {mentionCount > 0 && <span>@{mentionCount} mentions</span>}
          {unreadCount > 0 && <span>{unreadCount} unread</span>}
          {voiceCount > 0 && <span>🔊 {voiceCount} in voice</span>}
          {lastActiveChannel && <span>#{lastActiveChannel}</span>}
        </div>
      </div>
      {(mentionCount > 0 || unreadCount > 0) && <UnreadBadge count={mentionCount || unreadCount} />}
    </button>
  )
}
```

## Mobile Breakpoints

- `<768px` (Tailwind `md:`): Mobile mode — server rail hidden, bottom tab nav, servers page
- `≥768px`: Desktop mode — server rail visible, no bottom nav, servers page not needed

## State Management

Minimal additions to `app-store.ts`:

```tsx
// Optional: server list view preference
serverListView: 'list' | 'grid'  // default: 'list'
setServerListView: (view: 'list' | 'grid') => void

// Existing state already provides everything needed:
// - servers: ServerRow[]
// - serverHasUnread: Record<string, boolean>
// - channels: Record<string, ChannelRow[]>
```

## Acceptance Criteria

- [ ] New "Servers" tab in mobile bottom nav
- [ ] Server list page with cards showing unread/mention/voice info
- [ ] Tap server card → navigate to channel list
- [ ] Tap channel → full-screen message view
- [ ] Back navigation: channel → channel list → server list
- [ ] Desktop: server sidebar unchanged, servers page accessible but not primary
- [ ] Bottom nav hidden during full-screen channel view
- [ ] "Discover" and "Create Server" buttons on servers page
- [ ] Server cards update in real-time (unread counts, voice)

## Priority

**P2** — Enhanced mobile experience (implement after Option A quick win or as Phase 2)

## Labels

`ux`, `mobile`, `navigation`, `feature`, `architecture`
