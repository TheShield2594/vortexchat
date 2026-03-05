# VortexChat Discord Parity Execution Plan

Date: 2026-03-05  
Scope: Desktop web UX (`apps/web`)  
Purpose: Consolidate prior audit findings into one executable plan with ownership, sequencing, metrics, acceptance criteria, and rollout governance.

## 1) Unified baseline and scoring model

### Current baseline (single source of truth)
- **Official parity baseline:** **76%** (desktop web UX).
- **Reason:** This plan supersedes prior drafts and resolves prior 72%/76% drift by adopting the latest “truth audit” baseline.

### Scoring rubric (weighted)
- **Core interaction parity (35%)**: messaging, editing, reactions, unread behavior, context actions.
- **Navigation & IA parity (20%)**: channel/header utility density, settings architecture, thread discoverability.
- **Accessibility parity (20%)**: focus, keyboard traversal, SR semantics, contrast.
- **Visual/polish parity (15%)**: motion, loading hierarchy, feedback quality, density rhythm.
- **Voice/presence parity (10%)**: join/leave ergonomics, state transitions, device confidence.

### Parity targets
- **Release Train 1:** 76% → 82%
- **Release Train 2:** 82% → 87%
- **Release Train 3:** 87% → 90%

---

## 2) Program sequencing (release trains)

## Release Train 1 (Foundation + trust)
**Goal:** Remove low-trust UX artifacts and eliminate critical accessibility gaps.

1. Destructive confirmation standardization
2. Universal focus-visible implementation
3. ARIA naming pass on icon-only and menu controls
4. Unread baseline (new-message divider + jump-to-latest)
5. Token-governance guardrails (lint + migration policy)

**Exit criteria (R1):**
- No `window.confirm` usage in app surfaces.
- 100% interactive controls show visible focus ring on keyboard navigation.
- 0 critical axe violations on chat + settings + moderation routes.
- Feed unread divider + jump-to-latest shipped for all text channels.

## Release Train 2 (Power-user throughput)
**Goal:** Increase productivity parity and consistency on high-frequency surfaces.

1. Channel header utility density expansion (search, pins, inbox, thread filter, help/overflow)
2. Keyboard shortcut map expansion + discoverability hints
3. Skeleton-first loading for channel list/feed/member list
4. Modal hierarchy standardization and destructive framing
5. Voice preflight (input/output test + PTT/noise controls)

**Exit criteria (R2):**
- Header utilities available and keyboard reachable on desktop breakpoints.
- Shortcut usage telemetry present and discoverability entry points shipped.
- Spinner-first loading replaced by skeleton-first in priority surfaces.
- Voice join success rate improved vs baseline.

## Release Train 3 (Scale + differentiation-ready)
**Goal:** Complete parity-grade refinements and stabilize governance.

1. Settings IA split (User Settings route + Server Settings route)
2. Effective permissions preview + risk/conflict warnings
3. Thread IA strengthening (active counts, re-entry cues)
4. Accessibility certification pass (NVDA/VoiceOver + keyboard-only)
5. Regression gates for focus order/ARIA on high-traffic flows

**Exit criteria (R3):**
- Route-level settings split launched with no task success regression.
- Permission edits include impact summary and warning system.
- Accessibility certification checklist signed off.
- Parity score reaches **90%** target.

---

## 3) Ownership model

## Functional owners
- **Design Systems Team**: tokens, focus ring spec, component contracts, modal hierarchy.
- **Chat Surface Team**: unread ergonomics, message feed behavior, reaction/interactions.
- **Navigation & IA Team**: header utilities, settings IA split, thread navigation.
- **Accessibility Lead + QA**: semantic audits, assistive-tech validation, CI gates.
- **Realtime/Voice Team**: presence semantics, voice preflight, join/leave state clarity.
- **Data/Analytics Team**: KPI instrumentation, dashboarding, parity scoring pipeline.

## RACI (summary)
- **Responsible:** respective feature team.
- **Accountable:** product area EM.
- **Consulted:** design systems + accessibility lead.
- **Informed:** product leadership, support, community ops.

---

