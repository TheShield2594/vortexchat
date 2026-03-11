# MVP Core Features — Gap Tracker

> Single source of truth for Tier 1 / Tier 2 feature gaps.
> Updated as features are completed during the hardening sprint.

## Emoji System

| Feature | Status | Notes |
|---------|--------|-------|
| Custom emoji upload (PNG/GIF/WEBP, 256 KB) | Done | `POST /api/servers/[serverId]/emojis` |
| Emoji autocomplete (`:name:`) | Done | `use-emoji-autocomplete` hook |
| Emoji management page in server settings | Done | `EmojisTab` in server-settings-modal |
| Emoji attribution — uploader name & date | Done | API returns `uploader` join; shown in management UI |
| Audit logging for emoji upload/delete | Done | `audit_logs` entries with `emoji_uploaded` / `emoji_deleted` actions |
| CDN cache-bust on emoji delete | Done | `CDN-Cache-Control: no-store` header on DELETE response |

## GIF / Media Picker

| Feature | Status | Notes |
|---------|--------|-------|
| GIF search (Giphy) | Done | `/api/gif/search` with server-side caching |
| Trending / featured GIFs section | Done | Shows "Trending" header when browsing without a query |
| Search autocomplete suggestions | Done | `/api/gif/suggestions` — Giphy related tags / Tenor autocomplete |
| Dual-provider support (Giphy + Tenor) | Done | `lib/gif-provider.ts` — Tenor preferred when configured (free) |
| Separate "memes" picker tab | Gap | Low priority — could add as third picker tab |

## Voice / WebRTC

| Feature | Status | Notes |
|---------|--------|-------|
| Voice channels | Done | Socket.IO signal server + WebRTC |
| Compact voice view | Done | Recent addition |

## Moderation

| Feature | Status | Notes |
|---------|--------|-------|
| Audit log viewer | Done | `/moderation/timeline` |
| Role management | Done | CRUD with permission bitmasks |
| Content screening | Done | Accept/reject queue |

## PWA / Mobile

| Feature | Status | Notes |
|---------|--------|-------|
| Installable manifest + service worker | Done | `manifest.json`, `sw.js` with multi-strategy caching |
| Push notifications (Web Push VAPID) | Done | All users, 4-level settings hierarchy |
| Push permission soft-ask | Done | 60s delay, contextual prompt |
| Offline banner + connection state machine | Done | `use-connection-status` FSM, color-coded banner |
| Message outbox (offline queue) | Done | localStorage-persisted, flushes on reconnect |
| Mobile bottom tab bar + drawer nav | Done | Responsive `md:` breakpoint with hysteresis |
| Mobile back-button handling | Done | Two-entry history stack prevents PWA exit |
| Branded splash + skeleton screens | Done | Shimmer animation, respects reduced-motion |
| SW update detection + toast | Done | Hourly polling, "New version available" toast |
| iOS splash screens | Done | 8 device sizes, SVG |
| App badge for unread mentions | Done | `use-tab-unread-title` → SW `setAppBadge()` |
| Web Share API | Done | `navigator.share()` in message context menu |
| `inputmode` on all inputs | Done | `search`, `email`, `numeric` where appropriate |
| `viewport-fit=cover` + `interactive-widget` | Done | Safe-area insets + keyboard resize |
| `format-detection: telephone=no` | Done | Prevents iOS auto-linking phone numbers |

---

*Last updated: 2026-03-11*
