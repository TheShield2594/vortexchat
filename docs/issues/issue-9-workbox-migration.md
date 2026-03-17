# Migrate service worker to Workbox

**Labels:** enhancement

## Context

Currently `sw.js` is hand-rolled. Migrating to Workbox would provide:
- Reliable precaching with revision hashing
- Runtime caching strategies (stale-while-revalidate, network-first, etc.)
- Background sync for offline message queuing
- Automatic service worker update lifecycle

## Source

Previously tracked in `docs/stoat-comparison-report.md` (item #23), now deleted as all other items were completed.

## Acceptance Criteria

- [ ] Replace hand-rolled `sw.js` with Workbox-generated service worker
- [ ] Configure precache manifest for app shell assets
- [ ] Add runtime caching strategies for API routes and static assets
- [ ] Verify offline functionality works correctly
- [ ] Add SW update prompt for users
