# Feature Parity Audit — VortexChat vs. Slack / Teams / Discord / Telegram

> Audited: 2026-03-17
> Auditor: Automated codebase analysis
> Scope: Full codebase scan of apps/web, packages/shared, supabase/migrations, apps/signal

Legend: **Present** = feature exists in that platform | **—** = absent or negligible

Gap severity:
- 🔴 Critical — users will notice its absence immediately
- 🟡 Nice-to-have — improves polish/retention
- 🟢 Intentional skip — out of scope for VortexChat's vision

---

## 1. Messaging

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Markdown (bold, italic, strikethrough, lists) | ✅ GFM via react-markdown + remark-gfm | ✅ | ✅ | ✅ | Parity |
| Code blocks + syntax highlighting | ✅ 40+ languages via prism-react-renderer | ✅ | ✅ | ✅ | Parity |
| Rich-text formatting toolbar (WYSIWYG) | ❌ | ✅ | ✅ | ❌ | 🟡 Slack/Teams have toolbars; Discord doesn't — markdown-only is acceptable |
| @user mentions + autocomplete | ✅ `mention-suggestions.tsx` | ✅ | ✅ | ✅ | Parity |
| @everyone / @here | ✅ MENTION_EVERYONE permission bit | ✅ | ✅ | ✅ | Parity |
| Pinned messages | ✅ `pinned-messages-panel.tsx` | ✅ | ✅ | ✅ | Parity |
| Message editing | ✅ | ✅ | ✅ | ✅ | Parity |
| Message deletion (soft-delete) | ✅ | ✅ | ✅ | ✅ | Parity |
| Typing indicators | ✅ `use-typing.ts` + `typing-indicator.tsx` | ✅ | ✅ | ✅ | Parity |
| Message scheduling | ❌ | ✅ | ✅ | ❌ | 🟡 Slack/Teams have it; Discord doesn't — low priority |
| Draft persistence | ✅ Debounced auto-save to localStorage | ✅ | ✅ | ✅ | Parity |
| Message forwarding | ❌ | ❌ | ✅ | ❌ | 🟢 Only Teams has this — skip |
| Polls | ✅ Poll creator in message input | ✅ | ✅ | ✅ | Parity |
| Link previews / oEmbed | ✅ `link-embed.tsx` + `/api/oembed` with SSRF protection | ✅ | ✅ | ✅ | Parity |
| Slash commands | ✅ App commands with autocomplete | ✅ | ✅ | ✅ | Parity |

---

## 2. Threads & Replies

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Reply to message (inline quote) | ✅ `reply-preview.tsx` | ✅ | ✅ | ✅ | Parity |
| Threaded conversations (panel) | ✅ `thread-panel.tsx`, `thread-list.tsx` | ✅ | ✅ | ✅ | Parity |
| Create thread modal | ✅ `create-thread-modal.tsx` | ✅ | ✅ | ✅ | Parity |
| Thread notification following | ✅ Thread member subscriptions via `/api/threads/[id]/members` | ✅ | ✅ | ✅ | Parity |
| Thread-only / forum channels | ✅ `forum-channel.tsx` with sort (recent/popular/unanswered) | ✅ | ❌ | ✅ | Parity |
| Thread permissions (public/private) | ✅ CREATE_PUBLIC_THREADS + CREATE_PRIVATE_THREADS bits | ✅ | ✅ | ✅ | Parity |
| Thread archival (auto-archive after inactivity) | ❌ `archived` column exists but no auto-archive timer | ✅ | ✅ | ✅ | 🟡 Minor gap — threads never auto-lock |

---

