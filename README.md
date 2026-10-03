# Supermarket Ops — Web (Front-End)

Web console of the capstone **AI-Powered Smart Supermarket Operations Monitoring System** (FA26SE103 / GFA26SE39).
Built from the Figma file `8oVvtkRjHpZOpjnRRXO2hV`.

## Stack

- React 19 + TypeScript, Vite
- React Router
- CSS Modules; colour tokens in `src/styles/tokens.css` come from the Figma variable collection "Theme"
- Font: Inter (`@fontsource/inter`)

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
npm test -- --run
```

## Screens (Main flow 1 — Admin setup)

| Route | Screen | Figma frame |
|---|---|---|
| `/login` | Sign in + states: signing in, invalid credentials, unable to sign in, account suspended, sign-in blocked, session expired (`?reason=session-expired`) | Shared — Login / Signing in / Invalid credentials / Unable to sign in / Account access suspended / Sign-in blocked / Session expired |
| `/forgot-password` → `/forgot-password/sent` | Password recovery, reset link sent | Shared — Forgot password / Reset link sent |
| `/reset-password` → `/reset-password/done` | Set new password, password updated | Shared — Set new password / Password reset successful |
| `/reset-password/expired` | Reset link expired | Shared — Reset link expired |
| `/admin/dashboard` | System setup wizard + camera & system health | Admin — Setup & Health |
| `/admin/store-layout` | API-backed floors/maps/zones/cameras; upload maps, draw zones and persist camera placement | Admin — Store layout |
| `/admin/cameras` | Camera registry, device detail, maintenance log, stream test | Admin — Cameras |
| `/admin/ai-config?zoneId=<uuid>` | API-backed per-zone Draft rules, confidence, review/activate/deactivate | Admin — AI Config |
| `/admin/incident-types` | Incident catalogue + new type form | Admin — Incident types |
| `/admin/routing` | Confidence routing (draggable 50 % / 80 %), broadcast & escalation | Admin — Routing & alerts |
| `/admin/users` | API-backed account creation, edit, enable/disable and system role list | Admin — Users & Roles |
| `/admin/audit-logs` | Audit events, filters, details, CSV / JSON export | Admin — Audit log |
| `/admin/system-health` | Services, performance, alerts, incident pipeline | Admin — System health |

## Current integration status (2026-10-03)

Login uses the backend JWT API. Set `VITE_API_URL=http://localhost:5080` in a local `.env` (also the default). Requests attach the bearer token; a 401 clears the session. Protected routes verify the current user with `GET /api/auth/me` before rendering and again on navigation. A failed access check offers retry without displaying protected content. Session expiry and logout in another tab remove access.

Only ADMIN can enter `/admin/*` and login lands at `/admin/dashboard`. OPERATOR lands at `/operator/floor-map` (`/operator/dashboard` redirects there); ADMIN and OPERATOR can open `/operator/floor-map` and `/operator/cameras/:cameraId`. These screens need the backend branch that grants OPERATOR read access to store, floor, zone, map and camera APIs and to AI preview; without it they return 403. MANAGER and STAFF land at `/manager/dashboard` and `/staff/dashboard`, which identify the signed-in role; their operational workflows are not implemented. Cross-role URLs show Access denied; unknown roles never fall back to Admin. The first access check on a protected area blocks rendering; later checks on navigation run in the background, so the current screen stays mounted unless the role no longer qualifies.

Users & Roles uses `GET /api/users`, `GET /api/roles`, `POST /api/users`, `PATCH /api/users/{id}` and `POST /api/users/{id}/enable|disable`. Create assigns a backend role and an initial password of 12–128 characters; new accounts are ACTIVE. Edit changes full name and role; email is read-only. There is no invite, hard-delete or editable permission API. The role list is read-only. The UI protects the last active Admin, while the backend remains authoritative for concurrent changes. Changing your own role or disabling your own account signs you out immediately.

Create and Edit open an account dialog only after the corresponding button is clicked. Cancel, the close button and Escape discard the draft; a successful mutation closes the dialog and displays feedback in the Users card. Closing returns focus to the action that opened the dialog. The four role descriptions appear in equal-width cards below Users. Admin and camera-preview headers share a profile dropdown displaying full name, email and Logout; the profile icon itself does not sign out. Outside click, Escape and keyboard navigation dismiss the dropdown.

