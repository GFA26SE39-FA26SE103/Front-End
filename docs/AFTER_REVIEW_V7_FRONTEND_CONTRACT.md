# After-review V7 frontend contract

Verified against backend branch `feature/after-review-backend-sync` at `f1ebfd8` on 2026-11-05.

## Implemented in this frontend sync

### Incident monitoring

- Incident cards do not consume or display Incident Severity.
- OperationalEvent priority and Notification Severity are separate concepts and remain unchanged.
- The incident feed consumes the backend SLA snapshot fields: `slaPolicyId`, `slaPriorityCode`, `slaPolicyVersion`, `responseDeadlineAt`, `resolutionDeadlineAt`, and `mitigatedAt`.
- Each SLA field is nullable. The UI displays only values returned by the backend and never derives deadlines from monitoring thresholds, event text, or legacy severity.
- When no SLA snapshot is available, the UI shows an explicit unavailable state.

### Staff specialties

- `GET /api/staff-specialties` supplies the assignment catalog.
- User views consume nullable `specialtyId`, `specialtyCode`, and `specialtyName`.
- User create/update requests send a nullable `specialtyId`.
- A specialty is editable only for the `STAFF` role. Changing an account to another role sends `specialtyId: null`.
- A Staff account may have no specialty because the backend contract permits null; the UI warns that specialty-matched task offers will not reach that account.
- If the specialty catalog cannot be loaded, account administration stays unavailable instead of presenting an incomplete selector.

### Response policies

- The automatic task action consumes and saves nullable `taskTypeCode` alongside the existing title and instructions.
- No task-type catalog endpoint is currently exposed, so the field accepts a seeded backend code rather than presenting an invented dropdown.
- A blank code is sent as null. It is appropriate only where the backend can resolve exactly one task type for the event category.

## Backend capabilities intentionally not represented yet

- SLA Policy administration endpoints.
- IncidentType create/update administration endpoints.
- Operator TaskOffer list/detail endpoints.
- Task-level SLA fields in `StaffTaskView`.

These screens must not be implemented with local placeholder data. Add them only after the backend publishes and tests the corresponding contracts.

## Merge checklist

- Confirm the frontend is reviewed against the same backend revision or a compatible later revision.
- Re-run the focused monitoring, account, and response-policy tests.
- Re-run build, lint, and the complete frontend test suite.
- Do not commit, push, or merge until Lộc confirms the checklist and cross-review.
