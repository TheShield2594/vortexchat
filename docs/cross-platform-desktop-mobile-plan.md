# Cross-Platform Expansion Plan: Desktop + Mobile

## 1) Goals and Non-Goals

### Goals
- Launch a production desktop app (primary target: Electron, optional Tauri track) that supports:
  - Deep links (`vortex://`), OS protocol handlers, and in-app route resolution.
  - System tray presence controls (status, mute/deafen, quick join).
  - Native notifications with click-through navigation.
  - Push-to-talk (PTT) with global hotkey behavior and safe focus handling.
- Launch a production mobile app (React Native + Expo recommended) that supports:
  - Push notifications for DM, mention, call invite, and moderation alerts.
  - Voice call UX with incoming call affordances, reconnect handling, and in-call controls.
  - Attachment capture (camera, gallery, file picker, voice notes) with upload progress.
- Build a shared platform abstraction layer so web/desktop/mobile share core behavior.
- Keep existing web app velocity while introducing new clients.

### Non-Goals (phase 1)
- Full native rewrite of web UI patterns.
- Complex background voice processing when app is terminated.
- Feature parity for every web admin surface at initial mobile release.

---

## 2) Current Baseline (from repository)

- Monorepo already exists with Turbo + workspaces (`apps/*`, `packages/*`).
- Existing apps:
  - `apps/web` (primary product surface).
  - `apps/signal` (signaling service).
- Existing shared package:
  - `packages/shared` currently includes permissions and signaling type contracts.

This structure is suitable for adding `apps/desktop`, `apps/mobile`, and additional `packages/*` for core logic reuse.

---

## 3) Platform Strategy Decision

## Desktop: Electron-first, Tauri-compatible interface

**Recommendation:** ship Electron first for fastest parity with existing web stack and richer ecosystem for tray/PTT/notification integrations. Keep an adapter boundary so a later Tauri implementation can be added with minimal churn.

### Why Electron first
- Faster integration with current React/web app as embedded renderer.
- Mature libraries for global shortcuts, tray, deep links, notifications, auto-updates.
- Lower integration risk for WebRTC-heavy behavior initially.

### Tauri path
- Define a `DesktopShellBridge` interface now.
- Implement Electron provider in milestone 1.
- Optionally implement Tauri provider once parity tests pass and resource profile goals demand it.

## Mobile: React Native + Expo

**Recommendation:** Expo managed workflow with selective native modules via config plugins / EAS builds.

### Why Expo
- Fast iteration, good push tooling (`expo-notifications`), mature media capture modules.
- Easier team onboarding and build/release flow.
- Can eject or add custom native code if call UX constraints require it.

---

## 4) Web API / Feature Abstraction Matrix (cross-platform parity)

Create a package family `packages/platform-*` to abstract browser-only APIs.

| Capability | Web implementation today | Desktop target | Mobile target | Abstraction to add |
|---|---|---|---|---|
| Navigation deep links | URL routing + browser history | OS protocol `vortex://` -> app route | Universal links / custom scheme -> app route | `PlatformLinking` |
| Notifications | Web Notifications API / service worker | Native desktop notification APIs | APNs/FCM via Expo notifications | `PlatformNotifications` |
| Presence/background | Page visibility APIs | Window/tray + process lifecycle | AppState foreground/background | `PlatformLifecycle` |
| Storage | localStorage/indexedDB | file-backed secure store + local DB cache | SecureStore + async storage | `PlatformStorage` |
| Permissions | Browser permissions API | OS-level prompts + app-level settings | Native permission prompts | `PlatformPermissions` |
| Audio devices/PTT | `MediaDevices`, keyboard listeners | native global shortcuts + mic routing | in-app PTT gesture/hardware awareness | `PlatformAudio` |
| Clipboard/share | Clipboard API | native clipboard + share sheet | native clipboard + share sheet | `PlatformShare` |
| File attachments | `<input type=file>` drag/drop | file dialog + pasteboard | camera/gallery/file/document picker | `PlatformAttachments` |
| Realtime reachability | online/offline events | network + process state | network + app state + background limits | `PlatformConnectivity` |
| Window/system UI | DOM only | tray, badges, dock/taskbar, startup | status bar, call UI integration | `PlatformSystemUI` |

### Key APIs/features to isolate immediately
- `window`, `document`, `Notification`, `navigator.mediaDevices`, `localStorage`, `BroadcastChannel`, `serviceWorker`, clipboard/file chooser primitives.
- Any direct usage of keyboard events for PTT and shortcuts.
- Web-only deep-link parsing currently tied to router internals.

---

## 5) Proposed Shared Package / Module Layout

Add packages that separate domain logic from runtime bindings:

- `packages/core-state`
  - App stores (auth, channels, messages, call state, presence).
  - Deterministic reducers + selectors.
  - Offline queue and conflict-resolution policies.