Verification on 2026-10-03: `npm test -- --run` passed **100 tests in 16 files**; `npm run build` and `npm run lint` passed. Account tests exercise the HTTP contract with controlled fetch responses, including create/edit/enable/disable, duplicate email, last-Admin rejection, retry, self-access changes and dialog cancellation. Access tests cover all four login destinations, direct cross-role URLs, server-role verification, revoked/disabled sessions, expiry, network failure and sign-out. Profile tests cover information display, Logout, outside click and keyboard interaction. Playwright checked the layout and account/profile dialogs in Edge at 1920×1080 and 1280×720 using synthetic read-only API responses, including native Escape cancellation, focus restoration and storage clearing on Logout. These checks do not claim an account mutation against the shared live database.

| MF-01 step | Current implementation | Remaining work |
| --- | --- | --- |
| Floor / zone in the default store | Store Layout creates/edits floor name and number in a dialog; loads saved floors/zones, uploads floor plans and saves zone polygons, color and physical area; dashboard links select the target floor/camera | Store is a single seeded default, with no create/select flow |
| Register & configure camera | Real registry, creation, live HTTP configuration and MP4 upload | Other live protocols are backend capabilities, not options in this form |
| Test & preview | Real test/enable and annotated YOLO + ByteTrack frames in React | Preview is a controlled test, not monitoring activation |
| Map camera to zone | Store Layout placement + camera-frame ROI drawing/editing/saving through same-floor N:M mapping API; links to configure the mapped zone | Cameras mini floor plan still uses sample geometry |
| Configure monitoring rule | AI Config loads real zones/catalog; saves per-zone confidence, incident/rule thresholds/units/timing/enabled to SQL Draft | Incident Types admin screen is still mock; checkout counter/composite definition is pending |
| Activate & health | AI Config has an explicit activation banner, reviews saved config/camera/source/ROI/rules and activates/deactivates via BE; DRAFT/INACTIVE deletion requires confirmation and saved version; Dashboard reads saved setup/readiness/health from the ADMIN overview API, links to the target configuration and supports an explicit health check | System Health screen is still mock; health-event Investigation/Resolve UI and continuous measurements/incident runtime (MF-02) remain separate work |

Forgot/reset-password and other operational screens remain prototypes unless separately integrated. Local UI state is not evidence of saved backend configuration.

### MF-01 Dashboard

`/admin/dashboard` uses `GET /api/setup/overview` from the matching backend change. Summary cards show floor/zone structure, activated configurations, enabled ACTIVE cameras online and unresolved health events. Six progress cards count saved setup prerequisites; an empty denominator does not imply completion. Zone rows show the saved configuration, rule counts and backend readiness blockers, with links to its AI Config detail and floor/camera layout. Activation stays in the reviewed AI Config workflow.

Camera rows separate lifecycle, health, connection enablement and last received frame. **Refresh** reads the snapshot; **Check health** explicitly probes the selected enabled ACTIVE camera through the existing ADMIN endpoint. Manage/Investigate links open that camera in Cameras for source correction, retest and preview. Opening the link does not change a health event to INVESTIGATING. System Health and full event investigation/resolution forms remain outside this increment.

Filter by floor, search zone/configuration/camera or show only records with missing setup/health requirements. Snapshot polling runs every 30 seconds while the tab is visible and is cancelled on unmount. Failed refresh keeps the last snapshot with a stale-data warning and retry. Missing default store seed and empty floors/zones/cameras have explicit guidance. No persisted preview-completion status, uptime calculation, automatic reconnect or continuous MF-02 runtime is inferred from configuration activation.

Verification on 2026-10-03 for this increment: **143 frontend tests across 19 files** passed, build and lint passed. Controlled HTTP tests cover snapshot auth, filters, read-only loading, empty/failure/retry states, health probing, polling cleanup and floor/camera query links. Browser verification uses synthetic API responses rather than shared-DB writes; see the backend validation log for matching backend results.

## Test AI with uploaded video (no phone required)

Start native AI, ASP.NET and React; see backend/AI-service READMEs. Backend needs FFmpeg. Backend and native AI must share the recorded-video directory on the same machine.

