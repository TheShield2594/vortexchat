# Navigation UX Analysis: Stoat vs Fluxer vs Vortex

> Competitive analysis of server/channel navigation patterns in three Discord-like chat apps.
> Prepared as input for GitHub issues to improve VortexChat mobile navigation.

---

## 1. Stoat (stoatchat/for-web)

**Stack:** SolidJS, @solidjs/router, Panda CSS (styled-system), Material Design 3

### Navigation Architecture

**Layout:** Two-panel left sidebar — always visible on desktop.

```
┌──────────┬────────────────┬──────────────────────┐
│ Server   │ Channel        │                      │
│ Rail     │ Sidebar        │   Message Area        │
│ (56px)   │ (~240px)       │                      │
│          │                │                      │
│ [Home]   │ #general       │                      │
│ [User]   │ #random        │                      │
│ ─────    │ #dev           │                      │
│ [Srv1]   │                │                      │
│ [Srv2]   │                │                      │
│ ─────    │                │                      │
│ [+Add]   │                │                      │
│ [🧭]    │                │                      │
│ ─────    │                │                      │
│ [⚙️]    │                │                      │
└──────────┴────────────────┴──────────────────────┘
```

### Routing

```
/                         → HomePage (DMs)
/server/:server           → ServerHome (redirect to last channel)
/server/:server/channel/:channel → ChannelPage
/channel/:channel         → DM ChannelPage
/friends                  → Friends list
/discover/*               → Server discovery
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| ServerList | `packages/client/src/interface/navigation/servers/ServerList.tsx` | Vertical icon rail (56px), draggable server ordering |
| ServerSidebar | `packages/client/src/interface/navigation/channels/ServerSidebar.tsx` | Channel list grouped by categories, collapsible |
| HomeSidebar | `packages/client/src/interface/navigation/channels/HomeSidebar.tsx` | DM conversation list |
| Sidebar (wrapper) | `packages/client/src/interface/Sidebar.tsx` | Orchestrates ServerList + (ServerSidebar or HomeSidebar) |
| Layout store | `packages/client/components/state/stores/Layout.ts` | Tracks `activeInterface`, `activePath` per server |

### Channel Click Handler

Channels are `<a>` tags with direct `href`:
```tsx
// ServerSidebar.tsx — Entry component, line 486
<a href={`/server/${props.channel.serverId}/channel/${props.channel.id}`}>
```

No `onClick` handler needed — SolidJS router intercepts the anchor navigation.

### State Management

- **Layout store** persists `activePath` per server ID (last-visited channel per server)
- Server click: `<a href={state.layout.getLastActiveServerPath(entry.item.id)}>`
- Keyboard nav: `Ctrl+Alt+Up/Down` to cycle servers, planned `Alt+Up/Down` for channels

### Mobile Behavior

- **No dedicated mobile layout** — Stoat currently has no breakpoint-based mobile adaptation
- The sidebar is always rendered; it relies on desktop viewport
- NavigationRail component (Material Design 3) is 56px wide with no mobile drawer

### Tap Count

| Platform | Steps | Count |
|----------|-------|-------|
| Desktop | Click server icon → Click channel | **2 taps** |
| Mobile | N/A (no mobile layout) | — |

---

## 2. Fluxer (fluxerapp/fluxer)

**Stack:** React, MobX, custom router, CSS Modules, react-dnd

### Navigation Architecture

**Layout:** Three-tier: Guild list → Guild sidebar (channels) → Content. Fully responsive with dedicated mobile mode via `MobileLayoutStore`.

```
Desktop:
┌──────────┬────────────────┬──────────────────────┐
│ Guild    │ Guild Sidebar  │                      │
│ List     │ (channels)     │   Message Area        │
│ (72px)   │ (~240px)       │                      │
│          │                │                      │
│ [Fluxer] │ Server Header  │                      │
│ [⭐Fav]  │ #general       │                      │
│ ─────    │ #random        │                      │
│ [Srv1]   │ ▸ Voice        │                      │
│ [Folder] │                │                      │
│ ─────    │                │                      │
│ [🧭]    │                │                      │
│ [+Add]   │                │                      │
│ [?Help]  │                │                      │
│          │                │                      │
│ UserArea │                │                      │
└──────────┴────────────────┴──────────────────────┘

Mobile (guild selected, no channel):
┌──────────┬────────────────────────────────────────┐
│ Guild    │ Channel List (full width)              │
│ List     │                                        │
│ (72px)   │ Server Header                          │
│          │ #general                               │
│ ...      │ #random                                │
│          │ ▸ Voice                                │
│          │                                        │
├──────────┴────────────────────────────────────────┤
│ [Home]  [🔔 Notif]  [You]                        │
└───────────────────────────────────────────────────┘

