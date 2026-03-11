# Code Duplication Analysis — VortexChat

**Date:** 2026-03-11
**Scope:** Full codebase (`apps/web`, `apps/signal`, `packages/shared`)
**Total source files analyzed:** ~190 TypeScript/TSX files

---

## Executive Summary

| Category | Instances | Est. duplicate LOC | Top severity |
|---|---|---|---|
| API route auth/error boilerplate | 150+ | ~900 | High |
| Modal/component boilerplate | 60+ | ~400 | Medium |
| Data constants (STATUS_OPTIONS) | 4 identical copies | ~20 | Medium |
| Signal server room logic | 3 classes, 2 near-identical | ~160 | High |
| Hook subscription/cleanup patterns | 12+ hooks | ~300 | Medium |
| localStorage helpers | 2 copies | ~30 | Low |

**Estimated overall duplication rate: ~12–15%** of non-test, non-config source code.

---

## Finding 1 — API Route Auth + Error Boilerplate

**Importance: 9/10**

### What

The following 3-line block is copy-pasted into **50+ API route handlers**:

```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

Similarly, **50+ occurrences** of:

```typescript
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```

And **15+ occurrences** of JSON body parsing:

```typescript
let body: unknown
try { body = await req.json() }
catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }) }
```

### Affected files (sample — full list is 90+ route files)

| File | Auth check lines | Error response lines |
|---|---|---|
| `app/api/friends/route.ts` | 11, 59, 188, 294 | 28, 72, 144, 214, 262, 316 |
| `app/api/messages/route.ts` | 451, 502 | 488, 661 |
| `app/api/servers/[serverId]/bans/route.ts` | 19, 62, 177 | 50, 101, 112, 127, 213 |
| `app/api/appeals/route.ts` | 12 | 20, 82, 87, 92, 114, 125, 140, 157 |
| `app/api/dm/channels/route.ts` | 8, 120 | 16, 44, 153, 185, 198 |
| `app/api/threads/route.ts` | 8, 59 | 25, 77, 88 |
| `app/api/reports/route.ts` | 31, 145, 214 | 129, 180, 194, 277 |

### Remediation

**Created: `apps/web/lib/utils/api-helpers.ts`**

```typescript
import { requireAuth, parseJsonBody, dbError, forbidden, notFound } from "@/lib/utils/api-helpers"

export async function POST(req: NextRequest) {
  const { supabase, user, error } = await requireAuth()
  if (error) return error

  const { data: body, error: parseError } = await parseJsonBody(req)
  if (parseError) return parseError

  const { error: dbErr } = await supabase.from("messages").insert(/* ... */)
  const errResp = dbError(dbErr)
  if (errResp) return errResp

  // ...
}
```

**Effort:** Low — mechanical find-and-replace per route. Each route takes ~2 min.
**Risk:** Low — behaviour is identical, just extracted.

---

## Finding 2 — Audit Log Insertion Pattern

**Importance: 7/10**

### What

15+ routes contain near-identical `audit_logs` insert blocks:

```typescript
await supabase.from("audit_logs").insert({
  server_id: serverId,
  actor_id: user.id,
  action: "member.ban",
  target_id: targetUserId,
  target_type: "user",
  changes: { reason },
})
```

### Affected files

| File | Lines |
|---|---|
| `app/api/appeals/route.ts` | 131–138 |
| `app/api/appeals/[appealId]/route.ts` | 177–184 |
| `app/api/channels/[channelId]/route.ts` | 166–173 |
| `app/api/messages/route.ts` | 306–319, 342–349, 368–376 |
| `app/api/servers/[serverId]/members/[userId]/route.ts` | 137–144 |
| `app/api/servers/[serverId]/members/route.ts` | 212–219 |
| `app/api/servers/[serverId]/moderation/route.ts` | 100–107 |
| `app/api/servers/[serverId]/bans/route.ts` | 157–164 |
| `app/api/servers/[serverId]/automod/route.ts` | 102–109 |
| `app/api/reports/route.ts` | 281–293 |

### Remediation

**Created: `insertAuditLog()` in `apps/web/lib/utils/api-helpers.ts`**

```typescript
import { insertAuditLog } from "@/lib/utils/api-helpers"