## 3. Reactions & Emoji

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Unicode emoji picker | ✅ frimousse picker with search, categories, skin tones | ✅ | ✅ | ✅ | Parity |
| Emoji reactions on messages | ✅ `reactions-client.ts`, real-time sync | ✅ | ✅ | ✅ | Parity |
| Custom server emoji (upload) | ✅ PNG/GIF/WEBP, 256 KB, management page, attribution | ✅ | ❌ | ✅ | Parity |
| Emoji autocomplete (`:name:`) | ✅ `use-emoji-autocomplete` hook | ✅ | ✅ | ✅ | Parity |
| GIF picker (Giphy/Tenor) | ✅ Dual provider, trending, search, suggestions | ✅ | ✅ | ✅ | Parity |
| Animated emoji / stickers | ❌ GIF emoji upload works, but no sticker packs | ✅ | ✅ | ✅ | 🟡 Sticker packs are a retention feature |
| Super reactions / reaction effects | ❌ | ❌ | ❌ | ✅ (Nitro) | 🟢 Intentional skip — paywall feature |

---

## 4. File & Media

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| File uploads + storage | ✅ Supabase Storage buckets | ✅ | ✅ | ✅ | Parity |
| Image preview + lightbox | ✅ `image-lightbox.tsx` with zoom/pan/gallery nav | ✅ | ✅ | ✅ | Parity |
| Video embed (YouTube, etc.) | ✅ oEmbed + YouTube embed in Stage channels | ✅ | ✅ | ✅ | Parity |
| Inline audio player | ✅ `<audio>` in `message-item.tsx` | ✅ | ✅ | ✅ | Parity |
| Inline video player | ✅ `<video>` in `message-item.tsx` | ✅ | ✅ | ✅ | Parity |
| Malware scanning on uploads | ✅ `attachment-malware.ts`, scan states | ✅ | ✅ | ✅ | Parity |
| Media channel (gallery view) | ✅ `media-channel.tsx` | ❌ | ❌ | ✅ | Parity (matches Discord forum/media) |
| Max file size enforcement | ✅ 10 MB upload route limit in proxy.ts | ✅ | ✅ | ✅ | Parity |

---

## 5. Voice & Video

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Voice channels (always-on) | ✅ WebRTC P2P + LiveKit SFU dual mode | ❌ | ❌ | ✅ | Parity (Discord model) |
| DM voice calls | ✅ `dm-call.tsx`, `incoming-call-ui.tsx` | ✅ | ✅ | ✅ | Parity |
| Multi-participant video | ✅ Camera toggle, 720p, adaptive grid | ✅ | ✅ | ✅ | Parity |
| Voice activity detection | ✅ hark.js speaking indicators | ✅ | ✅ | ✅ | Parity |
| Noise suppression | ✅ Audio pipeline compressor + noise gate; LiveKit native | ✅ | ✅ | ✅ | Parity |
| Stage channels (speaker/audience) | ✅ `stage` channel type, request-to-speak | ❌ | ❌ | ✅ | Parity |
| Voice intelligence (transcripts + summaries) | ✅ STT provider, consent, retention cron | ❌ | ✅ | ❌ | **Ahead** of Slack/Discord |
| Video background blur/virtual BG | ❌ | ✅ | ✅ | ❌ | 🟡 Teams/Slack have it; Discord doesn't |
| Hand raise (general voice) | ❌ Only stage "request to speak" | ✅ | ✅ | ❌ | 🟡 Only needed if VortexChat targets meetings |
| Voice reconnection | ✅ `voice-reconnection-manager.ts` | ✅ | ✅ | ✅ | Parity |

---

## 6. Screen Share

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Screen sharing (getDisplayMedia) | ✅ Separate screen stream track | ✅ | ✅ | ✅ | Parity |
| Spotlight / focus view | ✅ Click to enlarge, compact tile view | ✅ | ✅ | ✅ | Parity |
| Annotation / drawing on screen | ❌ | ❌ | ✅ | ❌ | 🟢 Teams-only feature — skip |
| Multi-presenter (concurrent shares) | ❌ One share at a time | ❌ | ✅ | ❌ | 🟢 Teams-only — skip |
| Audio sharing with screen | ✅ `audio: true` in getDisplayMedia + track forwarding | ✅ | ✅ | ✅ | Parity |
| Presenter controls (pause, switch window) | ✅ Toggle on/off; auto-stop on track end | ✅ | ✅ | ✅ | Parity |

---

