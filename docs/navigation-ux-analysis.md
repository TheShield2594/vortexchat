# Navigation UX Analysis: Stoat vs Fluxer vs Vortex

> Competitive analysis of server/channel navigation patterns in three Discord-like chat apps.
> Prepared as input for GitHub issues to improve VortexChat mobile navigation.

---

## 1. Stoat (stoatchat/for-web)

**Stack:** SolidJS, @solidjs/router, Panda CSS (styled-system), Material Design 3

### Navigation Architecture

**Layout:** Two-panel left sidebar — always visible on desktop.

```text
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

```text
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

```text
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

```text
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

```text
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

```text
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

```text
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

```text
apps/web/components/layout/
  ├── mobile-bottom-tab-bar.tsx    ← MODIFY: 3 tabs (DMs, Notifications, You)
  ├── server-sidebar-wrapper.tsx   ← MODIFY: show inline on mobile home too
  ├── channels-shell.tsx           ← MODIFY: conditional layout based on route depth
  ├── channel-sidebar.tsx          ← MODIFY: full-width on mobile home
  └── mobile-nav.tsx               ← MODIFY: remove hamburger, add swipe-back
```

**Route Changes:**

```tsx
// No new URLs needed, but the existing /channels/:serverId route currently
// redirects to the first channel (via server-sidebar.tsx navigateToServer()
// and the [serverId]/page.tsx fallback). This redirect MUST change for
// Option A to work on mobile:
//
// - Desktop: keep the redirect — clicking a server icon auto-opens
//   the last-visited or first text channel (current behavior).
// - Mobile: do NOT redirect — /channels/:serverId should render the
//   channel list as full-width content so users can pick a channel.
//
// Implementation options:
//   1. Make [serverId]/page.tsx device-aware (useMediaQuery) and only
//      redirect on desktop.
//   2. Update navigateToServer() to accept a { forceChannelList } flag
//      and skip the cached-channel lookup on mobile.
//
// Layout control (unchanged):
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

```text
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

```text
apps/web/
├── app/channels/
│   ├── servers/                    ← NEW: servers tab page
│   │   └── page.tsx               ← Server list (card-style)
│   ├── notifications/             ← NEW: notifications page
│   │   └── page.tsx
│   └── you/                       ← NEW: replaces /profile
│       └── page.tsx
├── components/
│   ├── servers/
│   │   ├── server-list-page.tsx   ← NEW: full-page server list with cards
│   │   └── server-card.tsx        ← NEW: individual server card component
│   └── layout/
│       ├── mobile-bottom-tab-bar.tsx  ← REWRITE: 4 tabs (Home, Servers, Notif, You)
│       ├── server-sidebar-wrapper.tsx ← MODIFY: hide on mobile entirely
│       ├── channels-shell.tsx         ← MODIFY: route-depth-based layout
│       └── mobile-nav.tsx             ← SIMPLIFY: remove drawer, keep swipe-back
```

**Route Changes:**

```text
/channels/me              → Home (DMs)
/channels/servers         ← NEW: Server list page
/channels/notifications   ← NEW: Notifications
/channels/you             ← NEW: Profile (replaces /profile)
/channels/:serverId       → Channel list (full-page on mobile)
/channels/:serverId/:channelId → Message view (full-screen on mobile)
/channels/:serverId/settings   → Server settings (NOT a channel view)
/channels/:serverId/moderation → Moderation panel (NOT a channel view)
/channels/:serverId/events     → Server events (NOT a channel view)
```

**Bottom Tab Bar Rewrite:**

```tsx
const TABS = [
  { href: "/channels/me", label: "Home", icon: Home },
  { href: "/channels/servers", label: "Servers", icon: Server },
  { href: "/channels/notifications", label: "Notifications", icon: Bell },
  { href: "/channels/you", label: "You", icon: User },
]

// Reserved slugs that appear as /channels/:serverId/<slug> but are NOT channel views.
// Keep this list in sync with RESERVED_SERVER_SUBROUTES used by isFullScreenChannel.
const RESERVED_SERVER_SUBROUTES = ["settings", "moderation", "events"]

function isServerSubrouteReserved(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean)
  // Pattern: /channels/:serverId/:slug where slug is reserved
  return segments.length >= 3 && RESERVED_SERVER_SUBROUTES.includes(segments[2])
}

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/channels/servers") {
    // Active when on servers page OR inside any real server route
    // (excludes reserved prefixes AND reserved server sub-routes)
    return pathname === "/channels/servers" ||
      (pathname.startsWith("/channels/") &&
       !pathname.startsWith("/channels/me") &&
       !pathname.startsWith("/channels/notifications") &&
       !pathname.startsWith("/channels/you") &&
       !pathname.startsWith("/channels/discover") &&
       !pathname.startsWith("/channels/friends") &&
       !pathname.startsWith("/channels/profile") &&
       !pathname.startsWith("/channels/servers") &&
       !isServerSubrouteReserved(pathname))
  }
  return pathname.startsWith(href)
}
```

**Mobile Breakpoint Logic:**

```tsx
import { isFullScreenChannel as isFullScreenChannelFn } from "@/components/layout/mobile-bottom-tab-bar"

