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

---

*Last updated: 2026-03-11*