## 7. Search

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Full-text message search | ✅ Postgres `websearch_to_tsquery` | ✅ | ✅ | ✅ | Parity |
| Filter by user (`from:`) | ✅ | ✅ | ✅ | ✅ | Parity |
| Filter by date (`before:/after:`) | ✅ | ✅ | ✅ | ✅ | Parity |
| Filter by content type (`has:`) | ✅ `has:link`, `has:image`, `has:file` | ✅ | ✅ | ✅ | Parity |
| Cross-channel search | ✅ Server-wide scope | ✅ | ✅ | ✅ | Parity |
| Saved searches / search history | ❌ | ✅ | ❌ | ❌ | 🟡 Slack-only — nice-to-have |
| DM local search | ✅ `dm-local-search-modal.tsx` | ✅ | ✅ | ✅ | Parity |
| Quick switcher | ✅ `quickswitcher-modal.tsx` (Ctrl+K) | ✅ | ✅ | ✅ | Parity |

---

## 8. Notifications

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Web Push (VAPID) | ✅ `push.ts`, service worker | ✅ | ✅ | ✅ | Parity |
| Push permission soft-ask | ✅ 60s delay, contextual prompt | ✅ | ✅ | ❌ | **Ahead** of Discord |
| Per-channel notification mode | ✅ `notificationModes` with mute per channel | ✅ | ✅ | ✅ | Parity |
| Notification preferences (mentions, replies, etc.) | ✅ 4-level hierarchy, `notification-preferences` API | ✅ | ✅ | ✅ | Parity |
| DND / status-based suppression | ✅ `dnd` user status | ✅ | ✅ | ✅ | Parity |
| Notification schedule (quiet hours) | ✅ `quiet-hours.ts` + settings UI | ✅ | ✅ | ✅ | Parity |
| App badge (unread count) | ✅ `setAppBadge()` via service worker | ✅ | ✅ | ✅ | Parity |
| Desktop notification sounds | ✅ Sound toggle in settings | ✅ | ✅ | ✅ | Parity |
| Mobile push (native app) | ❌ PWA push only | ✅ | ✅ | ✅ | 🟡 PWA push covers most cases; native app is separate effort |

---

## 9. Bots & Integrations

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Incoming webhooks | ✅ Per-channel webhooks, token-based posting | ✅ | ✅ | ✅ | Parity |
| Outgoing webhooks | ❌ | ✅ | ✅ | ❌ | 🟡 Useful for Zapier/Make integration |
| Slash commands (app-based) | ✅ App command execution + autocomplete | ✅ | ✅ | ✅ | Parity |
| App install catalog | ✅ `apps-tab.tsx`, `/api/servers/[id]/apps` | ✅ | ✅ | ✅ | Parity |
| OAuth app installs | ❌ Internal app model only | ✅ | ✅ | ✅ | 🟡 No third-party OAuth app marketplace |
| Public bot SDK / API docs | ❌ OpenAPI spec exists but internal only | ✅ | ✅ | ✅ | 🔴 Developers can't build third-party bots |
| Zapier / Make connector | ❌ | ✅ | ✅ | ✅ | 🟡 Depends on outgoing webhooks + public API |
| System/AutoMod bot | ✅ Welcome messages, automod actions | ✅ | ❌ | ✅ | Parity |

---

## 10. Channels & Organization

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Text channels | ✅ | ✅ | ✅ | ✅ | Parity |
| Voice channels | ✅ | ❌ | ❌ | ✅ | Parity (Discord model) |
| Category grouping | ✅ `category` channel type, collapsible | ✅ | ✅ | ✅ | Parity |
| Announcement channels | ✅ `announcement-channel.tsx` — restricted posting | ✅ | ✅ | ✅ | Parity |
| Forum / Q&A channels | ✅ `forum-channel.tsx` — post list, sort, drill-down | ❌ | ❌ | ✅ | Parity |
| Media channels (gallery) | ✅ `media-channel.tsx` | ❌ | ❌ | ✅ | Parity |
| Stage channels | ✅ Speaker/audience model | ❌ | ❌ | ✅ | Parity |
| Channel reordering | ✅ `reorder_channels` RPC | ✅ | ✅ | ✅ | Parity |
| Channel permissions overrides | ✅ `channel-permissions-editor.tsx` | ✅ | ✅ | ✅ | Parity |
| Channel archiving | ❌ `archived` field in threads only; no channel archive | ✅ | ✅ | ❌ | 🟡 Slack/Teams have it — useful for cleanup |
| Temporary channels (auto-expire) | ✅ Migration 00016 | ❌ | ❌ | ❌ | **Ahead** |
| Sub-channels / sections | ❌ | ✅ | ✅ | ❌ | 🟢 Slack "Sections" — low adoption, skip |

