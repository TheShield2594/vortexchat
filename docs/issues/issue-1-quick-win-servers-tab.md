# Mobile: Replace "Discover" bottom tab with "Servers" tab

> **Status: COMPLETED** — The "Discover" tab has been replaced with a "Servers" tab. The current mobile bottom tabs are: Messages, Notifications, You (3 tabs). The "Servers" tab was subsequently removed when the inline guild rail was implemented (Issue #2), since the server rail is now always visible on mobile.

## Problem

On mobile (`<768px`), the bottom navigation has 4 tabs: **Discover / DMs / Friends / Profile**. Servers are only accessible via a hamburger menu drawer, requiring 3 taps to reach any channel. The "Discover" tab confusingly highlights when viewing server channels, even though it's not the path the user took.

**Current flow (mobile):** Hamburger → Server icon → Channel = **3 taps**

Competitive analysis shows:
- **Fluxer** shows the guild list inline on the mobile home screen — **2 taps** to any channel
- **Stoat** has no mobile layout but renders the server rail always visible

## Proposed Solution

Replace the "Discover" tab with a "Servers" tab that:
1. If the user has an active server: navigates to the last-visited server/channel
2. If no active server: navigates to a server list view
3. Move "Discover" to the server list page as a prominent button

## Affected Files

- `apps/web/components/layout/mobile-bottom-tab-bar.tsx` — Change tab definition
- `apps/web/components/layout/server-sidebar.tsx` — No changes needed (already has `navigateToServer`)

## Implementation

```tsx
// mobile-bottom-tab-bar.tsx
const TABS = [
  { href: "/channels/me", label: "DMs", icon: MessagesSquare },
  { href: "/channels/servers", label: "Servers", icon: Server },  // ← NEW
  { href: "/channels/friends", label: "Friends", icon: Users },
  { href: "/channels/profile", label: "Profile", icon: UserRound },
]
```

The `isTabActive` function should highlight the Servers tab when viewing any server channel route.

## Priority

**P0** — Quick win, ~30min implementation, immediately reduces mobile taps from 3 to 2.

## Labels

`ux`, `mobile`, `navigation`, `quick-win`
