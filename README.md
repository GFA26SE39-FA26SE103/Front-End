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
| `/admin/ai-config` | AI incident rules, zone overrides, detection and health thresholds | Admin — AI Config |
| `/admin/incident-types` | Incident catalogue + new type form | Admin — Incident types |
| `/admin/routing` | Confidence routing (draggable 50 % / 80 %), broadcast & escalation | Admin — Routing & alerts |
| `/admin/users` | Users and role permissions | Admin — Users & Roles |
| `/admin/audit-logs` | Audit events, filters, details, CSV / JSON export | Admin — Audit log |
| `/admin/system-health` | Services, performance, alerts, incident pipeline | Admin — System health |

## Current integration status (2026-10-02)

Login uses the backend JWT API, not the old mock credentials. Set `VITE_API_URL=http://localhost:5080` in a local `.env` (also the default). Sign in with an existing backend ADMIN account. Requests attach the bearer token; a 401 clears the session.

| MF-01 step | Current implementation | Remaining work |
| --- | --- | --- |
| Store / floor / zone | Store Layout loads real stores/floors/zones; uploads floor plans and saves zone polygons, color and physical area | Store/floor creation UI and dashboard integration |
| Register & configure camera | Real registry, creation, live HTTP configuration and MP4 upload | Other live protocols are backend capabilities, not options in this form |
| Test & preview | Real test/enable and annotated YOLO + ByteTrack frames in React | Preview is a controlled test, not monitoring activation |
| Map camera to zone | Store Layout saves camera floor-plan placement; backend has same-floor N:M mapping and camera-frame ROI; Cameras lists saved mappings | Camera-to-zone mapping UI and camera-frame ROI drawing/saving; Cameras mini floor plan still uses sample geometry |
| Configure monitoring rule | Basic per-zone MonitoringConfiguration in BE; AI Config/Incident Types remain mock | ERD v3 rule persistence, warning/critical, units, sustain/cooldown and readiness validation |
| Activate & health | BE activation status and camera-health worker | Dashboard Activate changes local state only; connect readiness checks and continuous monitoring runtime |

Forgot/reset-password and other operational screens remain prototypes unless separately integrated. Local UI state is not evidence of saved backend configuration.

## Test AI with uploaded video (no phone required)

Start native AI, ASP.NET and React; see backend/AI-service READMEs. Backend needs FFmpeg. Backend and native AI must share the recorded-video directory on the same machine.

1. Ensure a store and floor exist in the backend (create through Swagger if needed). Store Layout loads these records and saves floor plans, zone edits and camera placement through the APIs.
2. **Cameras → Add camera → Uploaded video (test source)**, fill floor/code/name/dates, then **Save camera**. No phone URL is required. Or select an existing ACTIVE camera → **Upload video**.
3. Choose a non-empty MP4, maximum 200 MB → **Save video source**. Backend validates/decode-checks it and configures RECORDED/FILE. Old AI session is stopped; credentials/test/enabled flag are reset. Deactivate monitoring first if this camera is mapped to an ACTIVE configuration.
4. **Test & enable → Start AI preview**. React displays person boxes and camera-local ByteTrack IDs. Only the newest annotated JPEG is polled; not every processed frame is displayed.
5. At EOF, **Video completed** appears and the final frame remains. **Stop AI preview → Start AI preview** replays with a fresh tracker. Switching cameras/leaving stops the old preview.

Upload replaces the source, not camera identity or zone mappings. Review the ROI if the scene changes. Restore live input with **Configure connection**, then test again. Upload is a controlled fallback/demo, not incident creation or full MF-01 completion.

API: `POST /api/cameras/{cameraId}/recorded-video`, multipart `file`, ADMIN JWT. Browser sets the multipart boundary; React never calls Python or the phone directly.

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

- Authentication, Cameras, and Store Layout have API-backed slices. Other screens still use mock/component state until their backend contracts are implemented.
- Model confidence is an input filter, not an incident severity/routing threshold; legacy Routing mock does not represent current AGENTS.md rules.
- Only the Light theme is wired. Dark colour tokens exist (`[data-theme='dark']`), but the Figma icons are exported in light-theme colours, so dark mode needs dark icon variants first.