Mobile (channel selected):
┌───────────────────────────────────────────────────┐
│ ← Back   #channel-name                    [...]   │
├───────────────────────────────────────────────────┤
│                                                   │
│   Message content (full width)                    │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Routing

```
/channels/@me             → DM list (Home)
/channels/@me/:channelId  → DM conversation
/channels/@favorites      → Favorited channels
/channels/:guildId        → Guild channel list (mobile: shows sidebar)
/channels/:guildId/:channelId → Channel view
/notifications            → Notification center
/you                      → Profile/settings
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| GuildsLayout | `fluxer_app/src/components/layout/GuildsLayout.tsx` | Wraps guild list + content; hides guild list on mobile when in channel |
| GuildList | (inside GuildsLayout.tsx) | Scrollable guild icons with folders, DM pills, drag-and-drop |
| GuildListItem | `fluxer_app/src/components/layout/guild_list/GuildListItem.tsx` | Single guild icon with unread/mention badges, voice indicators |
| GuildLayout | `fluxer_app/src/components/layout/GuildLayout.tsx` | Per-guild wrapper; on mobile shows channel list OR content |
| GuildSidebar | `fluxer_app/src/components/layout/GuildSidebar.tsx` | Channel sidebar container (header + content) |
| MobileBottomNav | `fluxer_app/src/components/layout/MobileBottomNav.tsx` | 3-tab bottom nav: Home, Notifications, You |
| MobileLayoutStore | `fluxer_app/src/stores/MobileLayoutStore.tsx` | MobX store for responsive mode detection |
| NavigationStore | `fluxer_app/src/stores/NavigationStore.tsx` | Tracks current guildId, channelId, navigation history |

### Guild Click Handler

```tsx
// GuildListItem.tsx, line 376-378
const handleSelect = () => {
  NavigationActionCreators.selectGuild(guild.id, isMobileExperience ? undefined : selectedChannel);
};
```

On mobile, selecting a guild navigates to `/channels/:guildId` which shows the channel list. On desktop, it navigates directly to the last-selected channel.

### Mobile Bottom Nav

Only **3 tabs**: Home, Notifications, You. No "Servers" tab — the guild list sidebar is **always visible** alongside the channel list when on the home/guild-selection screen.

```tsx
// MobileBottomNav.tsx — visible at ME, Favorites, Notifications, You, and guild-without-channel routes
<button onClick={handleHomeNavigation}>Home</button>
<button onClick={() => handleNavigation(Routes.NOTIFICATIONS)}>Notifications</button>
<button onClick={() => handleNavigation(Routes.YOU)}>You</button>
```

### Mobile Key Insight

Fluxer's mobile layout uses a **progressive disclosure** pattern:
1. **Home screen** shows guild list (left) + DM list or channel list (right) + bottom nav
2. **Tap guild** → Navigates to `/channels/:guildId` → guild list stays, channel list replaces DM list
3. **Tap channel** → Navigates to `/channels/:guildId/:channelId` → full-screen message view (guild list + bottom nav hidden)
4. **Back button** → Returns to channel list

### State Management

- **MobX stores**: `NavigationStore` (guildId, channelId, pathname), `SelectedChannelStore` (last-selected channel per guild)
- Guild list visibility controlled by URL depth: `pathname.split('/').length === 3` = show guild list
- Channel list vs message view: controlled by presence of `channelId` in URL params

### Tap Count

| Platform | Steps | Count |
|----------|-------|-------|
| Desktop | Click guild → Click channel | **2 taps** |
| Mobile | Tap guild → Tap channel | **2 taps** |

---

## 3. Vortex (TheShield2594/vortexchat) — Current State

**Stack:** Next.js App Router, TypeScript, Zustand, Tailwind CSS

### Navigation Architecture

```
Desktop (≥768px):
┌──────────┬────────────────┬──────────────────────┬──────────┐
│ Server   │ Channel        │                      │ Member   │
│ Sidebar  │ Sidebar        │   Message Area        │ List     │
│ (72px)   │ (~240px)       │                      │          │
│          │                │                      │          │
│ [VX Home]│ #general       │                      │          │
│ ─────    │ #random        │                      │          │
│ [Srv1]   │ ▸ Voice        │                      │          │
│ [Srv2]   │                │                      │          │
│ ─────    │                │                      │          │
│ [+Add]   │                │                      │          │
│ [🧭]    │                │                      │          │
└──────────┴────────────────┴──────────────────────┴──────────┘