---

## 11. Server / Workspace Management

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Server creation + invite codes | ✅ | ✅ | ✅ | ✅ | Parity |
| Invite expiry + max uses | ✅ Multiple expire options (30m–7d), use limits | ✅ | ✅ | ✅ | Parity |
| Server discovery (public directory) | ✅ `/channels/discover` | ❌ | ❌ | ✅ | Parity |
| Server templates (import/export) | ✅ 4 built-in templates, JSON import/export | ❌ | ❌ | ✅ | **Ahead** |
| Audit logs | ✅ `audit-log-page.tsx`, emoji/moderation/role events | ✅ | ✅ | ✅ | Parity |
| Role management (bitmask permissions) | ✅ 20-bit Discord-style bitmask | ✅ | ✅ | ✅ | Parity |
| Permission simulator | ✅ `permission-simulator.tsx` | ❌ | ❌ | ❌ | **Ahead** |
| Data export (GDPR) | ✅ `GET /api/users/export` + settings UI | ✅ | ✅ | ✅ | Parity |
| SSO / SAML | ❌ OAuth connections only | ✅ | ✅ | ❌ | 🟡 Enterprise feature — depends on target market |
| Vanity invite URL | ❌ | ✅ | ❌ | ✅ | 🟡 Branding feature for large communities |
| Server boosting / premium tiers | ❌ | ✅ | ❌ | ✅ | 🟢 Intentional skip — "all features free" philosophy |

---

## 12. Moderation

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Ban / kick members | ✅ BAN_MEMBERS + KICK_MEMBERS bits | ✅ | ✅ | ✅ | Parity |
| Member timeout | ✅ MODERATE_MEMBERS + `/timeout` API | ✅ | ❌ | ✅ | Parity |
| AutoMod keyword filters | ✅ `keyword_filter` + `regex_filter` triggers | ❌ | ❌ | ✅ | Parity |
| Anti-spam (mention/link/rapid) | ✅ Mention spam, link spam, rapid message detection | ❌ | ❌ | ✅ | Parity |
| Content screening (review queue) | ✅ Accept/reject queue | ❌ | ❌ | ✅ | Parity |
| Moderation timeline | ✅ Full timeline per member | ❌ | ❌ | ❌ | **Ahead** |
| Report system + appeals | ✅ `report-modal.tsx`, `/appeals` | ❌ | ❌ | ✅ | Parity |
| Raid protection (auto-detect) | ❌ Rapid-message as proxy only | ❌ | ❌ | ✅ | 🟡 Discord has explicit raid mode; low priority for smaller communities |
| Verification levels (phone, email age) | ❌ Email verified only | ❌ | ❌ | ✅ | 🟡 Discord-specific — useful for large public servers |
| AutoMod actions (quarantine, timeout, alert) | ✅ Block, quarantine, timeout, warn, alert_channel | ❌ | ❌ | ✅ | Parity |

---

