# BUSINZ HRMS Mobile UX, Face Attendance and Performance Report

**Audit date:** 28 October 2026  
**Environment:** Local development workspace only  
**Production modified:** No  
**Production data modified:** No  
**Deployment performed:** No  
**Readiness decision:** **Not ready for production deployment**; see Remaining limitations and deployment gates.

## Scope and safety

This work preserved employee records, passwords, salary data and formulas, leave balances, policies, role permissions, historical attendance, and unrelated CRM behavior. No production service was restarted and no database migration was executed. The workspace has no top-level or nested Git metadata, so a feature branch could not be created locally; this must be corrected before deployment review.

Antigravity-specific MCP tools were not exposed in this session. Inspection and verification used repository analysis, TypeScript builds, Vitest, and Playwright browser automation.

## Root causes found

### Attendance correctness and security

1. Face Attendance called the synchronous `markAttendance` client state path instead of the authenticated `/attendance/punch` API.
2. The UI could announce success before a database write completed and direct browser writes could fail silently.
3. The backend accepted a client timestamp and therefore did not exclusively use an authoritative server/database clock.
4. The one-hour Punch Out rule existed only in client/local-storage logic; the backend transaction did not enforce it.
5. Duplicate protection used an in-memory four-second map. It did not protect across server instances, restarts, or concurrent requests.
6. Existing persistence used separate PostgREST reads and writes without a database transaction or row/advisory lock.
7. Persistence errors were caught and logged while the endpoint could still return success.
8. Face photos and idempotency keys were optional in request validation.
9. Camera capture contained a generated fallback frame when the live video was unavailable. This was removed; the flow now fails closed.
10. The existing `verifyFace` repository method is a placeholder that accepts any sufficiently long image and returns fixed confidence. This is a pre-existing blocker to production biometric verification.

### Performance

1. AppLayout eagerly imported most daily-use feature modules into the initial bundle.
2. The initial production JavaScript chunk was **2,122.50 kB / 555.79 kB gzip**.
3. The large `HRMSContext` and shared icon/runtime dependencies remain in the initial dependency graph.
4. Isolated UI tests showed unrelated modules requesting expenses, petty cash, settings, and AI status during startup. Those calls failed only because the isolated test intentionally did not run a backend, but the pattern warrants a later authenticated network audit.

### Mobile UX

The repository already contained a substantial mobile presentation layer: compact cards, mobile table alternatives, bottom navigation, keyboard handling, and responsive screenshots across 320, 375, 768, and 1280 px. The current change retained that layer and concentrated on the unsafe attendance path, exact role navigation, camera readiness, feedback, and route loading.

## Implemented mobile and attendance changes

### Server-authoritative state machine

The following transitions are now enforced by shared backend logic:

`NOT_CHECKED_IN -> CHECKED_IN -> CHECK_OUT_AVAILABLE -> CHECKED_OUT`

- Punch In writes `check_in` and `check_in_photo` only.
- Punch In leaves `check_out` and `check_out_photo` null.
- Punch Out before Punch In is rejected.
- Duplicate Punch In and Punch Out are rejected.
- Punch Out is rejected until one full hour has elapsed from the stored database `check_in` timestamp.
- Elapsed timestamps, rather than time-of-day strings, support overnight shifts.
- Punch Out rejects the exact Punch In photo fingerprint for Face Attendance.
- No timer automatically generates Punch Out.

### PostgreSQL transaction and idempotency

The new transaction path:

1. Takes a PostgreSQL transaction-scoped advisory lock for the employee.
2. Rejects a previously committed idempotency key.
3. Reads `clock_timestamp()` from PostgreSQL.
4. Locks the attendance row with `FOR UPDATE`.
5. Validates the state transition and one-hour rule.
6. Updates/inserts the attendance record.
7. Inserts an immutable punch event with its idempotency key and photo fingerprint.
8. Commits both changes together or rolls both back.

The migration is additive and does not rewrite historical attendance:

- Adds `attendance_records.idempotency_key` when absent.
- Creates `attendance_punch_events`.
- Adds lookup indexes.

The migration has **not** been executed in any database.

### Face Attendance client flow

- Punch In/Punch Out now calls the authenticated face-verification endpoint and then the punch endpoint.
- A unique idempotency key is generated for every requested transition.
- Success is displayed only after the punch endpoint returns a committed record.
- Server-returned attendance is merged into UI state without writing it a second time.
- The camera uses the front-facing constraint.
- Camera and GPS permission acquisition remains concurrent.
- GPS requests use high accuracy and zero-age sampling through the existing acquisition service.
- The camera must have non-zero live video dimensions before capture or before showing readiness.
- Camera tracks are stopped after success, cancellation, failure, or component unmount.
- Punch Out opens a new media stream and performs a new explicit capture.
- The disabled state says `Punch Out available at <time>`.

### Navigation

Automated assertions confirmed the exact requested mobile tabs:

- Employee: Home / Attendance / Leave / Tasks
- HR: Home / Employees / Attendance / Leave / Chat Bot
- CEO: Home / Approvals / Employees / Reports / Chat Bot
- Accounts: Home / Attendance / Payments / Claims / Tasks

The chatbot accessible name remains **BUSINZ Chat Bot**. Remaining authorized modules stay in the existing drawer, and module rendering continues to use the existing permission check.

## Screenshots

Baseline repository audit image:

- [Mobile Face Attendance baseline](frontend/audit_screenshots/mobile-375_face_attendance.png)

Current verified development images:

