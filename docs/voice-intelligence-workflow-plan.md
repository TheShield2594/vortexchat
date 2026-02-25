# Opt-In Voice Intelligence Workflow Plan

This document defines the end-to-end implementation steps for:
- live transcription in voice channels and DM calls,
- optional per-participant live translation/subtitles,
- post-call summaries (highlights, decisions, action items),
- consent/privacy UX and server policy controls,
- transcript storage/retention lifecycle,
- test and performance validation.

## 1) Product and policy prerequisites

1. Define feature flags and rollout gates.
   - `voice_intelligence_enabled` (global)
   - `voice_transcription_enabled` (workspace/server)
   - `voice_translation_enabled` (workspace/server)
   - `voice_post_call_summary_enabled` (workspace/server)
2. Publish policy copy and consent language.
   - Describe the data captured.
   - State storage locations and retention periods.
   - Clarify access and permissions.
3. Classify data by sensitivity.
   - Raw audio (ephemeral/transient only where possible)
   - Transcript segments (persistent)
   - Summary artifacts (persistent)
   - Consent events and audit logs (persistent)

## 2) Data model and persistence changes

Add schema support for call sessions, participants, consent, transcript chunks, translations, summaries, and retention tracking.

### 2.1 New tables

1. `voice_call_sessions`
   - PK: `id`
   - `scope_type` (`server_channel` | `dm_call`), `scope_id`
   - `started_at` NOT NULL, `ended_at`, `started_by` FK -> `users.id`
   - `transcription_mode` (`off` | `manual_opt_in` | `server_policy_required`)
   - `summary_status` (`pending` | `ready` | `failed`)
   - Indexes: `(scope_type, scope_id, started_at)`, `(started_by, started_at)`
2. `voice_call_participants`
   - PK: `id`
   - `session_id` NOT NULL FK -> `voice_call_sessions.id` ON DELETE CASCADE
   - `user_id` NOT NULL FK -> `users.id`, `joined_at` NOT NULL, `left_at`
   - `consent_transcription` NOT NULL boolean
   - `consent_translation` NOT NULL boolean
   - `preferred_subtitle_language` (nullable)
   - Unique constraint: `UNIQUE(session_id, user_id)`
   - Indexes: `(session_id, joined_at)`, `(user_id, joined_at)`
3. `voice_transcript_segments`
   - PK: `id`
   - `session_id` NOT NULL FK -> `voice_call_sessions.id` ON DELETE CASCADE
   - `speaker_user_id` nullable FK -> `users.id` (nullable if unknown)
   - `source_language`, `text` NOT NULL, `started_at` NOT NULL, `ended_at` NOT NULL
   - `confidence`, `provider`, `is_redacted`
   - Indexes: `(session_id, started_at)`, `(speaker_user_id, started_at)`
4. `voice_transcript_translations`
   - PK: `id`
   - `segment_id` NOT NULL FK -> `voice_transcript_segments.id` ON DELETE CASCADE
   - `target_user_id` nullable FK -> `users.id`
   - `target_language`, `translated_text`, `provider`
   - Indexes: `(segment_id, target_user_id)`, `(target_user_id, segment_id)`
5. `voice_call_summaries`
   - PK/Unique: `session_id` FK -> `voice_call_sessions.id` ON DELETE CASCADE
   - `model`, `highlights_md`, `decisions_md`, `action_items_md` NOT NULL
   - `generated_at`, `quality_score` (nullable)
   - Indexes: `(generated_at)`, `(session_id, generated_at)`
6. `voice_intelligence_policies`
   - PK: `id`
   - scope: `scope_type` (`workspace` | `server`) + `scope_id`
   - defaults for consent requirement, allowed locales, retention days, summary toggle are NOT NULL
   - Unique constraint: `UNIQUE(scope_type, scope_id)`
   - Indexes: `(scope_type, scope_id)`
7. `voice_intelligence_audit_log`
   - PK: `id`
   - `session_id` FK -> `voice_call_sessions.id` ON DELETE SET NULL (preserves compliance trail)
   - `actor_user_id` FK -> `users.id`, `event_type` NOT NULL, `payload_json` NOT NULL, `created_at` NOT NULL
   - Indexes: `(session_id, created_at)`, `(actor_user_id, created_at)`, `(event_type, created_at)`

### 2.2 Retention metadata

1. Include `expires_at` for transcript and summary records.
2. Provide soft-delete + purge workflow markers (`deleted_at`, `purged_at`).
3. Introduce legal-hold controls:
   - Either `legal_hold` boolean + `legal_hold_reason`, or dedicated `voice_legal_holds` table keyed to transcript/summary IDs.
   - Legal hold overrides `expires_at`, `deleted_at`, and `purged_at` automation until hold release is audited.
4. List indexed columns for cleanup jobs:
   - `(expires_at, purged_at)`
   - `(session_id, created_at)`