Mobile (<768px):
┌───────────────────────────────────────────────────┐
│ ☰  Server Name           [search] [settings]      │
├───────────────────────────────────────────────────┤
│                                                   │
│   Channel sidebar OR message area                 │
│   (depends on route)                              │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🧭 Discover] [💬 DMs] [👥 Friends] [👤 Profile] │
└───────────────────────────────────────────────────┘

Mobile (hamburger open):
┌──────────┬────────────────────────────────────────┐
│ Server   │ [dimmed overlay]                       │
│ Sidebar  │                                        │
│ (72px)   │                                        │
│ drawer   │                                        │
└──────────┴────────────────────────────────────────┘
```

### Routing

```
/channels/discover        → Server discovery
/channels/me              → DM list
/channels/me/:channelId   → DM conversation
/channels/friends         → Friends list
/channels/profile         → User profile
/channels/:serverId       → Server (redirects to first channel)
/channels/:serverId/:channelId → Channel view
/channels/:serverId/settings   → Server settings
/channels/:serverId/moderation → Moderation panel
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| MobileBottomTabBar | `apps/web/components/layout/mobile-bottom-tab-bar.tsx` | 4-tab: Discover, DMs, Friends, Profile |
| ServerSidebar | `apps/web/components/layout/server-sidebar.tsx` | 72px vertical icon strip |
| ServerSidebarWrapper | `apps/web/components/layout/server-sidebar-wrapper.tsx` | Desktop=inline, Mobile=drawer |
| ChannelSidebar | `apps/web/components/layout/channel-sidebar.tsx` | Full channel list with categories, drag-reorder |
| ChannelsShell | `apps/web/components/layout/channels-shell.tsx` | Root layout wrapper |
| MobileNavProvider | `apps/web/components/layout/mobile-nav.tsx` | Drawer open/close state, swipe gestures |
| AppStore (Zustand) | `apps/web/lib/stores/app-store.ts` | activeServerId, activeChannelId, channels cache |

### Channel Click Handler

Channels ARE clickable (contrary to issue description):
```tsx
// channel-sidebar.tsx, line 849-857
onClick={() => {
  if (channel.parent_id) {
    setCategoryExpansionOverrides((prev) => ({ ...prev, [channel.parent_id!]: true }))
  }
  if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
    setVoiceChannel(channel.id, server.id, channel.name)
  }
  router.push(`/channels/${server.id}/${channel.id}`)
}}
```

### The Actual UX Problems

1. **Mobile: No "Servers" in bottom nav** — Bottom tabs are Discover/DMs/Friends/Profile. To see servers, user must open hamburger drawer.
2. **Mobile: Server sidebar is a thin drawer** — Only shows server icons (72px), not channel names. After tapping a server icon, the drawer closes and the channel sidebar appears in the main content area.
3. **Mobile: "Discover" tab overloaded** — The Discover tab highlights when viewing ANY server channel (see `isTabActive` logic), making it confusing.
4. **No indication of "current server" in bottom nav** — User doesn't know which server they're viewing.
5. **Desktop works fine** — Server icons always visible, channel list always visible, 2 taps to any channel.

### Tap Count

| Platform | Steps | Count |
|----------|-------|-------|
| Desktop | Click server icon → Click channel | **2 taps** |
| Mobile (from DMs) | Tap hamburger → Tap server icon → Tap channel | **3 taps** |
| Mobile (from Discover) | Tap hamburger → Tap server icon → Tap channel | **3 taps** |
| Mobile (fresh app open) | Already on Discover → Tap hamburger → Tap server → Tap channel | **3 taps** |

---

## 4. Comparative Summary

| Feature | Stoat | Fluxer | Vortex (Current) |
|---------|-------|--------|-------------------|
| Server list location | Left rail (always) | Left rail (conditional on mobile) | Left rail (desktop) / drawer (mobile) |
| Channel list location | Second sidebar | Second sidebar / full-width mobile | Second sidebar / in-page mobile |
| Mobile bottom nav | None | Home / Notifications / You | Discover / DMs / Friends / Profile |
| Mobile server access | No mobile layout | Guild list visible on home screen | Hidden behind hamburger |
| Mobile taps to channel | N/A | **2** | **3** |
| Desktop taps to channel | **2** | **2** | **2** |
| URL pattern | `/server/:id/channel/:id` | `/channels/:guildId/:channelId` | `/channels/:serverId/:channelId` |
| State management | Custom store (activePath) | MobX (NavigationStore) | Zustand (app-store) |
| Channel click | `<a href>` | NavigationActionCreators | `router.push()` |
| Server persistence | activePath per server | SelectedChannelStore per guild | localStorage per server |
| Guild folders | No | Yes (drag to create) | No |

