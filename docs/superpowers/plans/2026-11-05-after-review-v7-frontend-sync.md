# After-review V7 Frontend Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Operator/Admin web UI with backend V7 contracts that are currently available.

**Architecture:** Keep API contracts in `src/api`, render policy-derived state in existing Operator/Admin pages, and exercise the real fetch boundary through existing integration tests. Unavailable backend capabilities remain documented, not mocked.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-after-review-v7-frontend-sync-design.md`

## Global Constraints

- Incident Severity must not exist in web API types, fixtures, or UI.
- OperationalEvent priority and Notification Severity remain unchanged.
- SLA values come only from the backend snapshot; never infer them from thresholds or text.
- StaffSpecialty is assigned only to STAFF accounts; non-STAFF requests send null.
- Keep legacy ResponsePolicy UI and add only its exposed `taskTypeCode` field.
- Do not implement UI against missing SLA Policy, IncidentType write, Operator TaskOffer, or task-SLA endpoints.
- Do not commit, push, or merge until Lộc confirms the checklist and review.

## Review Focus

- Incident with no SLA snapshot renders an explicit unavailable state and no fabricated deadline.
- Incident with a snapshot renders priority/version and both deadlines with independent nullable handling.
- STAFF create/update sends the selected specialty; changing away from STAFF clears it.
- Specialty catalog load failure does not silently allow a misleading specialty choice.
- ResponsePolicy round-trips `taskTypeCode` without dropping existing title/instructions.

---

### Task 1: Monitoring incident SLA contract and UI

**Files:**
- Modify: `src/api/monitoringRuntime.ts`
- Modify: `src/pages/operator/CameraMonitoringPanel.tsx`
- Test: `src/pages/operator/CameraMonitoringPanel.test.tsx`

**Interfaces:**
- Consumes: backend `MonitoringRuleRuntimeView` and `IncidentFeedItem` V7.
- Produces: severity-free runtime/feed types and incident cards driven by SLA snapshot fields.

- [ ] Add failing tests for SLA snapshot display, missing snapshot display, and absence of Incident Severity.
- [ ] Run the focused test and verify failure against the old contract/UI.
- [ ] Replace old severity fields with V7 SLA snapshot fields and render them without inference.
- [ ] Run the focused test and verify it passes.

### Task 2: StaffSpecialty account assignment

**Files:**
- Modify: `src/auth/session.ts`
- Modify: `src/api/accounts.ts`
- Modify: `src/pages/UsersRoles.tsx`
- Modify: `src/pages/UsersRoles.module.css`
- Test: `src/pages/UsersRoles.test.tsx`

**Interfaces:**
- Consumes: `GET /api/staff-specialties` and V7 User create/update contracts.
- Produces: optional specialty fields on account records and Admin assignment UI.

- [ ] Add failing integration tests for specialty loading, STAFF create/update payloads, and role-change clearing.
- [ ] Run the focused test and verify failure against the old account contract/UI.
- [ ] Add API types/function and specialty-aware account editor/table behavior.
- [ ] Run the focused test and verify it passes.

### Task 3: ResponsePolicy task type code

**Files:**
- Modify: `src/api/responsePolicies.ts`
- Modify: `src/pages/admin/ResponsePolicies.tsx`
- Test: `src/pages/admin/ResponsePolicies.test.tsx`

**Interfaces:**
- Consumes: V7 `AutomaticTaskPolicyView/Request.taskTypeCode`.
- Produces: optional task-type code round-trip in the existing policy editor.

- [ ] Add a failing test that loads and saves `taskTypeCode` in the versioned policy payload.
- [ ] Run the focused test and verify failure against the old policy contract/UI.
- [ ] Extend types, draft mapping, field, help text, and save payload.
- [ ] Run the focused test and verify it passes.

### Task 4: Contract assumptions and verification

**Files:**
- Create: `docs/AFTER_REVIEW_V7_FRONTEND_CONTRACT.md`

**Interfaces:**
- Consumes: verified backend after-review OpenAPI/application surface.
- Produces: merge handoff listing implemented contracts and blocked endpoints.

- [ ] Document available contracts, nullability assumptions, and blocked checklist items.
- [ ] Run focused tests for Tasks 1–3.
- [ ] Run `npm run build`, `npm run lint`, and the full test suite with worktree-local TEMP.
- [ ] Record any unrelated baseline failure without changing its feature.

