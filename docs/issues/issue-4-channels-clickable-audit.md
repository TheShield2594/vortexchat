# Audit & ensure all channels are immediately clickable everywhere

## Problem

There is a perception that channels are "not clickable" on mobile. Investigation shows channels ARE clickable via `onClick` handlers in `channel-sidebar.tsx` (line 849-857), but the UX may create confusion because:

1. **Channel sidebar only appears after navigating into a server** — users may not realize they need to select a server first
2. **On mobile, the channel sidebar is nested inside the server layout** — it's not immediately visible from the bottom nav
3. **Drag-and-drop reordering** (`@dnd-kit/sortable`) may interfere with tap detection on touch devices
4. **No visual tap feedback** — channel items lack `:active` states or ripple effects

## Audit Checklist

- [ ] Verify `onClick` fires reliably on mobile Safari (iOS) and Chrome (Android)
- [ ] Check that `@dnd-kit` `useSortable` doesn't swallow short taps as potential drag starts
- [ ] Add `touch-action: manipulation` to channel items to prevent 300ms tap delay
- [ ] Add visual `:active` feedback (opacity change or background highlight)
- [ ] Ensure channel items have sufficient touch target size (minimum 44x44px per WCAG)
- [ ] Test with VoiceOver/TalkBack screen readers (existing `role="button"` + `tabIndex={0}` is good)

## Affected Files

- `apps/web/components/layout/channel-sidebar.tsx` — ChannelItem component (line ~1230-1260)
- Potentially `apps/web/app/channels/[serverId]/layout.tsx` — ensure channel sidebar is rendered

## Quick Fix

Add to channel items:

```css
/* Prevent dnd-kit from capturing short taps */
.channel-item {
  touch-action: manipulation;
}

/* Visual tap feedback */
.channel-item:active {
  opacity: 0.7;
  transition: opacity 50ms;
}
```

Consider adding a `delay` option to the dnd-kit sortable sensor:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8, // Must drag 8px before activating
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,   // Must hold 200ms before drag starts
      tolerance: 5, // Allow 5px movement during delay
    },
  }),
)
```

## Priority

**P0** — Ensures channels are reliably tappable, prerequisite for navigation improvements

## Labels

`ux`, `mobile`, `bug`, `accessibility`
