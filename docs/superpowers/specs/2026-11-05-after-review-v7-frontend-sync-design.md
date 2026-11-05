# After-review V7 frontend sync design

## Intent

Synchronize the Operator and Admin web UI with the frozen backend V7 contract after mentor review. The UI must stop presenting Incident Severity, expose the SLA snapshot that the backend actually returns, let Admin assign Staff specialties, and preserve legacy OperationalEvent response policies with their V7 task-type reference.

## Goals

- Remove `incidentSeverity` and `Incident.severity` from monitoring API types, fixtures, and rendered UI.
- Show Incident SLA priority and response/resolution deadlines from the immutable backend snapshot.
- Make missing SLA snapshot data explicit without inventing a priority or deadline.
- Load StaffSpecialty catalog data and send `specialtyId` when creating/updating STAFF accounts.
- Preserve Notification Severity and OperationalEvent WARNING/CRITICAL priority.
- Preserve ResponsePolicy and send its optional `taskTypeCode`.
- Record backend contract gaps that block the remaining checklist items.

## Non-goals

- Do not create SLA Policy or IncidentType CRUD screens without write APIs.
- Do not create an Operator TaskOffer detail/list contract that the backend does not expose.
- Do not display task SLA deadlines until `StaffTaskView` exposes them.
- Do not change mobile, backend, database, or legacy camera behavior.

## Approach

Use a staged contract-first sync. Update only fields and endpoints present in the latest `feature/after-review-backend-sync` OpenAPI/application contracts. Keep unavailable capabilities out of the UI and document them for backend follow-up. This was selected over mock-first work because fabricated contracts would create drift and over waiting because several V7 contracts are already usable.

## UI behavior

- Monitoring runtime shows whether an Incident is open using `incidentId`, never a severity label.
- Incident cards show `slaPriorityCode` when present, otherwise `SLA unavailable`; snapshot version and deadlines are displayed only from returned values.
- STAFF account forms show a specialty selector. An unassigned specialty is allowed because the backend permits it, with a warning that typed task offers will not be received.
- Non-STAFF account requests always send `specialtyId: null`.
- ResponsePolicy shows and submits an optional normalized task type code; backend remains authoritative for validity.

## Constraints and conflict rulings

- The V7 implementation plan supersedes older Report/AGENTS references to Incident Severity.
- `Notification.Severity` and OperationalEvent priority remain valid and are not renamed.
- No commits, pushes, or merges are made before Lộc confirms the checklist and cross-review.
- Existing unrelated camera-test flakiness is not repaired as part of this sync.

