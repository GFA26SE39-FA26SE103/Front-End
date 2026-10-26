# Zone Staffing Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Manager-only Zone staffing page that summarizes assigned Staff by date, shift, Floor, and Zone.

**Architecture:** Reuse the existing schedule, shift, supermarket, Floor, and Zone APIs. A focused frontend data module loads the store hierarchy and converts flat schedule assignments into a Floor → Zone → Staff view model; the React page owns filters and presentation only.

**Tech Stack:** React 19, TypeScript 6, React Router, Vitest, Testing Library, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-10-26-zone-staffing-overview-design.md`

## Global Constraints

- Work inline on the current FE branch; do not create a branch, worktree, or sub-agent.
- Do not modify backend code, database schema, API contracts, or internal `ShiftTemplate` naming.
- Preserve all existing uncommitted FE changes from the Zone dropdown and Shift setup work.
- Do not commit or push.
- Limit verification to the focused Zone staffing tests, one FE production build, and `git diff --check`.

## Review Focus

- An active Zone with zero assignments must still appear with `0 / minimum`; covered by the focused overview test.
- Cancelled assignments and inactive Zones must not affect counts; covered by the focused overview test.
- Legacy duplicate Staff rows in one Zone must be counted and displayed once; covered by the focused overview test.
- A Staff member assigned to two legacy Zones on one Floor must count once in the Floor summary but once in each Zone; covered by the focused overview test.
- Past/future date changes must reload only that date while Shift/Floor changes regroup locally; covered by the focused page interaction test.

---

### Task 1: Build and expose the Zone staffing overview

**Files:**
- Create: `src/pages/manager/zoneStaffingData.ts`
- Create: `src/pages/manager/ZoneStaffing.tsx`
- Create: `src/pages/manager/ZoneStaffing.module.css`
- Create: `src/pages/manager/ZoneStaffing.test.tsx`
- Modify: `src/components/ManagerLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `listSupermarkets(signal)`, `listFloors(supermarketId, signal)`, `listZones(floorId, signal)`, `listShiftTemplates(signal)`, and `getSchedule(date, date, signal)`.
- Produces: `loadStaffingFloors(signal?: AbortSignal): Promise<StaffingFloor[]>`, `buildStaffingOverview(floors: StaffingFloor[], schedule: ScheduleView, shiftId: string, floorId: string): StaffingOverview`, and the `/manager/staffing` Manager route.

- [ ] **Step 1: Write one focused failing test file**

Create `ZoneStaffing.test.tsx` with:

1. A pure aggregation test asserting two Floors, active/empty Zones, distinct Staff counts, `assigned / minimum`, coverage gaps, checked-in/draft/published states, cancelled exclusion, inactive-Zone exclusion, and legacy duplicate de-duplication.
2. A page interaction test with real `ZoneStaffing` and mocked HTTP boundaries asserting the **Zone staffing** nav/page, Date/Shift/Floor controls, Floor → Zone → Staff hierarchy, Floor filtering without another schedule request, and a future Date change requesting `/api/schedule?from=<date>&to=<date>`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/pages/manager/ZoneStaffing.test.tsx --reporter=verbose`

Expected: FAIL because the data module, page, navigation item, and route do not exist.

- [ ] **Step 3: Implement the data module**

Define source/view types in `zoneStaffingData.ts`. `loadStaffingFloors` loads the first configured supermarket, then active Floors and their active Zones ordered by floor number and Zone name. `buildStaffingOverview` filters non-cancelled assignments by selected Shift, groups unique Staff by Zone, derives state precedence `Checked in > Draft > Published`, obtains minimum from matching coverage, and calculates distinct Floor/overall totals and gaps.

- [ ] **Step 4: Implement the page and route**

Create `ZoneStaffing.tsx` with Date defaulting to today, active Shift options plus an inactive Shift used on the selected date, current-running Shift default when applicable, and an **All floors** option. Render four summary cards and Floor cards with nested Zone and Staff rows. Add responsive styles in `ZoneStaffing.module.css`, add **Zone staffing** to `ManagerLayout`, and register `/manager/staffing` in `App.tsx` under the Manager protected route.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- --run src/pages/manager/ZoneStaffing.test.tsx --reporter=verbose`

Expected: both Zone staffing tests pass.

### Task 2: Verify the integrated frontend

**Files:**
- Review every file created or changed in Task 1 together with the existing uncommitted Manager changes.

**Interfaces:**
- Consumes: the `/manager/staffing` route and overview view model from Task 1.
- Produces: a production-buildable FE diff with no backend/schema changes.

- [ ] **Step 1: Run the FE production build**

Run: `npm run build`

Expected: exit code 0; report the existing Vite chunk-size warning separately.

- [ ] **Step 2: Check the diff and repository state**

Run: `git diff --check`, `git status --short --branch`, and inspect `git diff` for the new page plus prior Manager edits.

Expected: FE remains on `main`; no backend, schema, worktree, commit, or push action occurs.

- [ ] **Step 3: Self-review and report**

Because the user prohibited sub-agents, perform a read-only self-review for filter correctness, date/overnight Shift handling, de-duplication, accessibility, responsive layout, and preservation of earlier uncommitted changes. Report focused test/build evidence and explicitly state that the full suite/lint were not run.
