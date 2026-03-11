# Merge Friends into Messages tab (header toggle, not separate bottom tab)

## Problem

Vortex currently gives Friends its own bottom nav tab, using one of 4 precious mobile tab slots. Discord, Fluxer, and most chat apps treat Friends as a sub-section of the Messages/DMs screen — not a top-level destination.

With the proposed 4-tab bottom nav (**Messages / Servers / Notifications / You**), there's no room for a dedicated Friends tab. Friends needs to live inside the Messages tab.

## How Discord Does It

Discord's "Messages" tab has a segmented header:

```text
┌───────────────────────────────────────────────────┐
│ [Messages]  [Friends]                    [+ New]  │
├───────────────────────────────────────────────────┤
│ DM list OR Friends list (based on header toggle)  │
└───────────────────────────────────────────────────┘
```

- Tap "Messages" → DM conversation list
- Tap "Friends" → Online/All/Pending/Blocked tabs with friend management
- The "+" button starts a new DM in both views

## What Exists Today

**DMs page** (`/channels/me`):
- `MeShell` layout with `DMList` sidebar
- DMList has header "DIRECT MESSAGES" + "+" button for new DM
- Separate Friends page at `/channels/friends` with `FriendsSidebar`

**Friends sidebar** (`friends-sidebar.tsx`):
- Full friend management: Online/All/Pending/Blocked tabs
- Add friend form
- Accept/decline/block/remove actions
- Missing: "Message" button on friend entries

## Proposed Solution

### Mobile: Header toggle in DMs page

Add a segmented control to the DMs page header:

```text
/channels/me (Messages selected):
┌───────────────────────────────────────────────────┐
│ [💬 Messages] [👥 Friends]                [+ New] │
├───────────────────────────────────────────────────┤
│ DM List                                           │
│   alice          "see you tomorrow"     2m ago    │
│   bob            "sounds good!"         1h ago    │
│   Dev Group (3)  "pushed the fix"       3h ago    │
└───────────────────────────────────────────────────┘

/channels/me (Friends selected, or /channels/me?tab=friends):
┌───────────────────────────────────────────────────┐
│ [💬 Messages] [👥 Friends]                [+ Add] │
├───────────────────────────────────────────────────┤
│ [Online] [All] [Pending (2)] [Blocked]            │
│                                                   │
│ alice          🟢 Online                          │
│ bob            🔴 Do Not Disturb                  │
│ carol          ⚫ Offline                          │
└───────────────────────────────────────────────────┘
```

### Desktop: Keep Friends as inline content

On desktop, the DM sidebar already shows in a 240px panel. The Friends toggle can be:
- A header segmented control (same as mobile)
- Or keep the existing `/channels/friends` route rendering in the main content area

## Implementation

### 1. Modify `apps/web/components/dm/dm-list.tsx`

Add a segmented control at the top:

```tsx
const [view, setView] = useState<"messages" | "friends">("messages")

return (
  <div className="flex flex-col h-full">
    {/* Header with toggle */}
    <div className="flex items-center px-3 h-12 gap-2">
      <button
        onClick={() => setView("messages")}
        className={cn("text-sm font-semibold", view === "messages" ? "text-white" : "text-muted")}
      >
        Messages
      </button>
      <button
        onClick={() => setView("friends")}
        className={cn("text-sm font-semibold", view === "friends" ? "text-white" : "text-muted")}
      >
        Friends
        {pendingCount > 0 && <span className="ml-1 badge">{pendingCount}</span>}
      </button>
      <div className="flex-1" />
      <NewDmButton />
    </div>

    {/* Content */}
    {view === "messages" ? <DMChannelList /> : <FriendsSidebar />}
  </div>
)
```

### 2. Add "Message" action to friend entries

In `friends-sidebar.tsx`, add a "Message" button that creates/opens a DM:

```tsx
// For accepted friends, add a message action:
<button
  onClick={async () => {
    const res = await fetch("/api/dm/channels", {
      method: "POST",
      body: JSON.stringify({ userIds: [friend.id] }),
    })
    const { channelId } = await res.json()
    router.push(`/channels/me/${channelId}`)
  }}
  title="Message"
>
  <MessageSquare className="w-4 h-4" />
</button>
```

### 3. Pending friend request badge on toggle

Show a count badge on the "Friends" toggle when there are pending incoming requests. This replaces the visibility that the old dedicated Friends tab provided.

### 4. Remove Friends from bottom nav

In the updated `mobile-bottom-tab-bar.tsx`, replace:

```tsx
{ href: "/channels/friends", label: "Friends", icon: Users }
```

with the new tab structure (Messages / Servers / Notifications / You).

### 5. Keep `/channels/friends` route working

Don't delete the route — redirect it to `/channels/me?tab=friends` or render inline. This preserves deep links and browser history.

```tsx
// apps/web/app/channels/friends/page.tsx
import { redirect } from "next/navigation"
export default function FriendsPage() {
  redirect("/channels/me?tab=friends")
}
```

### 6. URL-driven tab state (optional)

Support `?tab=friends` query param so the Friends view is linkable:

```tsx
const searchParams = useSearchParams()
const [view, setView] = useState<"messages" | "friends">(
  searchParams.get("tab") === "friends" ? "friends" : "messages"
)
```

## Acceptance Criteria

- [ ] DMs page has "Messages" / "Friends" toggle in header
- [ ] Toggling between views preserves scroll position
- [ ] Friends tab shows pending count badge
- [ ] "Message" button on accepted friend entries opens/creates DM
- [ ] `/channels/friends` redirects to `/channels/me?tab=friends`
- [ ] Friends tab removed from bottom nav
- [ ] Desktop: both views accessible (sidebar toggle or separate route)
- [ ] Add friend form works in the embedded view

## Priority

**P1** — Required for 4-tab bottom nav (blocks the nav redesign)

## Labels

`ux`, `mobile`, `feature`, `navigation`