## 13. Accessibility

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Keyboard shortcuts | ✅ 12+ shortcuts, `keyboard-shortcuts-modal.tsx` | ✅ | ✅ | ✅ | Parity |
| Focus trap in modals | ✅ `focus-trap.ts` | ✅ | ✅ | ✅ | Parity |
| ARIA labels | ✅ Present on buttons, tabs, dialogs | ✅ | ✅ | ✅ | Parity |
| Screen reader optimization | ✅ `aria-live` regions + live announcements in `chat-area.tsx` | ✅ | ✅ | ⚠️ | Parity |
| High contrast mode | ❌ Saturation toggle only | ✅ | ✅ | ❌ | 🟡 Slack/Teams have it; Discord doesn't |
| Font scaling | ✅ Small / Normal / Large | ✅ | ✅ | ✅ | Parity |
| Reduced motion support | ✅ `prefers-reduced-motion` respected | ✅ | ✅ | ✅ | Parity |
| Link/content skip navigation | ❌ | ✅ | ✅ | ❌ | 🟡 Important for keyboard-only users |

---

## 14. Mobile / PWA

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| Installable PWA (manifest + SW) | ✅ Multi-strategy caching | ✅ | ✅ | ❌ | Parity |
| Offline banner + outbox | ✅ FSM-based, localStorage queue | ✅ | ✅ | ✅ | Parity |
| Mobile bottom tab bar | ✅ Responsive `md:` breakpoint | ✅ | ✅ | ✅ | Parity |
| Mobile back-button handling | ✅ Two-entry history stack | ✅ | ✅ | ✅ | Parity |
| Splash / skeleton screens | ✅ Shimmer, reduced-motion | ✅ | ✅ | ✅ | Parity |
| SW update detection | ✅ Hourly polling + toast | ✅ | ✅ | ✅ | Parity |
| iOS splash screens | ✅ 8 device sizes | ✅ | ✅ | ❌ | Parity |
| Web Share API | ✅ `navigator.share()` in context menu | ✅ | ✅ | ❌ | Parity |
| Input modes (`inputmode`) | ✅ Search, email, numeric | ✅ | ✅ | ❌ | Parity |
| Native mobile app | ❌ PWA only | ✅ | ✅ | ✅ | 🟢 Intentional — PWA-first strategy |
| Push on PWA (iOS 16.4+) | ✅ VAPID-based | ❌ | ❌ | ❌ | **Ahead** on PWA push |

---

## 15. API & Developer Tools

| Feature | VortexChat | Slack | Teams | Discord | Notes / Gap Severity |
|---|---|---|---|---|---|
| REST API (internal) | ✅ Full Next.js API routes | ✅ | ✅ | ✅ | Parity |
| OpenAPI spec | ✅ `/api/docs` (authenticated) | ✅ | ✅ | ❌ | Parity |
| Public developer API / bot token auth | ❌ Session-cookie only | ✅ | ✅ | ✅ | 🔴 No way for external devs to build integrations |
| Bot SDK / library | ❌ | ✅ | ✅ | ✅ | 🔴 Blocks ecosystem growth |
| Webhook (incoming) | ✅ Per-channel token | ✅ | ✅ | ✅ | Parity |
| Webhook (outgoing / events) | ❌ | ✅ | ✅ | ❌ | 🟡 Needed for event-driven integrations |
| Embed API (widget for websites) | ❌ | ❌ | ❌ | ✅ | 🟢 Discord-specific |
| Custom status / rich presence | ✅ Status message + emoji | ✅ | ✅ | ✅ | Parity |
| OAuth2 for third-party apps | ❌ | ✅ | ✅ | ✅ | 🟡 Needed for app ecosystem |
| Rate limiting on API | ✅ Upstash Redis-backed | ✅ | ✅ | ✅ | Parity |

---

## Top 10 Gaps — Prioritized by User Impact vs. Implementation Effort