await insertAuditLog(supabase, {
  server_id: serverId,
  actor_id: user.id,
  action: "member.ban",
  target_id: targetUserId,
  target_type: "user",
  changes: { reason },
})
```

**Effort:** Low
**Risk:** Low

---

## Finding 3 — Permission Check Duplication Across Auth Modules

**Importance: 8/10**

### What

Three separate files implement overlapping permission-fetching logic:

| File | Function | What it does |
|---|---|---|
| `lib/server-auth.ts:22` | `aggregateMemberPermissions()` | Bitwise-ORs `member_roles` |
| `lib/server-auth.ts:68` | `requireServerPermission()` | Auth + fetch server + fetch member roles + check permission |
| `lib/permissions.ts:36` | `getMemberPermissions()` | Fetch server + fetch member roles + fetch default role — 3-way Promise.all |
| `lib/moderation-auth.ts:12` | `requireModerator()` | Auth + fetch `server_members` + aggregate + check BAN/ADMIN |

`requireServerPermission()` (server-auth.ts:68) and `getMemberPermissions()` (permissions.ts:36) both:
1. Fetch the server to get `owner_id`
2. Fetch `member_roles` with joined `roles(permissions)`
3. Fetch the default role
4. Aggregate via bitwise OR

They differ only in error handling style (return NextResponse vs throw).

Additionally, `lib/moderation-auth.ts:5` re-declares `BAN_MEMBERS = 16` and `ADMINISTRATOR = 128` as local constants, while `packages/shared/src/index.ts` already exports `PERMISSIONS.BAN_MEMBERS` (= 16) and `PERMISSIONS.ADMINISTRATOR` (= 128).

### Remediation

1. **`requireServerPermission`** should call `getMemberPermissions` internally instead of reimplementing the same three queries.
2. **`requireModerator`** should call `requireServerPermission(serverId, "BAN_MEMBERS")` from `server-auth.ts` instead of re-fetching.
3. **`moderation-auth.ts:5-6`** — delete local `BAN_MEMBERS`/`ADMINISTRATOR` constants, import from `@vortex/shared`.

```typescript
// moderation-auth.ts — after fix
import { PERMISSIONS } from "@vortex/shared"
import { requireServerPermission } from "@/lib/server-auth"

export function canModerate(permissions: number): boolean {
  return (permissions & PERMISSIONS.BAN_MEMBERS) !== 0
      || (permissions & PERMISSIONS.ADMINISTRATOR) !== 0
}

