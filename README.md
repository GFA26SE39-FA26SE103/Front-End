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

### Demo sign-in rules (mock, `src/data/mockAuth.ts`)

- Any email with `@` and any password signs in and opens the admin dashboard.
- Password `wrong` → "Email or password is incorrect"; 5 wrong attempts lock sign-in for 15 minutes.
- Email containing `suspended` → account suspended; email containing `error` → unable to sign in.

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
- Only the Light theme is wired. Dark colour tokens exist (`[data-theme='dark']`), but the Figma icons are exported in light-theme colours, so dark mode needs dark icon variants first.