| Rank | Gap | Severity | Impact | Effort | Rationale |
|---|---|---|---|---|---|
| **1** | **Inline audio/video player** | ✅ Done | High | Low | `<audio>`/`<video>` in `message-item.tsx` |
| **2** | **Screen share with system audio** | ✅ Done | High | Low | `audio: true` in `getDisplayMedia()` + track forwarding |
| **3** | **Notification schedule (quiet hours)** | ✅ Done | High | Medium | `quiet-hours.ts` + migration + settings UI |
| **4** | **Screen reader `aria-live` regions for chat** | ✅ Done | Medium | Low | `aria-live` + live announcements in `chat-area.tsx` |
| **5** | **Data export (GDPR compliance)** | ✅ Done | High | Medium | `GET /api/users/export` + settings UI |
| **6** | **Public bot API + token auth** | 🔴 | High | High | Introduce bot tokens, separate from user sessions. Critical for ecosystem growth but significant work. ~1-2 weeks. |
| **7** | **Thread auto-archive** | 🟡 | Medium | Low | Add a cron job to mark threads as archived after N days of inactivity. `archived` column already exists. ~4 hours. |
| **8** | **Outgoing webhooks / event subscriptions** | 🟡 | Medium | Medium | Fire HTTP callbacks on message/member/reaction events. Enables Zapier/Make without a full bot API. ~2-3 days. |
| **9** | **Channel archiving** | 🟡 | Medium | Low | Add `archived` boolean to channels table, hide from sidebar, restrict posting. ~4 hours. |
| **10** | **Sticker packs** | 🟡 | Low | Medium | Add sticker upload/management alongside existing custom emoji system. Retention feature. ~2-3 days. |

### All 🟡 Nice-to-Have Gaps (with implementation plans)

Full implementation plans for all gaps below are in [critical-gap-implementation-plans.md](./critical-gap-implementation-plans.md).

| # | Gap | Severity | Complexity | Plan Section |
|---|---|---|---|---|
| 7 | Thread auto-archive | 🟡 | S | Gap 7 — cron job, columns already exist |
| 8 | Outgoing webhooks / event subscriptions | 🟡 | M | Gap 8 — new table + dispatch pipeline |
| 9 | Channel archiving | 🟡 | S | Gap 9 — boolean column + sidebar/input gating |
| 10 | Sticker packs | 🟡 | M | Gap 10 — extends emoji system |
| 11 | Message scheduling | 🟡 | M | Gap 11 — DB table + cron job |
| 12 | Rich-text formatting toolbar | 🟡 | S | Gap 12 — markdown insertion, no new deps |
| 13 | Video background blur | 🟡 | M | Gap 13 — MediaPipe WASM (~2MB), CPU-heavy |
| 14 | Hand raise (general voice) | 🟡 | S | Gap 14 — signaling event, no new perms |
| 15 | Saved searches | 🟡 | S | Gap 15 — localStorage, no migration |
| 16 | Mobile push (native app) | 🟡 | L | Gap 16 — deferred (Capacitor wrapper) |
| 17 | Zapier/Make connector | 🟡 | S | Gap 17 — automatic once #8 built |
| 18 | OAuth2 for third-party apps | 🟡 | L | Gap 18 — OAuth2 server, depends on #6 |
| 19 | SSO / SAML | 🟡 | M | Gap 19 — Supabase Auth native support |
| 20 | Vanity invite URLs | 🟡 | S | Gap 20 — single column + route |
| 21 | Raid protection | 🟡 | M | Gap 21 — extends automod system |
| 22 | Verification levels | 🟡 | S | Gap 22 — server setting + join gate |
| 23 | High contrast mode | 🟡 | S | Gap 23 — CSS variable overrides |
| 24 | Skip navigation links | 🟡 | S | Gap 24 — standard HTML skip links |

---

## Areas Where VortexChat Is **Ahead**

| Feature | VortexChat | Competitors |
|---|---|---|
| Voice intelligence (transcripts + summaries) | ✅ Full pipeline with consent | Only Teams has similar |
| Permission simulator | ✅ Test permissions before applying | Nobody else has this |
| Server templates (import/export) | ✅ 4 built-in + JSON portability | Discord has basic templates; no import/export |
| Moderation timeline (per-member) | ✅ Full action history | Nobody else has this |
| Temporary channels (auto-expire) | ✅ | Nobody else has this |
| PWA push on iOS | ✅ VAPID + SW-based | Competitors rely on native apps |
| All features free (no paywall) | ✅ | Slack/Discord/Teams gate features |

---

*This audit should be re-run quarterly or after major feature sprints.*
*Last updated: 2026-03-17 — 🔴 Gaps 1–5 implemented, 🟡 implementation plans added.*