export async function requireModerator(serverId: string) {
  return requireServerPermission(serverId, "BAN_MEMBERS")
}
```

**Effort:** Medium — need to verify all call-sites match the return shape.
**Risk:** Medium — moderation routes depend on exact return type (`{ error, user, supabase, permissions }`).

---

## Finding 4 — STATUS_OPTIONS Array (4 Identical Copies)

**Importance: 6/10**

### What

The exact same array is defined in **4 files**:

```typescript
const STATUS_OPTIONS = [
  { value: "online", label: "Online", color: "var(--theme-success)" },
  { value: "idle", label: "Idle", color: "var(--theme-warning)" },
  { value: "dnd", label: "Do Not Disturb", color: "var(--theme-danger)" },
  { value: "invisible", label: "Invisible", color: "var(--theme-presence-offline)" },
]
```

### Affected files

| File | Line |
|---|---|
| `components/settings/profile-settings-page.tsx` | 16 |
| `components/modals/profile-settings-modal.tsx` | 28 |
| `components/layout/user-panel.tsx` | 16 |
| `app/channels/you/page.tsx` | 17 |

Meanwhile, `lib/presence-status.ts` already has `getStatusColor()` and `getStatusLabel()` functions with the exact same data — but as a `switch` statement, not an iterable array.

### Remediation

**Created: `apps/web/lib/utils/status-options.ts`**

```typescript
import { STATUS_OPTIONS } from "@/lib/utils/status-options"
```

All 4 consumers should import from this single source.

**Effort:** Trivial — 4 file edits.
**Risk:** None.

---

## Finding 5 — Signal Server Room Manager Duplication

**Importance: 8/10**

### What

Three classes implement room management with near-identical logic:

| Class | File | Type | LOC |
|---|---|---|---|
| `InMemoryRoomManager` | `apps/signal/src/rooms.ts:33` | async, in-memory Maps | 58 |
| `RoomManager` (legacy) | `apps/signal/src/rooms.ts:104` | sync, in-memory Maps + TTL | 94 |
| `RedisRoomManager` | `apps/signal/src/redis-rooms.ts:23` | async, Redis hashes | 117 |

`InMemoryRoomManager` and the legacy `RoomManager` have **identical core logic** for `join`, `leave`, `leaveAll`, `updatePeer`, `getPeer`, `getRoomPeers`, `getRoomSize`, `getStats`. The only difference is `RoomManager` adds TTL eviction timers and uses sync return types.

**Duplication percentage:** `InMemoryRoomManager` ≈ 90% duplicated with `RoomManager`.

### Remediation

Merge TTL eviction into `InMemoryRoomManager` behind an optional constructor flag:

```typescript
export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Map<string, PeerInfo>>()
  private emptyTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly ttlMs: number | null

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? null
  }

  // ... single implementation with optional TTL
}
```

Then delete the legacy `RoomManager` class and update `rooms.parity-check.ts` to use `InMemoryRoomManager` with TTL enabled.

**Effort:** Medium — need to update parity-check tests.
**Risk:** Low — the `IRoomManager` interface contract is unchanged.

---

## Finding 6 — Modal Component Boilerplate

**Importance: 5/10**

### What

6+ modal files repeat the same structural pattern:

```tsx
<DialogContent style={{
  background: 'var(--theme-bg-primary)',
  borderColor: 'var(--theme-bg-tertiary)',
  maxWidth: '440px'
}}>
  <DialogHeader>
    <DialogTitle className="text-white">...</DialogTitle>
  </DialogHeader>
