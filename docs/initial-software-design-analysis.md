# Initial Software Design Analysis

## Scope & Method
- Re-verified each finding against the current `HEAD` code before applying edits to this report.
- Reviewed monorepo/workspace boundaries and package wiring (`package.json`, `turbo.json`, app package manifests).
- Read key orchestration paths for web request handling and UI composition:
  - `apps/web/app/api/messages/route.ts`
  - `apps/web/app/channels/[serverId]/[channelId]/page.tsx`
  - `apps/web/components/chat/chat-area.tsx`
  - `apps/web/lib/permissions.ts`
- Read signal service entrypoint and room state module:
  - `apps/signal/src/index.ts`
  - `apps/signal/src/rooms.ts`

---

## Executive Assessment

### 1) Separation of concerns
**Verdict: Partial (good boundaries at service/package level, weak boundaries inside several high-traffic modules).**

- **Good:** The repo separates **web app**, **signal service**, and **shared package** via workspaces. Web imports shared permissions via `@vortex/shared` instead of re-defining bits locally (`apps/web/lib/permissions.ts`).
- **Needs work:** `apps/web/app/api/messages/route.ts` combines parsing, validation, permissioning, moderation, persistence, and notification side-effects in one route module. Identifiers showing this breadth include `parsePostMessageRequestBody`, `enforceServerMessagingGuards`, `runServerAutomodChecks`, `insertMessageWithAttachments`, and `POST` handler logic in the same file.
- **Needs work:** `apps/web/components/chat/chat-area.tsx` is a single client component handling view logic + fetch/pagination + offline outbox + URL state + keyboard/search/thread interactions + realtime binding.

### 2) Architectural pattern
**Primary pattern: Layered modular monolith + sidecar service.**

- **Layered web app:** Next.js App Router pages/routes (`app/`) call domain/util libraries (`lib/`) and render UI components (`components/`).
- **Sidecar microservice:** `apps/signal` runs standalone socket.io signaling and integrates with Supabase for auth/voice state.
- **Shared kernel package:** `packages/shared` exports cross-service constants/types (permissions and signaling payload contracts).

### 3) God objects/modules doing too much
**Yes (module-level God modules).**

- `apps/web/app/api/messages/route.ts` (~800 LOC) functions as a multi-responsibility controller/service.
- `apps/web/components/chat/chat-area.tsx` (~1400 LOC) is a UI orchestration God component.
- `apps/signal/src/index.ts` (~277 LOC) centralizes connection lifecycle, auth, all event handlers, voice-state persistence, and helper methods; less severe than the previous two but still concentrated.

### 4) Dependency flow cleanliness (circular dependencies)
**Status: Unable to fully verify with automated graphing in this environment.**

- Attempted circular dependency scan using `npx madge --circular apps/web --extensions ts,tsx` but package fetch failed (registry 403).
- Manual sampling indicates directional flow is mostly clean:
  - Web imports shared (`@vortex/shared`) in `apps/web/lib/permissions.ts`.
  - Signal imports only local `rooms` and third-party deps in `apps/signal/src/index.ts`.
  - No direct `apps/web` ↔ `apps/signal` code import coupling observed.

**What would prove it fully:** a complete static import graph (e.g., madge/dependency-cruiser) run across `apps/web`, `apps/signal`, and `packages/shared` with cycle reporting committed to CI.

### 5) Modularity rating (qualitative score)
**Rating: 6.5 / 10**

**Scoring method:** This is a qualitative reviewer judgement (not a strict arithmetic formula). The bullets below are weighted observations that informed the final 6.5 score.

