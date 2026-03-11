# Build real "You" profile/settings page for mobile

## Problem

The `/channels/profile` page is a placeholder:

```tsx
// apps/web/app/channels/profile/page.tsx
<p>Open profile settings from the user panel to customize your account.</p>
```

On mobile, users who tap the "Profile" bottom tab see a dead-end. The actual profile editing is buried behind the UserPanel context menu in the DM sidebar, which opens a modal (`ProfileSettingsModal`). This is undiscoverable on mobile.

Discord's "You" tab provides a full-screen profile hub with: avatar, status, display name, account settings, appearance, notifications, voice settings, and logout — all in one scrollable page.

## What Already Exists

Vortex already has all the settings UI built — it's just not wired to the bottom nav:

| Feature | Component | Current Location |
|---------|-----------|-----------------|
| Profile edit (avatar, name, bio, banner) | `ProfileSettingsModal` | Modal via UserPanel context menu |
| Appearance settings | `appearance/page.tsx` | `/settings/appearance` |
| Notification preferences | `notifications-settings-page.tsx` | `/settings/notifications` |
| Voice & video | `voice/page.tsx` | `/settings/voice` |
| Security (2FA, sessions) | `security/page.tsx` | `/settings/security` |
| Custom status | In ProfileSettingsModal | Modal tab |
| Status selector (online/idle/dnd) | UserPanel | Context menu |
| Logout | UserPanel | Context menu |

## Proposed Solution

Rename the bottom tab from "Profile" to "You" and build a real page that surfaces all of this:

```
/channels/you (mobile full-page):
┌───────────────────────────────────────────────────┐
│ You                                               │
├───────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐ │
│  │  [Avatar]  DisplayName                       │ │
│  │            @username                         │ │
│  │            🟢 Online · "Working on stuff"    │ │
│  │            [Set Status] [Edit Profile]       │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ── Quick Actions ─────────────────────────────── │
│  Status          Online                        >  │
│  Custom Status   Working on stuff              >  │
│                                                   │
│  ── Settings ──────────────────────────────────── │
│  My Profile                                    >  │
│  Appearance                                    >  │
│  Notifications                                 >  │
│  Voice & Video                                 >  │
│  Security & Privacy                            >  │
│  Keybinds                                      >  │
│                                                   │
│  ── Account ───────────────────────────────────── │
│  [Log Out]                                        │
│                                                   │
├───────────────────────────────────────────────────┤
│ [💬 Messages] [📡 Servers] [🔔 Notif] [👤 You]   │
└───────────────────────────────────────────────────┘
```

## Implementation

### 1. New route: `apps/web/app/channels/you/page.tsx`

Build a scrollable page that shows:
- **Profile card**: Avatar, display name, username, current status, status message
- **Quick actions**: Set status (online/idle/dnd/invisible), set custom status — use inline selectors, not modals
- **Settings links**: Navigate to existing `/settings/*` pages
- **Log out button**

The profile card and status selector can reuse existing components:
- Avatar from `@/components/ui/avatar`
- Status from UserPanel's status logic
- Settings links reuse `SettingsSidebar`'s navigation items

### 2. Update bottom tab: `mobile-bottom-tab-bar.tsx`

```tsx
// Change:
{ href: "/channels/profile", label: "Profile", icon: UserRound }
// To:
{ href: "/channels/you", label: "You", icon: UserRound }
```

### 3. Redirect old route

```tsx
// apps/web/app/channels/profile/page.tsx
import { redirect } from "next/navigation"
export default function ProfilePage() {
  redirect("/channels/you")
}
```

### 4. Desktop behavior

On desktop (≥768px), `/channels/you` can either:
- Render the same page in the main content area (simple)
- Redirect to `/settings/profile` (keeps existing desktop flow)

## Acceptance Criteria

- [ ] "You" tab in bottom nav navigates to a real page
- [ ] Profile card shows avatar, display name, username, status
- [ ] Can change presence status (online/idle/dnd/invisible) without opening a modal
- [ ] Can set/clear custom status
- [ ] Links to all settings pages work and navigate correctly
- [ ] Log out button works
- [ ] Old `/channels/profile` redirects to `/channels/you`
- [ ] Desktop: existing settings flow unaffected

## Priority

**P1** — Required for Discord mobile parity

## Labels

`ux`, `mobile`, `feature`, `profile`