## 4) Acceptance criteria (definition of done)

## A) Destructive actions
- Every destructive action uses shared branded confirmation dialog component.
- Dialog includes irreversible-action language, clear primary/secondary actions, and keyboard trap/escape behavior.
- Optional undo snackbar policy documented for eligible soft-delete actions.

## B) Accessibility
- Every interactive element is reachable by keyboard.
- Every icon-only control has explicit accessible name (`aria-label` or labeled-by relation).
- Focus indicator meets contrast and visibility requirements in dark theme.
- Screen-reader announcements exist for typing activity, unread transitions, and voice state changes.

## C) Unread ergonomics
- New-message divider appears correctly for unread boundary.
- Jump-to-latest CTA appears when user is off newest messages.
- Mention jump/return restores prior scroll context.

## D) Design token discipline
- New UI code must use semantic tokens for color/radius/elevation/motion.
- CI lint rule blocks newly introduced hardcoded color/radius/shadow values in app surfaces.
- Legacy exceptions tracked in migration backlog with owner/date.

## E) Header productivity density
- Search, pins, inbox/mentions, thread controls, help/overflow exposed in header.
- Keyboard navigation order and focus states validated.
- Responsive collapse behavior documented and tested.

---

## 5) KPI framework

## Primary KPIs
- **Parity score** (weighted rubric above) tracked per release train.
- **Task success rate** on key flows: create channel, send/edit/delete message, permission update, join/leave voice.
- **Time-to-complete** for high-frequency actions (search, pin lookup, unread recovery).
- **Keyboard-only completion rate** for chat + settings tasks.
- **A11y quality**: critical/serious axe issues count.

## Secondary KPIs
- Shortcut adoption rate (weekly active usage).
- Jump-to-latest usage and unread recovery success.
- Voice join failure rate and average time-to-audio-ready.
- Support tickets tagged UX friction (month-over-month trend).

## Reporting cadence
- Weekly team-level dashboard review.
- End-of-release parity checkpoint and re-score.
- Monthly leadership summary with risk + mitigation status.

---

## 6) Risk and dependency register

1. **Settings IA split risk:** navigation churn may reduce task success initially.
   - Mitigation: phased rollout + contextual entry shortcuts + in-product guidance.

2. **Token migration risk:** visual regressions from hardcoded style removal.
   - Mitigation: screenshot regression checks + staged codemod scope.

3. **Accessibility patch risk:** rapid ARIA/focus changes may introduce interaction regressions.
   - Mitigation: keyboard smoke suite in CI + QA scripts on critical routes.

4. **Header density risk:** added controls may increase cognitive load.
   - Mitigation: responsive prioritization + overflow rules + usability validation.

5. **Voice preflight dependency risk:** device API inconsistencies across browsers.
   - Mitigation: browser capability fallback matrix + telemetry-driven guardrails.

---

## 7) Validation and rollout strategy

## Validation loop
1. Prototype usability tests for each major IA or flow change.
2. Dogfood cohort rollout (internal + trusted community moderators).
3. Instrumented beta release with guardrail metrics.
4. General availability after KPI thresholds hold for two weeks.

## Rollout gates
- No net regression in task success for top 5 flows.
- No new critical accessibility defects.
- Support ticket volume for targeted surfaces does not spike above threshold.
- Performance budget maintained on chat route.

---

## 8) Tracking artifacts to maintain

- `PARITY_EXECUTION_PLAN.md` (this file): strategy + sequencing source of truth.
- `PARITY_BACKLOG.md`: prioritized implementation tickets mapped to release trains.
- `PARITY_SCORECARD.md`: live KPI and weighted parity scoring by milestone.
- `A11Y_CERT_CHECKLIST.md`: assistive-tech and keyboard certification status.

---

## 9) Immediate next actions (next 2 weeks)

1. Publish shared destructive confirmation component contract.
2. Ship focus-ring token and begin app-wide adoption sweep.
3. Implement unread divider + jump-to-latest in message feed.
4. Stand up parity KPI dashboard and baseline capture.
5. Finalize R1 ticket breakdown with owners and due dates.