5. Define backup-boundary behavior:
   - Primary data stores must honor deletion SLA unless legal hold is active.
   - Exports, cold backups, and cache layers must be tagged with retention class and documented maximum TTL.
   - Purge jobs must skip held records, record skip reasons, and schedule bounded follow-up cleanup for non-primary copies after hold release.

### 2.3 Access control / RLS

1. Server-call transcripts visible by policy + channel permissions.
2. DM-call transcripts visible only to call participants.
3. Translation rows visible only to requesting user and privileged admins where policy allows.
4. Audit logs visible to moderators/admins only.

## 3) Voice pipeline architecture

## 3.1 Capture and stream

1. Extend voice signaling metadata to negotiate intelligence capabilities for the call.
2. On call start:
   - compute effective policy,
   - collect participant opt-in states,
   - set session state (`transcription active` only when allowed).
3. For each opted-in participant audio stream:
   - perform VAD (voice activity detection),
   - frame and stream to STT provider with low-latency settings.

## 3.2 Live transcription

1. Support interim and final segment events.
2. Publish transcript events over existing realtime mechanism.
3. Persist only final segments by default (interim in-memory TTL cache).
4. Attribute speakers from call participant mapping when available.

## 3.3 Optional live translation/subtitles

1. Per participant subtitle settings:
   - off,
   - source transcript only,
   - translated subtitles in target language.
2. Translation engine invoked only for participants with opt-in enabled.
3. Emit individualized subtitle events (user-scoped fanout) to avoid over-sharing.

## 3.4 Post-call summarization

1. Trigger summary job at call end if:
   - policy permits summaries,
   - minimum transcript length threshold met.
2. Prompt template returns strict sections:
   - Highlights
   - Decisions
   - Action Items
3. Persist summary with provenance metadata (model/provider/prompt version).
4. Add retry + failure states and moderator-visible error details.

## 4) Consent and privacy UX

## 4.1 In-call indicators

1. Always-visible indicator in voice UI:
   - recording/transcription active status,
   - summary generation pending/complete state.
2. Participant list badges:
   - who has opted in/out,
   - who receives translated subtitles.

## 4.2 Consent flows

1. Server voice channels:
   - first-join modal if policy requires explicit consent.
   - quick toggle in voice settings panel for ongoing preference.
2. DM calls:
   - bilateral consent gate before transcription starts.
   - if either participant declines, transcription remains off.
3. Mid-call consent change:
   - disable pipeline for that user immediately,
   - log audit event,
   - update visible indicators.

## 4.3 Policy controls (server/workspace)

Provide admin settings page:
1. Allow/disable transcription.
2. Require explicit participant consent.
3. Allow/disable live translation.
4. Allow/disable post-call summaries.
5. Configure retention duration.
6. Restrict access roles for transcripts/summaries.

## 5) API and service contracts

## 5.1 Server APIs

1. `POST /voice/sessions/start`
   - Required scope: `voice:sessions:create`
   - Idempotency: require `X-Idempotency-Key` (or client-provided stable session UUID); retries return the originally created session (`201` on first create, `200` on replay).
2. `POST /voice/sessions/{id}/consent`
   - Required scopes: `voice:sessions:modify` + `voice:consent`
   - Idempotency: same payload is a no-op (`200`); conflicting replay with same idempotency key returns `409`; last-write-wins only when server accepts higher client timestamp.
3. `POST /voice/sessions/{id}/subtitle-preferences`
   - Required scopes: `voice:sessions:modify` + `voice:consent`
   - Idempotency: identical preference updates are no-ops (`200`); deterministic last-write behavior when timestamps are supplied.
4. `POST /voice/sessions/{id}/end`
   - Required scope: `voice:sessions:modify`
   - Idempotency: repeated end requests return existing terminal state (`200`) and never create duplicate summary jobs.
5. `GET /voice/sessions/{id}/transcript`
   - Required scope: `voice:sessions:read`
6. `GET /voice/sessions/{id}/summary`
   - Required scope: `voice:sessions:read`
7. `PATCH /servers/{id}/voice-intelligence-policy`
   - Required scope: `voice:policy:write`
   - Idempotency: accepts `X-Idempotency-Key`; replay returns original policy revision (`200`), conflicting optimistic-lock version returns `409`.

## 5.2 Realtime events

1. `voice.transcription.status.changed`
2. `voice.transcript.segment.interim`
3. `voice.transcript.segment.final`
4. `voice.transcript.translation.final`
5. `voice.summary.ready`
6. `voice.consent.changed`

### Event envelope, versioning, and compatibility contract

1. Every realtime event must include envelope metadata:
   - `event_name`
   - `schema_version` (semver string, for example `1.2.0`)
   - `event_id`, `occurred_at`, `session_id`