- `packages/core-api`
  - Typed API client wrappers (REST/Supabase abstractions).
  - Retry/backoff, idempotency keys, request instrumentation.
- `packages/core-realtime`
  - Realtime event normalization, socket lifecycle, reconnect state machine.
  - Subscription registry and hydration hooks.
- `packages/core-permissions`
  - App-level permission policies + server role checks (build on `@vortex/shared`).
  - Capability map from OS permission status to feature access.
- `packages/platform-contracts`
  - TypeScript interfaces for all abstractions in section 4.
  - Shared event contracts for shell<->app communication.
- `packages/platform-web`
  - Browser adapters implementing `platform-contracts`.
- `packages/platform-desktop-electron`
  - Electron main/preload bridges + renderer adapters.
- `packages/platform-mobile-expo`
  - Expo/native adapters for notifications, linking, attachments, permissions.
- `packages/ui-kit-cross`
  - Shared design tokens, non-DOM-specific presentational primitives where feasible.

App folders:
- `apps/web` consumes `platform-web`.
- `apps/desktop` hosts shell + embedded web renderer consuming `platform-desktop-electron`.
- `apps/mobile` React Native app consuming `platform-mobile-expo`.

---

## 6) Desktop Technical Plan

### Deep links
- Register protocol handler for `vortex://` and optional HTTPS app links.
- On app cold start:
  - parse incoming URL,
  - stage navigation intent in store,
  - route after auth hydration.
- On warm start:
  - dispatch intent directly to renderer route handler.
- Add integration test matrix for:
  - signed-in, signed-out, expired-session, workspace-missing states.

### Tray
- Tray icon reflects status (`online`, `idle`, `dnd`, `invisible`).
- Tray menu actions:
  - quick mute/deafen toggle,
  - join recent voice channel,
  - set status,
  - quit/log out.
- Background policy:
  - close-to-tray behavior configurable.
  - explicit “fully quit” path for updates/troubleshooting.

### Notifications
- Native notifications from message/call events when app unfocused.
- Click handling maps to channel/thread/call route.
- Respect notification preference hierarchy:
  - user global settings,
  - server/channel overrides,
  - OS-level permission state.

### Push-to-talk behavior
- Two modes:
  - focused-app PTT (existing browser behavior parity),
  - optional global PTT hotkey (desktop-only feature flag).
- Safety constraints:
  - block PTT in password fields / secure input contexts.
  - visual indicator for active transmission.
  - fail-safe timeout to prevent stuck-hotkey transmit.

---

## 7) Mobile Technical Plan

### Push notifications
- Token registration lifecycle:
  - obtain token after auth,
  - bind token to user + device metadata,
  - rotate/revoke on logout or token invalidation.
- Push categories:
  - message/mention,
  - invite,
  - call incoming,
  - moderation/admin alerts.
- Notification action handling:
  - tap to deep-link route,
  - quick reply (phase 2 if supported by module choice).

### Call UX
- Incoming call screen behavior:
  - foreground: in-app modal + ringtone.
  - background: push -> call intent -> app resume call screen.
- In-call controls:
  - mute/deafen, speaker/earpiece, camera toggle, network quality indicator.
- Reconnect model:
  - state machine: connecting -> connected -> degraded -> reconnecting -> failed.

### Attachment capture
- Capture sources:
  - camera photo/video,
  - media library,
  - document picker,
  - voice note recording.
- Upload pipeline:
  - resumable uploads,
  - compression/transcoding profile by network type,
  - explicit size limits + user-facing errors.

---

## 8) Realtime, State, and Permission Architecture

### Realtime
- Introduce unified transport manager in `core-realtime`:
  - websocket/supabase subscriptions lifecycle.
  - heartbeat and stale-peer cleanup.
  - jittered exponential reconnect with auth refresh hooks.
- Normalize all realtime events into domain actions to avoid platform-specific reducers.

### State
- Single domain store model with platform-specific UI shells.
- Persisted slices:
  - auth/session metadata,
  - recent channels/calls,
  - optimistic outbox.
- Hydration gates to prevent route/render races during cold start.

### Permissions
- Merge three layers:
  - server role/channel permissions (`@vortex/shared`),
  - app feature permissions (e.g., “can-start-video”),
  - OS permissions (mic/camera/notifications/files).
- Provide a single `canUse(feature)` API returning:
  - allowed,
  - blocked by policy,
  - blocked by OS permission,
  - blocked by account state.

---

## 9) Migration Strategy

### Phase 0: Inventory + seam extraction (no user-facing change)
- Audit direct web-API usage in `apps/web`.
- Replace hard-coded browser globals with `platform-contracts` calls.
- Keep web adapters as default to preserve behavior.

### Phase 1: Shared core stabilization
- Move API/realtime/state logic from app-specific code to `core-*` packages.
- Add contract tests to lock behavior before adding new clients.

### Phase 2: Desktop shell bring-up
- Create `apps/desktop` with Electron bridge + deep link/tray/notification/PTT MVP.
- Dogfood internally with feature flags.