const isMobile = useMediaQuery('(max-width: 767px)')
const pathname = usePathname()
// Use the shared isFullScreenChannel() from mobile-bottom-tab-bar.tsx which
// excludes RESERVED_PREFIXES (me, notifications, you, friends, discover, etc.)
// and reserved server sub-routes (settings, moderation, events) via isServerRoute().
// Only matches true channel views: /channels/me/:channelId or /channels/:serverId/:channelId
const isFullScreenChannel = isMobile && isFullScreenChannelFn(pathname)

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

// The `servers` array in AppState provides base server info (id, name, icon).
// The server card examples above reference aggregates (unread counts, mention
// counts, voice activity) that are NOT currently in AppState. To support those:
//   - Add `unreadCounts: Record<string, number>` to AppState (per-server unread)
//   - Add `mentionCounts: Record<string, number>` to AppState (per-server mentions)
//   - Add `voiceActivity: Record<string, { count: number }>` to AppState
//   - Populate via new API endpoint or derive from existing channel/message stores
// Without these additions, the server list page should only display fields
// already available on `servers` (name, icon, member count if present).
```

**Pros:**
- Full screen width for server list with rich cards (requires aggregate data — see State Management)
- Clearer mental model: "Servers" is a first-class destination
- Easier to discover servers (no hidden hamburger)
- More room for server metadata (member count, last activity — requires additional API work)
- 3 taps from bottom nav to any channel (Servers tab → server card → channel), or 2 taps for returning users when auto-navigating to last channel

**Cons:**
- 3 taps baseline without auto-navigation (Servers tab → server → channel)
- Desktop server rail needs to remain for desktop users
- New page component to build and maintain
- "Servers" tab may feel redundant on desktop where sidebar is always visible

---

## 6. Holistic Mobile Parity Assessment

Server/channel navigation is only part of the picture. A full comparison against Discord's mobile PWA reveals additional gaps:

### Bottom Nav: Discord vs Vortex (Current) vs Proposed

| Tab Slot | Discord Mobile | Vortex Current | Proposed Final |
|----------|---------------|----------------|----------------|
| 1 | **Servers** (guild list) | Discover | **Messages** (DMs + Friends toggle) |
| 2 | **Messages** (DMs + Friends) | DMs | **Servers** (guild rail or server list) |
| 3 | **Notifications** (mention inbox) | Friends | **Notifications** (full-page inbox) |
| 4 | **You** (profile + settings hub) | Profile (stub) | **You** (real profile + settings) |

### Flow-by-Flow Comparison

| Flow | Discord Mobile | Vortex Current | After All Issues |
|------|---------------|----------------|-----------------|
| Access servers | Servers tab → guild list | Hamburger → drawer | Servers tab (2 taps to channel) |
| Access DMs | Messages tab → DM list | DMs tab → DM list | Messages tab → DM list |
| Access Friends | Messages tab → header toggle | Dedicated tab | Messages tab → header toggle |
| Profile/Settings | You tab → full settings hub | Stub placeholder | You tab → real settings page |
| Notifications | Dedicated tab → mention inbox | Bell dropdown in header | Dedicated tab → full inbox |
| Search | Top search bar on every screen | Cmd+K only (hidden on mobile) | Visible search icon in header |
| Start new DM | Messages → "+" → friend picker | DMs → "+" → friend picker | Same |
| Message a friend | Friends → tap → opens DM | No "Message" action | Friends toggle → Message button |

### What's Missing Beyond Navigation

| Gap | Issue | Priority |
|-----|-------|----------|
| Profile page is a stub | [#5 Build "You" page](issues/issue-5-build-you-profile-page.md) | P1 |
| No notifications page | [#6 Notifications inbox](issues/issue-6-notifications-inbox-page.md) | P1 |
| Friends wastes a tab slot | [#7 Merge into Messages](issues/issue-7-merge-friends-into-messages-tab.md) | P1 |
| No mobile search entry point | [#8 Mobile search](issues/issue-8-mobile-search-affordance.md) | P2 |

---

## 7. Recommendation

### Target Bottom Nav

```text
[💬 Messages]  [📡 Servers]  [🔔 Notifications]  [👤 You]
```

This closely resembles Discord's mobile layout (Discord uses Servers / Messages ordering). Each tab maps to a real, full-featured page.

### Implementation Order

| Phase | Issue | What | Effort |
|-------|-------|------|--------|
| **Phase 0** | #1, #4 | Quick win: swap Discover→Servers tab + channel click audit | Small |
| **Phase 1a** | #7 | Merge Friends into Messages tab (header toggle) | Small |
| **Phase 1b** | #5 | Build real "You" profile/settings page | Medium |
| **Phase 1c** | #6 | Build Notifications inbox page | Medium |
| **Phase 2a** | #2 | Option A: Inline guild rail on mobile | Medium |
| **Phase 2b** | #8 | Mobile search affordance | Small |
| **Phase 3** | #3 | Option B: Rich server list page (if needed) | Large |

### Why This Order

1. **Phase 0** is a quick fix that immediately reduces tap count with minimal code changes
2. **Phase 1a-c** builds the missing pages that the new 4-tab nav requires — you can't ship "Notifications" and "You" tabs until those pages exist
3. **Phase 2a** is the full navigation architecture change (inline guild rail)
4. **Phase 2b** is a polish item
5. **Phase 3** is optional — only needed if user research shows the guild rail is insufficient for users with many servers

After all phases, Vortex's mobile experience will match Discord's in every major flow: server access, DMs, friends, notifications, profile/settings, and search.
