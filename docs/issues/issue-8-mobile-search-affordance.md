# Add mobile-visible search entry point

## Problem

Search in Vortex is currently accessible via:
1. **Cmd+K / Ctrl+K** keyboard shortcut → `SearchModal` (not usable on mobile)
2. **Small search icon** in the channel header command bar (easy to miss on mobile)

Discord's mobile app has a prominent search bar at the top of most screens. Mobile users need a discoverable way to search messages, servers, and users.

## What Exists

- `SearchModal` — full search with filters (`from:`, `has:link|image|file`, date range)
- `DmLocalSearchModal` — client-side E2E encrypted search for DMs
- Both triggered by keyboard shortcut or small header icons

## Proposed Solution

Add a floating search button (FAB) or a search bar to the mobile header on key screens.

### Option 1: Search icon in mobile header (minimal)

Add a search icon (magnifying glass) to the mobile header bar on every screen. Tapping it opens the existing `SearchModal`:

```text
┌───────────────────────────────────────────────────┐
│ ☰  Page Title                      [🔍] [🔔]     │
└───────────────────────────────────────────────────┘
```

### Option 2: Top search bar on list screens (Discord-style)

On screens that show lists (DMs, server list, channel list), add a tappable search bar at the top:

```text
┌───────────────────────────────────────────────────┐
│ Messages                                          │
├───────────────────────────────────────────────────┤
│ [🔍 Search messages and friends...]               │
├───────────────────────────────────────────────────┤
│ DM list...                                        │
└───────────────────────────────────────────────────┘
```

Tapping the bar opens the search modal (not an inline search — keeps implementation simple).

## Implementation

### Minimal approach (Option 1)

Add to the mobile header component that appears across pages:

```tsx
<button
  className="md:hidden w-8 h-8 flex items-center justify-center"
  onClick={() => setSearchOpen(true)}
  aria-label="Search"
>
  <Search className="w-5 h-5" />
</button>
```

Wire `setSearchOpen` to the existing `SearchModal` open state.

### Context-aware search

When opened from different screens, pre-fill the search context:
- From a server channel → search within that server
- From DMs → open `DmLocalSearchModal` instead
- From server list → search server names (client-side filter)

## Acceptance Criteria

- [ ] Search is accessible via a visible button on mobile (not just keyboard shortcut)
- [ ] Opens the existing SearchModal (no new search UI needed)
- [ ] Context-aware: pre-fills server/channel scope when in a server
- [ ] Desktop: no visual changes (keyboard shortcut + header icon sufficient)

## Priority

**P2** — Quality-of-life improvement, not blocking for navigation parity

## Labels

`ux`, `mobile`, `feature`, `search`