**Weighted observations:**
- Clear workspace/service boundaries (`apps/web`, `apps/signal`, `packages/shared`).
- Shared abstractions exist for permissions/types (`packages/shared`, `apps/web/lib/permissions.ts`).
- Utility modules exist (`lib/*`) rather than only page-level code.
- Oversized orchestration modules (`messages/route.ts`, `chat-area.tsx`) reduce replaceability/test isolation.
- Query/DTO hydration logic appears duplicated across endpoints/pages.
- No enforced cycle checks in lint config.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Client[Browser Client]
      UI[Next.js React UI\ncomponents/chat/*\ncomponents/layout/*]
      RT[Supabase Realtime + Presence]
      VC[WebRTC PeerConnection]
    end

    subgraph Web[apps/web (Next.js App Router)]
      Pages[app/channels/* pages]
      API[app/api/* route handlers\n(e.g., messages)]
      Lib[lib/* domain utilities\npermissions, automod, push]
    end

    subgraph Shared[packages/shared]
      SharedTypes[permissions + shared TS contracts]
    end

    subgraph Signal[apps/signal]
      SocketIO[socket.io server]
      RoomMgr[RoomManager state]
    end

    subgraph Supa[Supabase]
      Auth[Auth]
      DB[(Postgres)]
      Realtime[Realtime/CDC/Presence]
      Storage[Storage]
    end

    Push[Web Push Provider]

    UI --> Pages
    UI --> API
    UI --> RT
    UI --> VC

    Pages --> Lib
    Pages --> DB

    API --> Lib
    API --> DB
    API --> Auth
    API --> Push

    Lib --> SharedTypes
    Pages --> SharedTypes

    VC --> SocketIO
    SocketIO --> RoomMgr
    SocketIO --> DB
    SocketIO --> Auth

    RT <--> Realtime
    DB --- Realtime

    classDef bottleneck fill:#ffe4b5,stroke:#cc8400,stroke-width:1px;
    API:::bottleneck
    UI:::bottleneck
    SocketIO:::bottleneck
```

### Potential bottlenecks highlighted
1. **`app/api/messages/route.ts`**: high fan-in/fan-out path on every message send/read.
2. **`components/chat/chat-area.tsx`**: large rerender/state surface area for main chat UX.
3. **`apps/signal/src/index.ts`**: single process handles all signaling and DB side effects.

---

## Findings (Structured)

| ID | Finding | Importance (1-10) | Evidence (exact locations) | Why it matters |
|---|---|---:|---|---|
| F1 | API God module in `messages` route | 9 | `apps/web/app/api/messages/route.ts` imports many subsystems at top and defines many responsibilities in one file (`parsePostMessageRequestBody`, `enforceServerMessagingGuards`, `runServerAutomodChecks`, `insertMessageWithAttachments`, `GET`, `POST`). | Harder testing, higher regression risk, longer review cycles for message-path changes. |
| F2 | UI God component in `ChatArea` | 8 | `apps/web/components/chat/chat-area.tsx` carries heavy state refs/hooks and wide imports in one component; includes persistence, realtime, outbox, navigation, and rendering concerns. | Performance and maintainability risk in core UX surface. |
| F3 | Copy-paste / duplicated reply hydration & projection patterns | 7 | Similar message projection and reply hydration in both `apps/web/app/api/messages/route.ts` (`MESSAGE_PROJECTION`, `withReplyTo`) and `apps/web/app/channels/[serverId]/[channelId]/page.tsx` (manual `replyIds` + `replyMap` hydration). | Drift risk (inconsistent payload semantics across endpoints/pages), repeated bug fixes. |
| F4 | Tight coupling of signal transport and persistence side-effects | 6 | In `apps/signal/src/index.ts`, each socket event both broadcasts and mutates Supabase `voice_states` directly in handler branches. | Hard to scale independently (transport throughput tied to DB latency/retries). |
| F5 | Circular dependency guardrails missing in lint/tooling | 5 | `apps/web/eslint.config.mjs` does not include `import/no-cycle` or dependency graph checks; automated madge scan unavailable here. | Hidden cycles can accumulate silently as codebase grows. |

---

## Anti-pattern Audit

### Spaghetti code
- **Observed partially (localized):** not project-wide spaghetti, but **localized complexity knots** in `messages/route.ts` and `chat-area.tsx` where unrelated concerns are interleaved.

### Copy-paste programming
- **Observed:** reply hydration/projection logic repeated in multiple modules instead of centralized query helper.

### God classes/modules
- **Observed:** `messages/route.ts` and `chat-area.tsx`.

### Tight coupling
- **Observed:** signal handlers tightly couple WebSocket event handling to DB writes in same function branches.

### Missing abstractions
- **Observed:** no shared “message query/hydration” service used by both pages and routes; no extracted “message application service” in API layer.

---

## Remediation (drop-in, code-level)

### R1) Extract message route orchestration into focused services (targets F1)
**Importance:** 9/10

Create a directory and move cohesive logic into isolated files:

```ts
// apps/web/lib/messages/validators.ts
export function parsePostMessageRequestBody(body: PostMessageRequestBody) {
  // move existing function unchanged
}

// apps/web/lib/messages/hydration.ts
export const MESSAGE_PROJECTION = `*, author:users!messages_author_id_fkey(*), attachments(*), reactions(*)`
export const REPLY_PROJECTION = `*, author:users!messages_author_id_fkey(*)`
export async function withReplyTo(supabase: ServerSupabaseClient, rows: any[]) {
  // move existing implementation unchanged
}
```

Then in `app/api/messages/route.ts`, replace in-file definitions with imports.

### R2) Split `ChatArea` by concern hooks/components (targets F2)
**Importance:** 8/10

Minimal first split (no behavior change):

```ts
// apps/web/components/chat/hooks/use-chat-scroll.ts
export function useChatScroll(args: { channelId: string; currentUserId: string }) {
  // move scroll refs/state/effects only
}

// apps/web/components/chat/hooks/use-chat-outbox.ts
export function useChatOutbox(args: { channelId: string; currentUserId: string }) {
  // move outbox load/replay/persist only
}
```

In `chat-area.tsx`, keep rendering + composition; import these hooks and remove in-file state/effects.

### R3) Deduplicate reply hydration logic (targets F3)
**Importance:** 7/10

Use one shared helper in both server page and API route:

```ts
// apps/web/lib/messages/hydration.ts
export async function hydrateReplyTo(
  supabase: ServerSupabaseClient,
  rows: Array<{ reply_to_id?: string | null } & Record<string, any>>,
) {
  // same set/map strategy currently duplicated
}
```

Replace manual hydration in `app/channels/[serverId]/[channelId]/page.tsx` with `hydrateReplyTo(...)`.

### R4) Decouple signal DB writes from transport path (targets F4)
**Importance:** 6/10

Low-risk drop-in adjustment: batch/defer DB updates to a queue function.

```ts
// apps/signal/src/voice-state-sync.ts
export function enqueueVoiceStateUpdate(payload: { userId: string; channelId: string; patch: Partial<VoiceState> }) {
  // coalesce by (userId, channelId) and flush at short interval
}
```

In socket handlers, keep emit immediate; replace direct `supabase.from(...).update(...)` with `enqueueVoiceStateUpdate(...)`.

### R5) Add cycle checks to CI/tooling (targets F5)
**Importance:** 5/10

If dependency tool is allowed in environment, add script:

```json
// package.json
{
  "scripts": {
    "dep:cycles:web": "madge --circular apps/web --extensions ts,tsx"
  }
}
```

Then wire `dep:cycles:web` into CI. If external install remains blocked, use an internal script based on `tsconfig` path aliases and `import` parsing.

---

## Verification Gaps / Unable to Verify

1. **Full circular dependency scan:** Unable to verify due package install restriction for `madge` (HTTP 403 during `npx` fetch).
2. **Runtime hot-path latency bottleneck metrics:** No profiling traces were collected in this pass; findings are static-structure based.
3. **Cross-file duplicate logic extent:** Confirmed in sampled high-traffic files; not exhaustively quantified across all route handlers/components.
