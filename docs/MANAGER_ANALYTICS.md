# Manager analytics integration — 2026-11-06

`/manager/analytics` is protected by the MANAGER route guard and appears in Manager navigation. `/manager/dashboard` redirects here; the existing Manager login destination remains Schedule. The implementation uses existing design tokens, Card/Button primitives and the Manager shell, without adding dependencies.

## Backend contract

Requires the matching backend analytics increment:

- `GET /api/manager/analytics/overview`
- `GET /api/manager/analytics/trends`
- `GET /api/manager/analytics/zones`

Requests use the normal authenticated API client and identical applied `from`, `to`, `zoneId` filters. Initial requests omit filters and use the backend's default seven-day period and store timezone; returned dates populate the form. The all-zone result supplies the selector, including inactive historical zones. Selecting one Zone does not discard the original choices. Date range validation prevents reversed/over-93-day requests; the backend validates future dates in its configured timezone.

API types are in `src/api/analytics.ts`. KPI formulas and nullable duration/rate semantics follow the backend `docs/MANAGER_ANALYTICS_API.md` contract.

## Visible behavior

- Four top-level KPI cards: detected Event episodes, non-dismissed Incidents, created Tasks and response SLA compliance.
- Daily metric selector and bar chart; expandable daily table supplies full values for keyboard/screen-reader users and longer date ranges.
- Current Task status breakdown; response/resolution SLA sections with met, breached, pending and unavailable counts; averages display their sample counts.
- Zone table uses the same applied date/Zone filter. Editing form values does not change displayed query context until Apply; Refresh reloads the last applied query.
- Data is recorded business history with latest status, not historical end-of-day snapshots or proof of camera uptime. The on-screen method explanation states these limits. Incident dismissals and cancelled SLA records are excluded according to the contract.
- `null` averages/rates display `—`; a genuine zero-second sample displays `0 sec`. Empty cohorts have a distinct notice. Partial endpoint failures hide all earlier figures and offer Retry; no mock fallback, stale successful summary or manufactured zero is displayed.
- All requests abort on unmount/query replacement. The three endpoints are not a single transactional snapshot.

## Verification and remaining work

- Six focused UI tests cover authenticated endpoint calls, common filters and retained Zone options, daily metric/table, validation, partial refresh failure/retry, empty/null/zero values and in-flight request cancellation.
- Full frontend suite: **261 passed across 36 files**. An initial full run hit a Camera preview wait failure; its unchanged 16-test file passed separately, then the complete suite passed on rerun. Production build passed. Lint passed with existing ZoneStaffing/SwapRequests warnings and no new analytics warnings.
- Edge visual/interaction checks use mocked responses, not staging data: dashboard redirect, chart metric changes, selected Zone table, 503 hiding previous figures, retry recovery and no document horizontal overflow at 1280px/1440px. Screenshot artifacts are under ignored `output/playwright/analytics-ui*.png`.
- Manager UI still requires end-to-end verification with the deployed analytics backend and real SQL data. Export, AI recommendations and live monitoring availability remain separate increments; this page does not claim full WF-05 completion.
