# Add swipe-back gesture from channel view to channel list (mobile)

**Labels:** enhancement

## Context
On mobile, navigating back from a channel to the channel list requires tapping the back button. A swipe-back gesture would feel more native and reduce friction.

## Source
Previously tracked in `docs/navigation-ux-analysis.md`, now deleted as the overall mobile navigation approach (Option A guild rail) was implemented.

## Acceptance Criteria
- [ ] Implement swipe-right gesture on channel view to navigate back to channel list
- [ ] Add appropriate swipe threshold and animation
- [ ] Ensure it doesn't conflict with message swipe-to-reply or other horizontal gestures