1. Ensure the default store is seeded, then use **Store Layout → Create floor** if no floor exists. Store Layout loads these records and saves floor plans, zone edits and camera placement through the APIs. **Edit floor** changes its name/number while retaining the current map, zones and cameras. Duplicate floor numbers show an error and retain the form; Cancel, close and Escape discard the input. Finish existing camera/zone/ROI edits before creating or editing floors.
2. **Cameras → Add camera → Uploaded video (test source)**, fill floor/code/name/dates, then **Save camera**. No phone URL is required. Or select an existing ACTIVE camera → **Upload video**.
3. Choose a non-empty MP4, maximum 200 MB → **Save video source**. Backend validates/decode-checks it and configures RECORDED/FILE. Old AI session is stopped; credentials/test/enabled flag are reset. Deactivate monitoring first if this camera is mapped to an ACTIVE configuration.
4. **Test & enable → Start AI preview**. React displays person boxes and camera-local ByteTrack IDs. Only the newest annotated JPEG is polled; not every processed frame is displayed.
5. At EOF, **Video completed** appears and the final frame remains. **Stop AI preview → Start AI preview** replays with a fresh tracker. Switching cameras/leaving stops the old preview.

Upload replaces the source, not camera identity or zone mappings. Review the ROI if the scene changes. Restore live input with **Configure connection**, then test again. Upload is a controlled fallback/demo, not incident creation or full MF-01 completion.

API: `POST /api/cameras/{cameraId}/recorded-video`, multipart `file`, ADMIN JWT. Browser sets the multipart boundary; React never calls Python or the phone directly.

## Configure monitoring after AI preview

Verification for this increment: **118 tests in 18 files passed**, production build and lint passed (existing Vite bundle-size advisory only). Monitoring tests use controlled HTTP responses; backend separately validates SQL persistence in isolated local databases. No live browser/shared-DB mutation acceptance or real GPU comparison is claimed.

Requires the matching BE monitoring increment and the approved Database migration already applied. Restart BE after building updated code.

1. **Store Layout → camera → Camera coverage**: select a floor zone, draw/save its camera-frame ROI. Floor polygon and camera ROI are different coordinate spaces.
2. Click **Configure monitoring for [zone]** in the ROI list or **Configure monitoring: [zone]** in Cameras. Alternatively open **AI Config** and select a real zone.
3. The team overview by floor, read-only zone detail and explicit Create/Edit/Cancel flow are retained. `?zoneId=<uuid>` opens detail. Set confidence 0–1 and Add rule. Both UI and backend require at least one saved rule; an empty array is rejected without changing the Draft. Long Queue uses PEOPLE (suggested3/5): 5s continuously observed in ROI before queue membership, then sustain. For overcrowding choose **Use people count (temporary)** with **new** whole-person warning/critical counts; this saves PEOPLE plus `measurementMode=PEOPLE_COUNT`, without m². Existing PEOPLE_PER_M2 thresholds/other JSON keys stay unchanged until explicit conversion; array parameters cannot be silently discarded. Unsupported legacy enabled rules may be unchecked, not re-enabled. Sustain/cooldown seconds default30/300. Successful Save closes the form; failed Save retains edits.
4. **Review & activate** rechecks saved version, source/test/enable, ROI and rules; exactly one ACTIVE camera mapping per-zone is required. Multiple cameras are not combined. Draft preview can restart only preview-only sessions; an active monitoring camera refuses Draft restart. Active preview attaches without resetting tracking.
5. **Deactivate configuration** before editing an active configuration/source/mapping/ROI. Failed saves preserve input; conflict requires **Reload saved configuration**. Dirty edits cannot be reviewed/activated until saved. **All zones** and **Reload saved configuration** ask before discarding unsaved changes; **Cancel** discards local form edits immediately.
6. **Delete configuration** is available for DRAFT/INACTIVE only. The dialog identifies configuration, zone and floor; Cancel, close and Escape dismiss it without a request and return focus. Confirm deletes only the config/rules, leaving Zone/Camera/ROI. A successful delete updates detail/overview to Not configured; a failed delete retains the dialog and saved data. The request includes configId and expectedUpdatedAt to reject stale or replaced configurations. Deactivate an ACTIVE config first.

Only AI-detected catalog types are offered. Checkout Capacity can be kept as a disabled Draft with an explicit placeholder unit, but cannot be enabled until its counter/composite measurement is defined. No confidence-based incident routing. No camera secrets in review.

**03/10 runtime increment:** Activate requests the BE worker (check actual runtime, not just ACTIVE). Operator camera live keeps team ROI/minimap and polls `/monitoring-runtime` + `/incidents` independently of JPEG viewing. It shows per-zone confidence/counts, Warning/Critical sustain, queue dwell, cooldown, errors/stale data and incident feed. **Stop live view does not stop active monitoring**. Recorded source/incident is DEMO. New incidents are **DETECTED — AI created, not dispatched**; lower counts do not close/downgrade incidents. At EOF deactivate every active configuration on the camera, wait for runtime STOPPED, then reactivate to replay. Density/m², Waiting Time, Checkout Capacity, dispatch/tasks/closure/media/analytics remain deferred. Apply Database migration01→02 and restart upgraded AI/BE before using this increment; no shared DB migration was run by the implementation.