2. Compatibility guarantees:
   - Additive-only field additions are allowed in minor/patch versions.
   - Field rename/removal requires a deprecation window (minimum 2 minor releases or 90 days, whichever is longer).
   - During deprecation, producers emit both old and new fields and publish migration guidance.
3. Backward/forward compatibility rules:
   - Clients must ignore unknown fields.
   - Clients should parse and branch on `schema_version` when behavior differs.
   - Producers must avoid changing semantic meaning of existing fields without version bump + deprecation notice.
4. Validation and upgrade expectations:
   - Event publisher contract tests validate required envelope fields and version-specific schemas.
   - Consumer tests must include at least one older and one newer `schema_version` fixture.
   - Release notes include an event schema changelog entry for every version increment.

## 6) Operational workflow (end-to-end)

1. User joins voice call.
2. Client fetches effective voice intelligence policy.
3. Consent modal appears if required.
4. User opts in (or declines); choice persisted.
5. If required conditions are met, transcription starts and indicator turns on.
6. Transcript events stream live; subtitles render per user preference.
7. Call ends; transcript finalized and indexed.
8. Summary job runs and stores highlights/decisions/action items.
9. Retention scheduler assigns `expires_at` and later purges records.
10. Audit events remain for compliance visibility.

## 7) Retention, deletion, and compliance

1. Default retention profiles:
   - short (7 days), standard (30 days), extended (90 days), custom.
2. Manual delete actions:
   - participant-initiated delete request for DM transcripts,
   - moderator/admin delete for server call artifacts.
3. Purge job:
   - hard-delete expired transcript/translation/summary records,
   - write immutable purge audit events.
4. Data export:
   - allow authorized export of transcript + summary package.
5. Legal hold and backup-boundary rules:
   - Legal hold (`legal_hold=true` or active hold record) freezes automatic expiry/purge even when `expires_at`, `deleted_at`, or `purged_at` criteria would otherwise match.
   - Hold scope can target a session, transcript segment set, summary, or export package; release requires auditable actor + reason.
   - Backup/cold-storage/cache copies are in-scope for retention policy documentation and must declare deletion SLA boundaries.
   - Cleanup workers using `(expires_at, purged_at)` and `(session_id, created_at)` indexes must explicitly filter out held records and queue post-release cleanup for backups/exports.

## 8) Testing plan

## 8.1 Unit tests

1. Consent state reducer/service logic.
2. Policy resolution precedence (global → workspace → server → channel/call).
3. Transcript segment assembler and speaker attribution.
4. Translation fanout scoping (only intended users receive translated text).
5. Summary formatter and section validation.
6. Retention scheduler and expiration calculations.

## 8.2 Integration tests

1. Call lifecycle: start → consent → transcript events → end → summary.
2. DM consent gating with one participant declining.
3. Mid-call consent revocation stopping new transcript generation.
4. Policy toggles affecting client behavior in realtime.
5. RLS/authorization checks for transcript and summary retrieval.

## 8.3 E2E tests

1. Server call with transcription on and visible indicators.
2. Per-user translation subtitle preferences.
3. Post-call summary appears with all three required sections.
4. Admin updates retention and verifies future sessions inherit settings.

## 8.4 Non-functional tests

1. Load tests for N concurrent calls with transcription enabled.
2. Soak tests for long-running calls (>=2h).
3. Failure injection (STT/translation provider timeout, reconnect behavior).

## 9) Performance impact notes

1. Client CPU/battery:
   - VAD + encoding overhead per active speaker.
   - Mitigation: adaptive sampling, silence suppression.
2. Bandwidth:
   - Additional upstream for STT audio frames.
   - Mitigation: compress framed audio and cap interim frequency.
3. Server cost/latency:
   - STT/translation/model calls per minute.
   - Mitigation: policy gating, opt-in defaults, batching summary generation.
4. Storage growth:
   - transcript volume scales with total voice minutes.
   - Mitigation: configurable retention + purge SLA.

## 10) Rollout plan

1. Internal dogfood behind feature flag.
2. Beta on selected servers with explicit opt-in.
3. Observe SLOs:
   - transcript latency p95,
   - subtitle latency p95,
   - summary availability success rate,
   - consent mismatch incidents.
4. Expand gradually; provide admin migration guides.

## 11) Implementation checklist (deliverable tracker)

- [ ] Schema migrations for voice intelligence entities
- [ ] RLS policies for transcripts/translations/summaries/audit logs
- [ ] Voice session service and consent orchestration
- [ ] Realtime event contract updates
- [ ] STT integration with interim/final handling
- [ ] Translation integration with per-user fanout
- [ ] Summary generation worker + retries
- [ ] Server policy settings UI
- [ ] Call UI indicators and consent modals
- [ ] Transcript viewer and post-call summary UI
- [ ] Retention scheduler and purge worker
- [ ] Unit/integration/E2E/non-functional test coverage
- [ ] Performance dashboards and alert thresholds