```

And the loading-state handler pattern:

```typescript
const [loading, setLoading] = useState(false)
async function handleSubmit() {
  setLoading(true)
  try { /* API call */ }
  catch (error: any) {
    toast({ variant: "destructive", title: "Failed to...", description: error.message })
  } finally { setLoading(false) }
}
```

### Affected files

- `components/modals/create-server-modal.tsx` (lines 29–104, 152)
- `components/modals/create-channel-modal.tsx` (lines 41–107, 167)
- `components/modals/create-thread-modal.tsx` (line 55)
- `components/modals/edit-channel-modal.tsx` (lines 27–89)
- `components/modals/report-modal.tsx` (lines 40–82)
- `components/modals/profile-settings-modal.tsx` (lines 140–220)
- `components/modals/notification-settings-modal.tsx` (line 59)

### Remediation

Extract a `<ThemedDialogContent>` wrapper:

```tsx
// components/ui/themed-dialog-content.tsx
export function ThemedDialogContent({ maxWidth = "440px", children }: Props) {
  return (
    <DialogContent style={{
      background: 'var(--theme-bg-primary)',
      borderColor: 'var(--theme-bg-tertiary)',
      maxWidth,
    }}>
      {children}
    </DialogContent>
  )
}
```

And a `useAsyncAction` hook:

```typescript
// hooks/use-async-action.ts
export function useAsyncAction() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function run(fn: () => Promise<void>, errorTitle = "Operation failed") {
    setLoading(true)
    try { await fn() }
    catch (error: any) {
      toast({ variant: "destructive", title: errorTitle, description: error.message })
    } finally { setLoading(false) }
  }

  return { loading, run }
}
```

**Effort:** Medium — many files to update but each change is mechanical.
**Risk:** Low.

---

## Finding 7 — Supabase Realtime Subscription Pattern

**Importance: 6/10**

### What

Multiple hooks implement near-identical Supabase Realtime channel setup:

```typescript
const channel = supabase.channel(`namespace:${id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "...", filter: "..." }, callback)
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "...", filter: "..." }, callback)
  .subscribe()

// + custom event listeners for vortex:realtime-connect / vortex:realtime-disconnect
// + cleanup: supabase.removeChannel(channel)
```

All also use the "callback ref" pattern to avoid stale closures:

```typescript
const onInsertRef = useRef(onInsert)
onInsertRef.current = onInsert
```

### Affected files

| File | Lines |
|---|---|
| `hooks/use-realtime-messages.ts` | 29–111 |
| `hooks/use-realtime-threads.ts` | 24–130 |
| `hooks/use-unread-channels.ts` | 138–169 |

### Remediation

Extract a `useSupabaseSubscription` hook:

```typescript
// hooks/use-supabase-subscription.ts
export function useSupabaseSubscription(
  channelName: string,
  handlers: PostgresChangeHandler[],
  deps: unknown[]
) {
  // single implementation of channel setup, callback refs, cleanup
}
```

**Effort:** Medium
**Risk:** Low — hooks are independent; can migrate one at a time.

---

## Finding 8 — Autocomplete Hook Duplication

**Importance: 5/10**

### What

Three autocomplete hooks share ~80% identical logic for keyboard navigation and state management:

```typescript
const [selectedIndex, setSelectedIndex] = useState(0)
const [dismissed, setDismissed] = useState(false)
// ... query detection, match filtering, arrow key / escape / tab handling
```

### Affected files

| File | Lines |
|---|---|
| `hooks/use-mention-autocomplete.ts` | 39–121 |
| `hooks/use-emoji-autocomplete.ts` | 53–153 |
| `hooks/use-slash-command-autocomplete.ts` | 40–104 |

### Remediation

Extract a generic `useAutocomplete<T>` hook:

```typescript
export function useAutocomplete<T>(config: {
  findQuery: (text: string, cursor: number) => string | null
  filter: (query: string) => T[]
}) {
  // shared keyboard nav, selectedIndex, dismissed state
  return { isOpen, matches, selectedIndex, handleKeyDown, select, dismiss }
}
```

**Effort:** Medium
**Risk:** Low.

---

## Finding 9 — localStorage Helper Duplication

**Importance: 3/10**

### What

`lib/stores/app-store.ts` (lines 27–44) defines `loadBooleanStorage` / `persistBooleanStorage`.
`hooks/use-notification-sound.ts` (lines 44–47) reimplements the same pattern inline.

### Remediation

**Created: `apps/web/lib/utils/storage.ts`**

Both files should import from this shared module.

**Effort:** Trivial
**Risk:** None

---

## Finding 10 — Image Upload / File Preview Pattern

**Importance: 4/10**

### What

The image upload + blob URL preview + cleanup pattern is duplicated in 3 files:

```typescript
const [iconFile, setIconFile] = useState<File | null>(null)
const [iconPreview, setIconPreview] = useState<string | null>(null)
const fileRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  return () => { if (iconPreview?.startsWith("blob:")) URL.revokeObjectURL(iconPreview) }
}, [])

function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setIconFile(file)
  if (iconPreview) URL.revokeObjectURL(iconPreview)
  setIconPreview(URL.createObjectURL(file))
}
```

### Affected files

| File | Lines |
|---|---|
| `components/modals/create-server-modal.tsx` | 31–43, 132–138 |
| `components/settings/profile-settings-page.tsx` | 43–46 |
| `components/modals/profile-settings-modal.tsx` | 150–167 |

### Remediation

Extract a `useFilePreview` hook:

```typescript
// hooks/use-file-preview.ts
export function useFilePreview() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview) }, [])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(f))
  }

  function reset() { setFile(null); setPreview(null) }

  return { file, preview, inputRef, onFileChange, reset }
}
```

**Effort:** Low
**Risk:** None

---

## Finding 11 — Permission Constant Re-Declaration

**Importance: 7/10**

### What

`lib/moderation-auth.ts:5-6` hardcodes:

```typescript
export const BAN_MEMBERS = 16
export const ADMINISTRATOR = 128
```

These are **exact duplicates** of `PERMISSIONS.BAN_MEMBERS` (= `1 << 4` = 16) and `PERMISSIONS.ADMINISTRATOR` (= `1 << 7` = 128) from `packages/shared/src/index.ts:9,12`.

If the shared package ever renumbered bits, these would silently diverge.

### Remediation

```diff
- export const BAN_MEMBERS = 16
- export const ADMINISTRATOR = 128
+ import { PERMISSIONS } from "@vortex/shared"
+ const { BAN_MEMBERS, ADMINISTRATOR } = PERMISSIONS
```

**Effort:** Trivial — one file edit.
**Risk:** None — values are identical today; this prevents future divergence.

---

## Finding 12 — Button with Loader Spinner Pattern

**Importance: 3/10**

### What

20+ files contain:

```tsx
<Button disabled={loading || !valid} style={{ background: 'var(--theme-accent)' }}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Submit
</Button>
```

### Affected files (sample)

- `components/modals/create-server-modal.tsx:222`
- `components/modals/create-channel-modal.tsx:285`
- `components/modals/create-thread-modal.tsx:86`
- `components/modals/invite-modal.tsx:160`
- `components/modals/report-modal.tsx:182`

### Remediation

Extract a `<LoadingButton>` component:

```tsx
// components/ui/loading-button.tsx
export function LoadingButton({ loading, children, ...props }: ButtonProps & { loading: boolean }) {
  return (
    <Button disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}
```

**Effort:** Low
**Risk:** None

---

## Findings Summary Table

| # | Finding | Importance | Instances | Effort | Utility created? |
|---|---|---|---|---|---|
| 1 | API auth + error boilerplate | 9/10 | 150+ | Low | `lib/utils/api-helpers.ts` |
| 2 | Audit log insertion pattern | 7/10 | 15+ | Low | `lib/utils/api-helpers.ts` |
| 3 | Permission check duplication across 3 auth modules | 8/10 | 3 files | Medium | Refactor needed |
| 4 | STATUS_OPTIONS (4 identical copies) | 6/10 | 4 | Trivial | `lib/utils/status-options.ts` |
| 5 | Signal server room manager duplication | 8/10 | 3 classes | Medium | Refactor needed |
| 6 | Modal component boilerplate | 5/10 | 6+ modals | Medium | Extract `ThemedDialogContent` + `useAsyncAction` |
| 7 | Supabase Realtime subscription pattern | 6/10 | 3 hooks | Medium | Extract `useSupabaseSubscription` |
| 8 | Autocomplete hook duplication | 5/10 | 3 hooks | Medium | Extract `useAutocomplete<T>` |
| 9 | localStorage helper duplication | 3/10 | 2 | Trivial | `lib/utils/storage.ts` |
| 10 | Image upload/preview pattern | 4/10 | 3 | Low | Extract `useFilePreview` |
| 11 | Permission constant re-declaration | 7/10 | 1 file | Trivial | Import from `@vortex/shared` |
| 12 | Button with loader spinner pattern | 3/10 | 20+ | Low | Extract `LoadingButton` |

---

## Recommended Prioritization

### Phase 1 — Quick wins (1–2 days)

1. **Finding 11** — Fix `moderation-auth.ts` hardcoded constants
2. **Finding 4** — Replace STATUS_OPTIONS copies with shared import
3. **Finding 9** — Consolidate localStorage helpers

### Phase 2 — High-impact refactors (3–5 days)

4. **Finding 1** — Migrate API routes to `requireAuth()` / `parseJsonBody()` / `dbError()`
5. **Finding 2** — Migrate audit log insertions to `insertAuditLog()`
6. **Finding 3** — Unify permission auth modules

### Phase 3 — Structural improvements (1–2 weeks)

7. **Finding 5** — Merge signal server room managers
8. **Finding 6** — Extract modal boilerplate components
9. **Finding 7** — Extract Supabase subscription hook
10. **Finding 8** — Extract generic autocomplete hook
11. **Finding 10** — Extract file preview hook
12. **Finding 12** — Extract `LoadingButton` component

---

## Utilities Created

As part of this analysis, the following utility modules were created in `apps/web/lib/utils/`:

| File | Exports | Addresses |
|---|---|---|
| `api-helpers.ts` | `requireAuth`, `requireAuthWithServiceRole`, `parseJsonBody`, `unauthorized`, `forbidden`, `notFound`, `apiError`, `dbError`, `insertAuditLog` | Findings 1, 2 |
| `status-options.ts` | `STATUS_OPTIONS`, re-exports `getStatusColor`, `getStatusLabel` | Finding 4 |
| `storage.ts` | `loadBooleanStorage`, `persistBooleanStorage`, `loadStringStorage`, `persistStringStorage` | Finding 9 |