Verification for the overview/detail/edit increment: **131 tests in 18 files passed** (`npm test -- --run --maxWorkers=2`); production build/lint passed. Browser checks in Edge at 1920×1080 and 1280×720 used synthetic API responses to verify grouping, read-only detail, Edit/Cancel, required incident-rule alerts without a PUT, focus, and closing the form after Save. These checks did not write to the shared database or exercise a real AI/GPU source.

API: `GET /api/incident-types`, `GET/PUT/DELETE /api/zones/{zoneId}/monitoring`, `GET .../review`, `POST .../activate|deactivate` (ADMIN). Updates and activation send the saved `expectedUpdatedAt`; full rules array replaces the prior rule set. DELETE sends `{configId, expectedUpdatedAt}` and returns 204. Floor creation uses `POST /api/supermarkets/{id}/floors`; floor metadata editing uses the matching new backend `PATCH /api/floors/{id}/details` with only `{floorNumber, name}`.

Verification for config deletion/activation visibility and floor dialogs (2026-10-03): **152 tests in 19 files passed**, production build/lint passed. Edge browser checks at 1920×1080 and 1280×720 used synthetic API responses to verify review blockers, Activate/Deactivate, active-delete restriction, delete conflict/confirmation/Escape/focus, overview updates, create/edit/cancel/duplicate floors, map preservation, empty floors/missing seed and page overflow. No shared-DB mutation or real AI/GPU test was performed. Restart the backend with the matching controller changes before using these actions.

Fresh verification for the ROI monitoring runtime increment (03/10/2026): **148 tests across 21 files passed** (`npm run test -- --run`), production build and lint passed. The existing large-chunk build advisory remains. Runtime/feed polling, stale/error handling, explicit count mode, owned monitoring preview, pending-stop guidance and retained team ROI/minimap are tested with controlled API responses; this is not a joint browser/native-AI/shared-DB acceptance run.

## Structure

```
src/
  assets/icons/      SVG icons exported from Figma (one file per colour variant)
  assets/icons.ts    icon('name') → URL
  components/        AdminLayout, Icon, shared UI (Button, Chip, Card, inputs…)
  data/mock.ts       sample data retained by screens not yet connected to APIs
  data/mockOps.ts    sample AI config, routing, health and audit data
  data/mockAuth.ts   fake sign-in / password reset
  data/floorPlan.ts  legacy/sample geometry retained by screens not yet migrated
  pages/             one file per admin screen (+ .module.css)
  pages/auth/        sign-in states and password recovery
```

## Backend integration

Set `VITE_API_URL` to the backend origin (default `http://localhost:5080`). Store Layout now:

- loads supermarkets, floors, zones and cameras from the ADMIN APIs;
- uploads/replaces PNG, JPEG or PDF floor plans up to 20 MB;
- downloads the protected map with the bearer token and renders PDFs with `pdfjs-dist`;
- renders each camera as a draggable/keyboard-accessible body, muzzle and field-of-view sprite;
- keeps screen coordinates normalized and persists `mapX`, `mapY` and `mapRotationDeg` only after **Save placement**;
- provides a draggable zone-editor toolbar with unified select/move/vertex-resize editing, centered zone labels, rectangle drag, point-by-point polygon drawing, colors, undo and save;
- stores rectangles as four normalized `mapPolygon` points and persists zone name, controlled uppercase Zone Type code, color and optional physical area;
- sends the complete camera PATCH DTO so metadata is not erased, and preserves unsaved edits after a failed save.

Camera creation/connection remains a separate flow. Placement saving does not test, enable, or start monitoring.

## Notes

- Authentication, Users & Roles, Cameras, Store Layout and AI Config have API-backed slices. Other screens still use mock/component state until their backend contracts are implemented.
- Model confidence is an input filter, not an incident severity/routing threshold; legacy Routing mock does not represent current AGENTS.md rules.
- Only the Light theme is wired. Dark colour tokens exist (`[data-theme='dark']`), but the Figma icons are exported in light-theme colours, so dark mode needs dark icon variants first.