### Phase 3: Mobile MVP
- Build `apps/mobile` with auth, channel list, DMs, message compose, push receive/open, voice call basic flow, attachment capture.

### Phase 4: Hardening + parity
- Performance budgets, crash/error monitoring, advanced call reliability, notification preference parity.

### Data/backward compatibility
- Keep backend contract stable; add optional fields only.
- Introduce server capability flags so older clients degrade gracefully.

---

## 10) CI/CD Strategy

### CI pipelines (Turbo-aware)
- `lint`, `type-check`, `test` per affected package/app.
- Contract tests for `platform-contracts` and core state/realtime behavior.
- Desktop smoke tests:
  - Electron launch,
  - deep-link route resolution,
  - tray action dispatch.
- Mobile smoke tests:
  - Metro build + type check,
  - E2E happy path (auth -> message -> push-open) on emulator/simulator lanes.

### CD / Release channels
- Web: existing deployment path.
- Desktop:
  - signed artifacts (macOS/Windows/Linux as supported),
  - staged rollout channels: alpha -> beta -> stable,
  - auto-update with rollback guard.
- Mobile:
  - EAS build profiles (dev, preview, production),
  - staged store rollout,
  - OTA updates only for JS-safe changes (no native ABI changes).

### Versioning & compatibility
- Maintain `client_capabilities` handshake with backend.
- Enforce minimum supported client versions for breaking backend shifts.

---

## 11) Milestones, Dependencies, Risks, Acceptance Criteria

## Milestone 1 — Architecture foundations (2–3 weeks)

**Deliverables**
- `platform-contracts` package with adapters for web stubs.
- Inventory report of browser API dependencies.
- Initial `core-state`, `core-api`, `core-realtime`, `core-permissions` skeletons.

**Dependencies**
- Agreement on package boundaries.
- Ownership assignment for core modules.

**Risks**
- Hidden coupling in `apps/web` slows extraction.

**Acceptance criteria**
- Web app behavior unchanged behind abstraction layer.
- New contract tests passing in CI.

## Milestone 2 — Desktop MVP (3–5 weeks)

**Deliverables**
- `apps/desktop` Electron shell.
- Deep links + tray + native notifications.
- PTT parity with focused mode and experimental global mode.

**Dependencies**
- Stable core packages from milestone 1.
- Code signing secrets and release infra.

**Risks**
- OS-specific shortcut/tray edge cases.
- Notification permission inconsistencies by platform.

**Acceptance criteria**
- Deep links route correctly across cold/warm starts.
- Tray actions control presence and voice toggles.
- Notification click opens intended conversation.
- PTT passes regression tests and no stuck-transmit bug in soak test.

## Milestone 3 — Mobile MVP (4–6 weeks)

**Deliverables**
- `apps/mobile` Expo app with auth, messaging basics, push receive/open, attachment capture, voice-call MVP.

**Dependencies**
- Push provider configuration (APNs/FCM credentials).
- Mobile design specifications for call and compose surfaces.

**Risks**
- Background execution limits affecting call invite responsiveness.
- Media upload reliability on poor networks.

**Acceptance criteria**
- Push opens exact DM/channel/thread route.
- User can join/leave voice call and recover from network drop.
- User can capture and upload image/file with progress and failure feedback.

## Milestone 4 — Parity hardening + launch (3–4 weeks)

**Deliverables**
- Reliability/performance tuning, analytics dashboards, crash reporting.
- Release candidate pipelines with staged rollout controls.

**Dependencies**
- Observability instrumentation across all clients.

**Risks**
- Last-mile parity bugs across notification preferences and permissions.

**Acceptance criteria**
- Crash-free session and reconnect-success SLOs met.
- Cross-platform parity checklist signed off for target MVP features.
- Rollback and hotfix runbook validated.

---

## 12) Key Risk Register and Mitigations

- **Realtime divergence across clients**
  - Mitigation: single `core-realtime` state machine + contract tests.
- **Permission complexity (server vs OS vs feature flags)**
  - Mitigation: centralized `canUse(feature)` API and diagnostic logging.
- **PTT reliability on desktop**
  - Mitigation: guardrails, soak tests, emergency mute fail-safe.
- **Mobile call reliability under background constraints**
  - Mitigation: explicit degraded/reconnect UX and push-to-open call intents.
- **Release pipeline complexity**
  - Mitigation: phased channels and automated artifact validation/signing checks.

---

## 13) Suggested Immediate Next Actions (this week)

1. Approve Electron-first + Expo-first decisions (with Tauri fallback path).
2. Create `platform-contracts` and wrap top 10 most-used browser globals.
3. Stand up architecture RFC + ownership matrix for each new package.
4. Build CI scaffolding for contract tests before major code moves.
5. Start desktop deep-link prototype and mobile push token proof-of-concept in parallel.