---

## 5. Proposed Navigation Architectures for Vortex

### Option A: Left Sidebar + Drawer (Stoat/Discord Pattern)

**Concept:** Keep the desktop 2-sidebar layout. On mobile, show the guild list inline on the "home" screen and use a swipe-back gesture from channel view.

```
Mobile Home:
┌──────────┬────────────────────────────────────────┐
│ Server   │ DMs / Channel List                     │
│ Rail     │                                        │
│ (64px)   │ Based on selected server               │
│          │                                        │
│ [VX]     │ [Server Name Header]                   │
│ ─────    │ #general                               │
│ [S1]     │ #random                                │
│ [S2]     │ ▸ Voice Channels                       │
│ ─────    │                                        │
│ [+]      │                                        │
│ [🧭]    │                                        │
├──────────┴────────────────────────────────────────┤
│ [💬 DMs] [🔔 Notif] [👤 You]                     │
└───────────────────────────────────────────────────┘

Mobile Channel View (full-screen, swipe-back):
┌───────────────────────────────────────────────────┐
│ ← Back   #channel-name                            │
├───────────────────────────────────────────────────┤
│ Messages...                                       │
└───────────────────────────────────────────────────┘
```

**File Structure Changes:**

```
apps/web/components/layout/
  ├── mobile-bottom-tab-bar.tsx    ← MODIFY: 3 tabs (DMs, Notifications, You)
  ├── server-sidebar-wrapper.tsx   ← MODIFY: show inline on mobile home too
  ├── channels-shell.tsx           ← MODIFY: conditional layout based on route depth
  ├── channel-sidebar.tsx          ← MODIFY: full-width on mobile home
  └── mobile-nav.tsx               ← MODIFY: remove hamburger, add swipe-back
```

**Route Changes:**

```tsx
// No URL changes needed. Mobile layout is controlled by:
// - /channels/:serverId (show guild rail + channel list + bottom nav)
// - /channels/:serverId/:channelId (full-screen messages, hide bottom nav)
```

**Mobile Breakpoint Logic:**

```tsx
// channels-shell.tsx
const isMobile = useMediaQuery('(max-width: 767px)')
const pathname = usePathname()
const isChannelView = /\/channels\/[^/]+\/[^/]+/.test(pathname)

// Show guild rail: always on desktop, on mobile when NOT in full-screen channel
const showGuildRail = !isMobile || !isChannelView
// Show channel list: on mobile home (no channelId) or always on desktop
const showChannelSidebar = !isMobile || !isChannelView
// Show bottom nav: only when not in full-screen channel
const showBottomNav = isMobile && !isChannelView
```

**State Management:**

```tsx
// app-store.ts — no changes needed, already tracks:
// - activeServerId
// - activeChannelId
// - channels (cached per server)
// Just need to ensure navigateToServer() works for inline guild rail
```

**Pros:**
- Follows established Discord/Stoat pattern users already know
- Server list always visible — 2 taps to any channel on mobile
- Clean swipe-back gesture for channel → channel list
- Minimal state management changes

**Cons:**
- 64px guild rail eats horizontal space on mobile
- Server list may be overwhelming for users with many servers
- No room for friends/profile in bottom nav (moved to "You" tab)

---

### Option B: Bottom-Tabbed Servers (Mobile-First Pattern)

**Concept:** Replace the 4-tab bottom nav with a dynamic server-aware bottom nav. When a server is active, the bottom nav morphs to show server-specific actions.

```
Mobile Home (no server selected):
┌───────────────────────────────────────────────────┐
│ VortexChat                              [search]  │
├───────────────────────────────────────────────────┤
│                                                   │
│ DM conversations / Discover content               │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🏠 Home] [📡 Servers] [🔔 Notif] [👤 You]       │
└───────────────────────────────────────────────────┘

Mobile Servers Tab:
┌───────────────────────────────────────────────────┐
│ Servers                                 [search]  │
├───────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐   │
│ │ [icon] My Server        3 unread channels   │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [icon] Dev Team         @2 mentions         │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [icon] Gaming           ▸ Voice (3)         │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [+ Create Server]  [🧭 Discover]                  │
├───────────────────────────────────────────────────┤
│ [🏠 Home] [📡 Servers] [🔔 Notif] [👤 You]       │
└───────────────────────────────────────────────────┘

Mobile Server Selected (channel list):
┌───────────────────────────────────────────────────┐
│ ← Servers   My Server Name        [settings]      │
├───────────────────────────────────────────────────┤
│ ▸ TEXT CHANNELS                                   │
│   # general                                       │
│   # random                                        │
│   # announcements                                 │
│ ▸ VOICE CHANNELS                                  │
│   🔊 General Voice (2)                            │
│   🔊 Gaming                                       │
├───────────────────────────────────────────────────┤
│ [🏠 Home] [📡 Servers] [🔔 Notif] [👤 You]       │
└───────────────────────────────────────────────────┘

Mobile Channel View (full-screen):
┌───────────────────────────────────────────────────┐
│ ← My Server   #general                    [...]   │
├───────────────────────────────────────────────────┤
│ Messages...                                       │
└───────────────────────────────────────────────────┘
```