- [Face Attendance ready state, 390 px](frontend/audit_screenshots/after-face-attendance-ready-390.png)
- [One-hour Punch Out lock, 390 px](frontend/audit_screenshots/after-face-attendance-one-hour-lock-390.png)

The current images use mocked development identity, camera, GPS, and attendance API responses. They do not contain production employee records.

## Performance measurements

| Measurement | Before | After | Result |
|---|---:|---:|---:|
| Initial main JS chunk | 2,122.50 kB | 1,421.85 kB | 33.0% smaller |
| Initial main JS gzip | 555.79 kB | 407.24 kB | 26.7% smaller |
| Initial CSS | 201.37 kB | 180.61 kB | 10.3% smaller |
| Face Attendance route chunk | Included in main | 59.89 kB / 14.70 kB gzip | Loaded on demand |
| Final Vite production build | — | 2.65 s | Passed |

Employee Directory, Face Attendance, Leave, Shift, Tasks, Expenses, Attendance Reports, Profile, Accounts Payments, Chat Bot, and existing secondary heavy modules now load through route-level `React.lazy` boundaries. Dashboard and navigation remain eager.

The following were **not truthfully measurable** without an authorized running development backend/database and physical devices: login latency, dashboard API completion, PostgreSQL query latency, real camera initialization, real GPS acquisition, real attendance submission latency, LCP/INP, and network-cache behavior. No fabricated values are reported.

## Test evidence

### Builds

- Backend `npm run build`: passed.
- Frontend `npm run build`: passed.
- Vite transformed 2,324 modules and produced the route chunks above.

### Backend tests

Focused Vitest result: **14 passed / 14**.

- Six Face Attendance/state-machine tests:
  - Mandatory idempotency key.
  - Punch In produces CHECKED_IN only.
  - Duplicate Punch In rejection.
  - One-hour server-time boundary.
  - Separate Punch Out photo requirement.
  - Overnight elapsed-time handling and geofence calculation.
- Eight existing shift attendance engine tests passed.

### Browser tests

- Role navigation and desktop regression: **9 passed / 9**.
- Mocked Face Attendance camera/GPS workflow: **1 passed / 1**.
- Tested viewports/user agents:
  - 412 x 915 Android Chrome profile.
  - 390 x 844 iPhone Safari profile.
  - 1280 x 800 desktop.
- Touch targets were asserted at a minimum height of 44 px.
- Mobile tab count, order, active state, chatbot title, and Accounts sidebar restrictions were asserted.
- Desktop asserted that the mobile bottom navigation remains hidden.

These runs used the installed Chromium/Edge browser engine with Android/iPhone user-agent emulation. They are not a substitute for physical Android Chrome and iPhone Safari/WebKit testing.

### Existing responsive audit evidence

The existing workspace audit contains screenshots for dashboard, employees, face attendance, attendance, leave, shifts, overtime, performance, tasks, tracking, customer data, WhatsApp CRM, finance, payroll, advance salary, petty cash, reports, organization, assets, and settings at 320, 375, 768, and 1280 px. Its JSON audit reports no page-level horizontal overflow, while intentionally contained report tables remain wider than their scroll containers.

## Modified files

- `backend/src/controllers/attendanceController.ts`
- `backend/src/repositories/attendanceRepository.ts`
- `backend/src/services/attendanceStateMachine.ts`
- `backend/src/validators/attendanceValidators.ts`
- `backend/tests/faceAttendanceVerification.test.ts`
- `deploy/vps/db/31-attendance-punch-state-machine.sql`
- `frontend/src/services/attendanceApi.ts`
- `frontend/src/components/attendance/FaceAttendance.tsx`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/context/HRMSContext.tsx`
- `frontend/e2e/mobile-navigation.spec.ts`
- `frontend/audit_screenshots/after-face-attendance-ready-390.png`
- `frontend/audit_screenshots/after-face-attendance-one-hour-lock-390.png`

## Remaining limitations and deployment gates

1. **Real face verification is not implemented in the existing backend.** The current repository method is a fixed-confidence placeholder. Production must remain blocked until it is connected to an approved biometric verifier with enrollment, liveness/anti-spoofing, threshold policy, auditability, privacy controls, and failure handling.
2. Apply `31-attendance-punch-state-machine.sql` to an isolated development database, never directly to production first.
3. Run database integration tests proving rollback, concurrent IN/OUT serialization, idempotent replay behavior, one-hour boundary, photo separation, and unchanged historical rows.
4. Verify schema compatibility, especially enum values and attendance constraints, against a development clone.
5. Test on physical Android Chrome and iPhone Safari. Confirm permission denial/retry, camera switching, background/resume, low light, inaccurate GPS, stale GPS, and slow networks.
6. Validate authorized Field Duty and HR manual correction paths against the development database.
7. Capture real development timings for login, dashboard, APIs, PostgreSQL, navigation, camera, GPS, and submission.
8. The initial main chunk remains 1.42 MB. Further work should split `HRMSContext` by domain and reduce broad icon/shared imports after regression coverage is expanded.
9. Run the complete form and module browser suite with a running development backend. The isolated UI run logged expected failures for unrelated backend calls and therefore does not prove persistence for every form.
10. Restore Git history or place this workspace in a proper repository, create a feature branch, and obtain code/database review before deployment.

## Production deployment readiness

**Not ready.** The corrected flow is compiled and development-tested with unit and mocked browser tests, but biometric verification and real PostgreSQL transaction integration remain mandatory blockers. No deployment should occur until all gates above pass and explicit production approval is provided.
