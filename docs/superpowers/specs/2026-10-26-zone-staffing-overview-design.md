# Zone staffing overview

## Intent

Give Managers a separate overview for checking how Staff assignments are distributed across Floors and Zones for any past, current, or future date and shift.

## Goals

- Add a Manager navigation item and route named **Zone staffing**.
- Provide Date, Shift, and Floor filters; Date supports past, today, and future dates, while Floor includes an **All floors** option.
- Default Date to today. Default Shift to the currently running active shift when one exists, otherwise the earliest active shift.
- Show every active Zone in the selected Floor scope, including Zones with no assigned Staff.
- For each Floor, show active-Zone count and unique assigned-Staff count.
- For each Zone, show `assigned / minimum`, coverage state, and the assigned Staff names.
- Show assignment state as **Draft**, **Published**, or **Checked in**. Cancelled assignments do not count.

## Counting rules

- Data is scoped to the selected local store date and Shift.
- `assigned` counts distinct non-cancelled Shift assignments linked to the Zone.
- `minimum` comes from the selected date/Shift entry in `ScheduleView.coverage`; when no coverage entry exists, use `0`.
- A Zone is understaffed when `assigned < minimum`.
- A legacy duplicate assignment is shown once per Staff in a Zone.
- Floor totals count distinct Staff across the Floor so one legacy Staff record cannot inflate the summary.

## Data and architecture

- Reuse `GET /api/schedule?from=<date>&to=<date>`, `GET /api/shifts`, and the existing Supermarket/Floor/Zone endpoints.
- Add a frontend data loader that returns active Floors with their active Zones, active Shift definitions, and the selected day's Schedule.
- Perform grouping and counting in the frontend; do not add a backend endpoint, database table, or schema change.
- Keep internal API/domain names such as `ShiftTemplate` unchanged; only Manager-facing language uses **shift**.

## UI design

- Page header: **Zone staffing** with subtitle **Review Staff coverage by date, shift and floor**.
- A compact filter bar contains Date, Shift, and Floor controls.
- Summary cards show Floors, Zones, Assigned Staff, and Coverage gaps for the current filter.
- Each Floor is a card. Zone rows are visually nested beneath it and show a status badge plus expandable/readable Staff rows, following the hierarchy in the supplied reference image.
- Loading, API error, no active shifts, no Floors, and no assigned Staff states remain explicit.
- The layout becomes a single column on narrow screens.

## Approaches considered

1. **Frontend aggregation from existing APIs — selected.** It reuses authoritative data already exposed to Managers and avoids duplicate backend behavior.
2. Add a dedicated backend overview endpoint. This would simplify the page response but adds unnecessary contracts, code, documentation, and tests for information already available.
3. Add a view toggle inside Schedule. Rejected because the weekly editor and the Floor/Zone staffing overview serve different Manager tasks and would make Schedule crowded.

## Non-goals

- No editing assignments from this page; Schedule remains the editing workflow.
- No attendance analytics, payroll, optimization, or live-presence inference.
- No new backend/database behavior.
- No branch, worktree, sub-agent, commit, or push.

## Verification scope

- One focused Zone staffing UI/data test file covering filters, grouping, counts, empty Zones, and statuses.
- One frontend production build and `git diff --check`; no full suite or repository-wide lint unless a focused failure requires it.
