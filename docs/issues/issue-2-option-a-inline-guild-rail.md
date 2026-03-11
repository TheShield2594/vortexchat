# Option A: Inline guild rail on mobile home screen (Fluxer pattern)

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
export function ChannelsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullScreen = isFullScreenChannel(pathname)

  return (
    <MobileNavProvider>
      {/* Bottom padding omitted in full-screen channel view where MobileBottomTabBar is hidden */}
      <div className={`flex h-screen overflow-hidden md:pb-0 ${isFullScreen ? "" : "pb-16"}`}>
        <ConnectionBanner />
        {/* ServerSidebarWrapper always renders (desktop sidebar); hidden via CSS on mobile */}
        <ServerSidebarWrapper />
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

> **Note:** The runtime implementation always renders `<ServerSidebarWrapper />` (CSS-hidden on mobile). Only the bottom padding is toggled based on `isFullScreenChannel()`, which is exported from `mobile-bottom-tab-bar.tsx`.

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
  { href: "/channels/profile", label: "You", icon: UserRound },
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

No URL changes needed. The layout is entirely controlled by detecting the route depth:

```tsx
// Utility: detect if we're in a "full-screen channel" view on mobile
function useIsFullScreenChannel() {
  const pathname = usePathname()
  const isMobile = useMediaQuery('(max-width: 767px)')

  // /channels/:serverId/:channelId or /channels/me/:channelId
  const hasChannelId = pathname.split('/').length >= 4

  return isMobile && hasChannelId
}
```

## Mobile Breakpoints

- `<768px` (Tailwind `md:`): Mobile layout with inline guild rail
- `≥768px`: Desktop layout (unchanged — 2-sidebar)

## State Management

No changes to `app-store.ts`. The existing `activeServerId`, `activeChannelId`, and `channels` cache work as-is. The server sidebar's `navigateToServer()` already handles:
1. Cached channels → navigate to first text channel
2. localStorage last-channel → navigate to stored channel
3. Fallback → navigate to `/channels/:serverId` (server layout handles redirect)

## Acceptance Criteria

- [ ] Mobile: Guild rail visible on home screen without hamburger
- [ ] Mobile: Tap server → see channel list (guild rail stays)
- [ ] Mobile: Tap channel → full-screen messages (guild rail + bottom nav hidden)
- [ ] Mobile: Back/swipe-back from messages → channel list
- [ ] Desktop: No visual or behavioral changes
- [ ] Swipe right from left edge opens guild rail when in channel view (optional)
- [ ] Bottom nav hidden when viewing messages
- [ ] Channels remain clickable with immediate navigation

## Priority

**P1** — Core navigation improvement

## Labels

`ux`, `mobile`, `navigation`, `architecture`
