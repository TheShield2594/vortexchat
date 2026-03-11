# Option A: Inline guild rail on mobile home screen (Fluxer pattern)

> **Status: COMPLETED** — Guild rail now renders inline on mobile. Bottom nav reduced to 3 tabs (Messages, Notifications, You). Full-screen channel views hide both the rail and bottom nav.

## Summary

Implement the Fluxer/Discord mobile navigation pattern: show the server icon rail inline on mobile when the user is on a "home" screen (DMs, server channel list), and switch to full-screen message view when a channel is selected.

**Target:** 2 taps to any channel on mobile (same as desktop).

## Architecture

### Layout Behavior by Route Depth

| Route | Guild Rail | Channel Sidebar | Messages | Bottom Nav |
|-------|-----------|----------------|----------|------------|
| `/channels/me` | Visible | DM list | Hidden | Visible |
| `/channels/:serverId` | Visible | Channel list (full-width minus rail) | Hidden | Visible |
| `/channels/:serverId/:channelId` | Hidden | Hidden | Full-screen | Hidden |
| `/channels/friends` | Visible | Friends content | Hidden | Visible |

### Visual (Mobile)

```text
Home/Server screen:          Channel view:
┌──────┬──────────────┐     ┌────────────────────┐
│ Rail │ Content      │     │ ← Back  #channel   │
│ 64px │              │     ├────────────────────┤
│      │              │     │                    │
│ [VX] │ Channels     │     │ Messages           │
│ [S1] │ or DMs       │     │                    │
│ [S2] │              │     │                    │
├──────┴──────────────┤     │                    │
│ [DMs] [🔔] [You]   │     │                    │
└─────────────────────┘     └────────────────────┘
```

## File Changes

### 1. `apps/web/components/layout/channels-shell.tsx`

Add route-depth detection to control layout:

```tsx
import { isFullScreenChannel } from "@/components/layout/mobile-bottom-tab-bar"

export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullScreen = isFullScreenChannel(pathname)

  return (
    <MobileNavProvider>
      {/* Bottom padding omitted in full-screen channel view where MobileBottomTabBar is hidden */}
      <div className={`flex h-screen overflow-hidden md:pb-0 ${isFullScreen ? "" : "pb-16"}`}>
        <ConnectionBanner />
        {/* Guild rail hidden in full-screen channel views; always shown on desktop (md:flex) */}
        {!isFullScreen && <ServerSidebarWrapper />}
        <MobileSwipeArea />
        <MobileOverlay />
        <div className="flex flex-1 overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  )
}
```

> **Note:** The target end state renders `<ServerSidebarWrapper />` inline on both desktop and mobile (always-visible guild rail). The current implementation in `apps/web/components/layout/server-sidebar-wrapper.tsx` uses a drawer on mobile — this must be changed to inline rendering. `ChannelsShell` gates `<ServerSidebarWrapper />` on `!isFullScreenChannel(pathname)` so the rail is suppressed on full-screen channel routes; `isFullScreenChannel()` is the shared helper exported from `mobile-bottom-tab-bar.tsx`. Bottom padding toggles alongside `MobileBottomTabBar` visibility using the same `isFullScreen` flag.

### 2. `apps/web/components/layout/server-sidebar-wrapper.tsx`

Always show inline on mobile (remove drawer logic):

```tsx
export function ServerSidebarWrapper() {
  return (
    <div className="flex flex-shrink-0">
      <ServerSidebar />
    </div>
  )
}
```

### 3. `apps/web/components/layout/mobile-bottom-tab-bar.tsx`

Reduce to 3 tabs, hide when in full-screen channel:

```tsx
const TABS = [
  { href: "/channels/me", label: "DMs", icon: MessagesSquare },
  { href: "/channels/notifications", label: "Notifications", icon: Bell },
  { href: "/channels/you", label: "You", icon: UserRound },
]
```

The bottom tab bar should not render when `isFullScreenChannel` is true. This can be controlled via a shared context or by reading the pathname.

### 4. `apps/web/app/channels/[serverId]/layout.tsx`

On mobile, when no channelId, render channel sidebar as full-width content (not in a narrow side panel):

```tsx
// Server layout should detect mobile + no channelId
// and render ChannelSidebar as the main content area
```

### 5. `apps/web/components/layout/mobile-nav.tsx`

Remove hamburger button (no longer needed — guild rail is always visible). Keep swipe gestures for channel view → back navigation.

## Router Setup

No new route patterns needed, but Option A requires router **behavior** changes: mobile server taps must navigate to `/channels/:serverId` (showing the channel list) rather than directly into a channel, and the `[serverId]/page.tsx` route must perform device-aware handling before selecting a channel (see State Management below). Layout switching is controlled by the shared helpers `useIsFullScreenChannel()` and `isFullScreenChannel(pathname)`:

```tsx
import { isFullScreenChannel } from "@/components/layout/mobile-bottom-tab-bar"

// Utility: detect if we're in a "full-screen channel" view on mobile.
// Delegates to the shared isFullScreenChannel() exported from
// mobile-bottom-tab-bar.tsx, which uses RESERVED_PREFIXES to exclude
// non-channel routes (friends, notifications, you, discover, servers,
// profile) and only matches true DM conversations (/channels/me/:channelId)
// and server channels (/channels/:serverId/:channelId).
function useIsFullScreenChannel() {
  const pathname = usePathname()
  const isMobile = useMediaQuery('(max-width: 767px)')

  return isMobile && isFullScreenChannel(pathname)
}
```

## Mobile Breakpoints

- `<768px` (Tailwind `md:`): Mobile layout with inline guild rail
- `≥768px`: Desktop layout (unchanged — 2-sidebar)

## State Management

No changes to `app-store.ts`. The existing `activeServerId`, `activeChannelId`, and `channels` cache work as-is.

**Important:** The current `navigateToServer()` in `server-sidebar.tsx` auto-navigates to a cached/stored channel, which bypasses the channel-list route and breaks the mobile flow (user should see the channel list, not jump straight into a channel). On mobile, the server-icon tap handler must route to `/channels/:serverId` so the channel list is shown. Two approaches:

1. **Flag-based:** Add an optional parameter `navigateToServer(serverId, { forceChannelList?: boolean })` and pass `forceChannelList: true` when `isMobile` is detected, skipping the cached/localStorage channel lookup.
2. **Separate helper:** Add `navigateToServerList(serverId)` that always routes to `/channels/:serverId` and use it in the mobile tap handler.

Desktop behavior should remain unchanged — `navigateToServer()` continues to auto-open the last channel on desktop.

## Acceptance Criteria

- [x] Mobile: Guild rail visible on home screen without hamburger
- [x] Mobile: Tap server → see channel list (guild rail stays)
- [x] Mobile: Tap channel → full-screen messages (guild rail + bottom nav hidden)
- [x] Mobile: Back/swipe-back from messages → channel list
- [x] Desktop: No visual or behavioral changes
- [ ] Swipe right from left edge goes back to server/channel list (swipe-back gesture, optional)
- [x] Bottom nav hidden when viewing messages
- [x] Channels remain clickable with immediate navigation

## Priority

**P1** — Core navigation improvement

## Labels

`ux`, `mobile`, `navigation`, `architecture`
