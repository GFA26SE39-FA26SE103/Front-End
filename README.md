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
| `/admin/store-layout` | Floor → zone → camera, camera covers 1..N zones | Admin — Store layout |
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
  data/mock.ts       sample store, camera, zone, user data — replace with API calls
  data/mockOps.ts    sample AI config, routing, health and audit data
  data/mockAuth.ts   fake sign-in / password reset
  data/floorPlan.ts  Floor 1 plan geometry (zones, fixtures, camera positions)
  pages/             one file per admin screen (+ .module.css)
  pages/auth/        sign-in states and password recovery
```

## Notes

- All data is mock data kept in component state; nothing is saved yet. Places that need an API call are marked `TODO`.
- Only the Light theme is wired. Dark colour tokens exist (`[data-theme='dark']`), but the Figma icons are exported in light-theme colours, so dark mode needs dark icon variants first.