**File Structure Changes:**

```
apps/web/
├── app/channels/
│   ├── servers/                    ← NEW: servers tab page
│   │   └── page.tsx               ← Server list (card-style)
│   ├── notifications/             ← NEW: notifications page
│   │   └── page.tsx
│   └── you/                       ← NEW: replaces /profile
│       └── page.tsx
├── components/layout/
│   ├── mobile-bottom-tab-bar.tsx  ← REWRITE: 4 tabs (Home, Servers, Notif, You)
│   ├── server-list-page.tsx       ← NEW: full-page server list with cards
│   ├── server-sidebar-wrapper.tsx ← MODIFY: hide on mobile entirely
│   ├── channels-shell.tsx         ← MODIFY: route-depth-based layout
│   └── mobile-nav.tsx             ← SIMPLIFY: remove drawer, keep swipe-back
```

**Route Changes:**

```
/channels/me              → Home (DMs)
/channels/servers         ← NEW: Server list page
/channels/notifications   ← NEW: Notifications
/channels/you             ← NEW: Profile (replaces /profile)
/channels/:serverId       → Channel list (full-page on mobile)
/channels/:serverId/:channelId → Message view (full-screen on mobile)
```

**Bottom Tab Bar Rewrite:**

```tsx
const TABS = [
  { href: "/channels/me", label: "Home", icon: Home },
  { href: "/channels/servers", label: "Servers", icon: Server },
  { href: "/channels/notifications", label: "Notifications", icon: Bell },
  { href: "/channels/you", label: "You", icon: User },
]

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/channels/servers") {
    // Active when on servers page OR inside any server
    return pathname === "/channels/servers" ||
      (pathname.startsWith("/channels/") &&
       !pathname.startsWith("/channels/me") &&
       !pathname.startsWith("/channels/notifications") &&
       !pathname.startsWith("/channels/you") &&
       !pathname.startsWith("/channels/discover"))
  }
  return pathname.startsWith(href)
}
```

**Mobile Breakpoint Logic:**

```tsx
const isMobile = useMediaQuery('(max-width: 767px)')
const pathname = usePathname()
const isFullScreenChannel = isMobile && /\/channels\/[^/]+\/[^/]+/.test(pathname)

// Hide bottom nav in full-screen channel view
// Hide server sidebar entirely on mobile (replaced by /channels/servers page)
// Show back button in header when in channel view
```

**State Management:**

```tsx
// app-store.ts additions:
interface AppState {
  // ... existing
  serverListView: 'grid' | 'list'  // user preference for server list page
}

// Server list page fetches from existing `servers` array in store
// No new data fetching needed
```

**Pros:**
- Full screen width for server list with rich cards (unread counts, voice status)
- Clearer mental model: "Servers" is a first-class destination
- Easier to discover servers (no hidden hamburger)
- More room for server metadata (member count, last activity)
- 2 taps from bottom nav to any channel (Servers tab → server card → channel)

**Cons:**
- 3 taps to channel (Servers tab → server → channel) unless we auto-navigate to last channel
- Desktop server rail needs to remain for desktop users
- New page component to build and maintain
- "Servers" tab may feel redundant on desktop where sidebar is always visible

---

## 6. Recommendation

**Option A (Left Sidebar + Drawer)** is recommended for Vortex because:

1. **Minimal code changes** — mostly visibility toggles on existing components
2. **Matches Fluxer's proven mobile UX** — 2 taps to any channel
3. **No new routes needed** — layout is URL-depth-aware
4. **Desktop experience unchanged** — zero regression risk
5. **Existing swipe gesture infrastructure** — `MobileSwipeArea` already handles right-swipe to open drawer

However, **Option B should be considered as a Phase 2** improvement for the server list page, as it provides a better discovery experience for users with many servers.

### Quick Win (Implement Now)

Before either option, a **quick fix** can immediately improve navigation:

1. Replace "Discover" tab with "Servers" tab that navigates to the last-visited server
2. Keep hamburger as fallback but make the bottom tab the primary path
3. This is a ~20-line change in `mobile-bottom-tab-bar.tsx`
