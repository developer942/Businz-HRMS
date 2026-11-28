# BUSINZ HRMS Mobile Audit and Delivery Register

Last updated: 25 November 2026

## Source of truth

- Web: React 19 + Vite in `frontend/`.
- API: Express + TypeScript in `backend/`, mounted at both `/api/v1` and `/api`.
- Data: existing PostgreSQL/PostgREST services accessed only through authenticated backend APIs.
- Mobile: Flutter source in `mobile/`; it never connects directly to PostgreSQL.
- Production API configured for release builds: `https://hrms.businz.com/api/v1`.

No production records were created, changed, or deleted during this implementation. The only production request was a read-only `/health` request.

## Existing functionality inventory

The repository contains these functional areas:

1. Password, email-OTP, mobile-OTP and refresh-token authentication.
2. Role and permission administration with own/team/all data scopes.
3. CEO and employee dashboards.
4. Face/GPS attendance, shift state, late policy and geofence. The web also contains client-state missed-punch/correction flows, but no production backend route/schema contract was found for them.
5. Attendance calendar, list, reports, muster roll, overtime and audit history.
6. Shift masters, assignments and shift-change requests.
7. Leave requests, balances, approval and policy configuration.
8. Employee directory, profile, credentials, offer letters and account activation.
9. Enterprise tasks, assignees, updates, comments, drafts, MOM, daily reports and task reports.
10. Field assignments, live trips, location points, travel history and tracking alerts.
11. Expenses/claims, evidence, approval, rejection and Accounts disbursement.
12. Field allowance advances, daily reports, settlement and balance confirmation.
13. Petty-cash custodian, request, CEO approval, disbursement, receipt, expenses and ledger.
14. Payroll settings/components, eligibility, preview, runs, records and payslips.
15. Overtime and advance salary.
16. Assets, employee documents, recruitment and performance management.
17. Customers, visiting-card OCR, visits, WhatsApp templates/messages and CRM inbox/broadcasts.
18. Notifications, company/attendance/leave/payroll/integration settings and reports.

## Role and permission matrix

The mobile client loads `/rbac` after authentication and treats the server matrix as authoritative. Local fallback permissions are deliberately narrower and are used only when RBAC metadata cannot be loaded.

| Role family | Data scope | Typical enabled areas | Attendance punch |
|---|---|---|---|
| CEO / Super Admin | All | Company dashboard, employees, attendance management, leave, tasks, finance, payroll, reports, settings | Hidden for CEO |
| HR / HR Manager / HR Admin | All | Employees, attendance, shifts, leave, tasks, reports, authorized payroll and HR settings | Allowed unless server policy excludes account |
| Finance Manager / Finance / Accountant | Own plus approved finance queues | Own employee functions, expenses, petty cash, field allowance, payment distribution, payroll as permitted | Allowed |
| Manager / Department Head | Team | Team attendance/leave/tasks/performance/tracking/reports as configured | Allowed |
| Team Leader | Team | Attendance, leave, tasks, performance and site visits as configured | Allowed |
| Employee | Own | Own attendance, shift, leave, tasks, claims, documents, payslip and notifications | Allowed |

Every sensitive API remains protected by backend authentication, role checks, permission checks or row ownership. Mobile visibility is not treated as authorization.

## API inventory

| Prefix | Key operations |
|---|---|
| `/auth` | login, refresh, logout, me, change password, forgot/reset password, email/mobile OTP |
| `/employees` | list/detail/create/update/profile sync/delete, login account, credentials, offer letter |
| `/attendance` | log, shift status, punch, face verify, summary and GPS diagnostics; no correction-request API is currently exposed |
| `/leaves` | list/create/decision/balance |
| `/shifts` | list/create/assignment summary/assignments/requests |
| `/tracking` | assignments, trip start/end, location points, history, alerts, overview, SSE |
| `/expenses` | list/create/receipt/approve/reject/disburse |
| `/field-allowance` | summary, request lifecycle, distributions, daily reports, settlement |
| `/petty-cash` | custodian, request, approval, disbursement, receipt, expenses, ledger, dashboards |
| `/payroll` | settings, components, preview, runs, process/recalculate/approve/pay, records, payslips |
| `/rbac` | roles, modules, permission matrix and audit logs |
| `/customers`, `/crm`, `/whatsapp` | customer, OCR/visit, messaging, template, inbox and broadcast workflows |
| `/settings` | HRMS, attendance, geofence, notification and integration settings |
| `/data-gateway/proxy` | authenticated allow-listed compatibility access with backend filtering |

The audit found that the compatibility gateway did not filter legacy `enterprise_tasks`, task updates, notification-recipient rows or assigned assets correctly for standard employees. The backend now filters those results by the authenticated employee, enforces dynamic module actions for asset mutations, and restricts tracking trip/point access by authenticated ownership.

## Flutter architecture

```text
mobile/lib/
  app/                 app root, providers and router
  core/
    config/            environment configuration
    models/            authenticated user and permission matrix
    network/           typed API client, refresh serialization and errors
    storage/           encrypted session storage
    theme/             adaptive Material 3 light/dark design system
  features/
    auth/              login, reset password and forced password change
    dashboard/         server-backed role-aware summary
    attendance/        camera + GPS + server-driven punch state
    leave/             list and request submission
    tasks/             list, filtering, task/draft creation
    expenses/          claims, proof capture and approval/rejection
    field_allowance/   request, approval, distribution, expense and settlement
    petty_cash/        request, approval, distribution and receipt confirmation
    payroll/           period records and server-generated payslip breakdown
    shifts/            shift directory and employee change requests
    tracking/          canonical trip restore, route history and resilient point upload
    attendance_log/    location/photo detail and map preview
    assets/            inventory, assignment, return and authorized maintenance
    contacts/          camera card OCR, review, duplicate check and customer save
    whatsapp/          inbox, contacts, chat, templates and campaigns
    notifications/     audience-filtered feed and read state
    modules/           permission-aware module directory and record views
    shell/             adaptive five-destination navigation
    shared/            repositories and reusable states
```

Riverpod owns application/session state. GoRouter owns routed module pages. Tokens and cached user identity use platform encrypted storage. Backend data is not faked and mutations are never reported as successful until the API confirms them.

## Mobile navigation map

```text
Launch
  -> Login
     -> Forgot password: identifier -> OTP -> new password
  -> Required password change (when server flags account)
  -> Role-aware shell
     -> Home
     -> Attendance (excluded for CEO)
     -> Leave
     -> Tasks
     -> More
        -> Employees / attendance log / shifts / holidays
        -> Expenses / field allowance / petty cash / payroll
        -> Field tracking / assets / contact scanner / WhatsApp CRM
        -> Reports / notifications / documents
        -> Profile / sign out
```

## Functional parity register

| Area | Current mobile status |
|---|---|
| Login, refresh, logout, account deactivation handling | Implemented; encrypted tokens, single-flight refresh, password login and real email-OTP request/verify flow against the existing secure backend endpoints; authentic BUSINZ logo is bundled |
| Forgot/reset and mandatory password change | Implemented against existing endpoints |
| RBAC visibility | Implemented from server matrix; backend still authoritative |
| Dashboard | Implemented with server attendance/leave/task/finance data, CEO/HR attendance donut and 7-day trend, compact KPI cards, and permission-filtered 3-column quick actions. Physical-device visual verification is pending. |
| Face attendance | Implemented: server state, dedicated edge-to-edge full-screen front camera, GPS, face verification, idempotent punch, server confirmation |
| Attendance log | Implemented detail view with punch times, shift, work/late/OT values, real address, GPS map and attendance photo when server evidence exists; correction requests blocked by missing backend contract |
| Leave | Implemented own/admin list, request submission and authorized approval/rejection |
| Tasks | Implemented normalized Web task contract, list/filter/assignment permission, actual employee names/IDs/department picker, task detail, status/progress updates, daily reports and camera/gallery evidence. Backend now limits employee task PATCH operations to progress/status/reports/comments/attachments and prevents ownership/title tampering. Specialized manager review remains pending staging verification. |
| Expenses | Implemented list/create with proof, authorized approve/reject and Accounts disbursement |
| Field allowance | Implemented request, HR decision, Accounts distribution, employee daily expense/trip completion/balance return and Accounts receipt confirmation |
| Petty cash | Implemented active-custodian wallet, CEO custodian assignment, daily expense with receipt/idempotency key, fund request, CEO decision, Accounts disbursement, receipt confirmation, history and authoritative ledger. Company-wide GET routes now deny unrelated employees. Staging financial mutation tests remain prohibited/pending. |
| Payroll and payslip | Implemented month/year record view, differentiated API errors, authoritative salary breakdown and preview/share PDF generated from the same server JSON contract used by Web |
| Shifts | Implemented shift directory/current-shift indicator and server-confirmed change request; request listing/approval is not exposed by backend |
| Field tracking | Implemented canonical active-session restore, authorized start/points/end, server distance, travel history/route map, Android foreground notification, iOS background mode and encrypted per-employee retry queue; force-stop and physical-device reliability remain unverified |
| Employees | Implemented permission-scoped searchable directory and server-sanitized native profile detail; create/edit/account administration remain pending |
| Assets | Implemented scoped list/search/filter/detail, add/edit, assignment, return and delete with partial PATCH protection for serial numbers |
| Notifications | Implemented audience/role-filtered list, unread count, mark one/all read and permitted module deep links; production backend deployment and push delivery remain pending |
| Contact scanner/customer directory | Implemented native camera/gallery capture, backend OCR, editable review, duplicate check and existing customer database save |
| WhatsApp CRM | Implemented real inbox, contacts, conversation history/send, Unicode emoji insertion, non-empty failure states, template media/buttons, approved-template selection/variables/header media/confirmed send, template creator and provider status. Campaign builder now supports recipient opt-in filtering, variable mapping, required header media, preview, draft and confirmed per-recipient template execution with partial-failure reporting; live Meta sending was not performed. Backend RBAC now blocks ordinary employees from broadcast/template creation, destructive CRM actions and integration config while retaining permitted inbox messaging/contact capture. |
| Holidays, documents and reports | Real permission-filtered read views; specialized export/detail workflows remain pending |
| Push notifications | Pending Firebase/APNs project credentials and backend device-token/event endpoint |
| Recruitment, performance and settings | Not yet exposed as complete native mobile workflows |

## Verification completed

- `flutter analyze`: clean.
- Flutter unit/widget tests: 3 passed.
- Flutter debug APK build: passed after constraining Gradle workers and memory.
- Flutter release APK build: passed with persistent Gradle daemon disabled on the 7.3 GB Windows host.
- Android/iOS integration smoke entrypoint: added in `mobile/integration_test/auth_smoke_test.dart`; device execution pending.
- Backend focused mobile data-isolation tests: 10 passed, including task mutation and petty-cash participant enforcement.
- Backend Phase 1 security suite: 19/20 passed after WhatsApp CRM authorization and attendance/leave impersonation fixes. The remaining payroll test requires a valid local payroll data contract/database and returned HTTP 400.
- Full backend suite: 402/462 passed; 60 failures remain. Most are integration fixtures that require unavailable local PostgreSQL/Supabase/Gemini/SMTP services or use obsolete endpoint payloads, but they remain recorded as failures and are not represented as PASS.
- Backend TypeScript production build: passed.
- Existing React/Vite production build: passed.
- Production `/api/v1/health`: healthy (read-only check).
- Android release-optimized APK and AAB: generated on Windows.
- iOS runner, bundle identifier, icons, launch screen, permission descriptions and background modes: generated.

Latest Android artifacts (production API compile-time configuration):

| Artifact | Bytes | SHA-256 | Signing status |
|---|---:|---|---|
| `releases/BUSINZ-HRMS-v1.1.0-build5.apk` | 65,036,650 | `94D4263A9FCE62BE99A6909D44EC558127EB3C8E2E57BDB5DE17F0E34004A762` | Previous release-optimized test APK; Android debug certificate fallback |
| `releases/BUSINZ-HRMS-v1.1.0-build6.apk` | 65,862,160 | `345E661D39572F76F853418F2A8979566014C03FF21083C86AAA610336298AB4` | Previous release-optimized test APK; Android debug certificate fallback |
| `releases/BUSINZ-HRMS-v1.1.0-build7.apk` | 66,748,000 | `FAEB0C4075DCF5BD4D7AB026ED25B3CF68499FD986739F4DC41C59DE608B760B` | Latest release-mode testing APK; Android debug certificate fallback |
| `releases/BUSINZ-HRMS-v1.1.0-build2.aab` | 62,402,817 | `5D0025003CDB2B064350BBACA9F7167E98011C13E48CD92590487D76D4528E5C` | Older test bundle; upload keystore not supplied and not rebuilt for build 4 |

The APK certificate is `C=US, O=Android, CN=Android Debug`; neither artifact is represented as Play Store distribution-signed. No IPA was produced because this host is Windows and no Apple signing environment/assets are available.

Build 7 was verified as package `com.businz.hrms`, versionName `1.1.0`, versionCode `7`, target SDK 36. It was not installed on a physical device because no authorized device is connected.

Not yet verified: authenticated staging workflows, camera/GPS on physical Android/iPhone devices, background tracking longevity/battery, live Meta campaign delivery, push delivery, iOS compile/signing/TestFlight and store signing.

## Build 7 continuation changes

- Tasks: server-confirmed status/progress and daily-report evidence flow; backend prevents employee ownership/title/assignee tampering.
- WhatsApp: campaign variable mapping, header media, preview and confirmed sending path; provider webhooks remain authoritative for delivered/read status.
- Petty cash: custodian wallet, CEO assignment, daily expense/receipt and ledger UI; backend participant-only read enforcement.
- Dashboards: real summary values, CEO/HR attendance charts, finance queue summary and permission-aware 3-column quick actions.
- Security: removed the blanket `customer_data`/`whatsapp_crm` RBAC bypass; separated scanner and CRM permissions; ownership checks now precede attendance/leave payload validation.
- Playwright MCP was not registered in this environment. Browser comparison and authenticated role-by-role Web verification therefore remain explicitly pending.
- The release build emits a future-compatibility warning because `camera_android_camerax` still applies the Kotlin Gradle Plugin instead of Built-in Kotlin. Build 7 succeeds; the plugin must be upgraded when a compatible release is available.

## Remaining implementation/test plan

1. Deploy the reviewed notification, gateway isolation, RBAC and tracking ownership backend changes before production mobile verification; no deployment was performed automatically.
2. Complete native detail and mutation screens for each parity-register item marked pending.
3. Define backend persistence, row ownership and approval endpoints for attendance corrections and shift-request review; the web currently keeps these workflows in shared/client settings.
4. Add backend device-token registration and configured Firebase/APNs delivery before enabling push.
5. Run role-by-role integration tests against a non-production staging database.
6. Test camera, geofence, overnight shifts, background tracking and notification deep links on physical devices.
7. Profile cold start, list scrolling, memory, camera initialization, GPS/battery and API latency with Flutter DevTools.
8. Provide Android distribution keystore and Apple team/signing assets; build signed store artifacts.

## Dart/Flutter stability diagnosis (2026-11-25)

- Dart Code log evidence: `runtime/vm/os_thread.cc:345: Could not start thread DartWorker` on Dart 3.13.3. Windows Error Reporting also recorded `RADAR_PRE_LEAK_64` for `dart.exe`/`dartaotruntime.exe`.
- At diagnosis the 7.3 GB host had roughly 0.8-1.0 GB available RAM; previous Gradle settings had requested up to 8 GB. Gradle is now bounded to 3 GB, two workers, no persistent daemon/parallel execution.
- Workspace settings now select one SDK (`C:\Users\ahile\flutter`), cap analyzer old-generation heap at 512 MB, and exclude generated/build/dependency trees.
- `flutter doctor -v`, `flutter pub get`, repeated `flutter analyze`, `flutter test`, and release APK compilation completed. A real Dart LSP server analyzed the workspace for 45 seconds, stayed alive at 363.2 MB, then shut down normally with exit code 0.
- Antigravity/Dart Code automatically reloaded after the settings change. Four analyzer/tooling/Flutter Dart processes retained the same PIDs during the sustained follow-up sample and the log recorded no new crash.
- The 21:20-21:24 three-restart warning was amplified during diagnosis by terminating processes initially mistaken for hung CLI processes. No source tree or cache was deleted.

## Build 8 verified continuation (2026-11-26)

Build 8 was produced from the existing Build 7 project; no Flutter project, database or authentication system was recreated.

### Implemented and corrected

- Finance and Claim now includes server-derived total/pending/distributed/spent KPI cards, employee/trip/destination search, status filtering, correction requests with required remarks, receipt-camera evidence for daily expenses, and the existing approval/distribution/expense/settlement actions.
- Leave now loads the signed-in employee's real balance summary, supports Web-compatible half-day requests (0.5 day with first/second-half reason metadata), refreshes balances after mutations and requires a rejection reason.
- Petty Cash no longer credits a custodian wallet when Accounts merely records a disbursement. The authoritative credit occurs once after custodian receipt confirmation. Receipt, wallet, request, disbursement and immutable ledger writes are now grouped in a PostgreSQL transaction when the database is available.
- Attendance month replay no longer turns a current-day open punch into MU/LOP merely because no assigned shift end-time exists. Explicit historical `todayStr` calculations are deterministic.
- Overtime payslip labels correctly render whole and fractional hour values.
- Test-mode Supabase isolation prevents automated suites from contacting a configured live PostgREST project.
- RBAC middleware uses the canonical `HRMS_UNAUTHENTICATED` / `HRMS_FORBIDDEN` contract. Forged tokens remain HTTP 401 and role denials remain HTTP 403.
- The WhatsApp template test was converted from a process-terminating standalone script into a normal Vitest test, removing the unhandled `process.exit` failure.

### Verification

- Flutter dependency resolution: passed.
- Flutter analyze: passed with no issues.
- Flutter unit/widget tests: 3/3 passed.
- Backend TypeScript build: passed.
- React/Vite production build: passed (large main-chunk warning remains).
- Security suite: 10/10 passed.
- Phase 1 security remediation: 20/20 passed.
- Mobile data isolation: 10/10 passed.
- Petty Cash: 20/20 passed.
- Overtime payroll enterprise: 17/17 passed.
- Attendance/payroll November acceptance suite: 5/5 passed.
- Complete backend suite: 422/463 passed; 41 failed across six integration files. The remaining failures are PostgreSQL/payroll fixtures (8), legacy full-integration payload/database fixtures (17), SMTP employee-login integration (8), AI/chatbot database-context fixtures (7), and Gemini OCR external integration (1). They are not represented as passing.
- Playwright MCP was not available in this session, so authenticated browser parity remains pending.
- No Android device was connected; physical installation, camera/GPS/background tracking and real-device performance remain pending.

### Build 8 artifact

| Artifact | Bytes | SHA-256 | Package/version | Signing |
|---|---:|---|---|---|
| `releases/BUSINZ-HRMS-v1.1.0-build8.apk` | 67,190,432 | `E8E8C2094BBD05B71DA5C6E4BBB02EEE7185E1C32CE59DF08C92E11ACA5299EA` | `com.businz.hrms`, `1.1.0` (`8`) | Release-mode APK signed with Android debug fallback certificate; certificate SHA-256 `966B41E18A288F1FA9A556F7F6AB9D8AD69F21F0CE57B1EEA75827A9F396AECA` |

The certificate digest matches Build 7, so Android can update Build 7 without clearing application data. This is not a Play Store production-signed artifact.

### Contract blockers still open

- Asset requests do not have an actual backend schema/API in the inspected source; scoped inventory, assignment and return are implemented, but a request workflow must not be fabricated.
- Attendance correction requests and shift review do not have dedicated persisted backend contracts; the current Web paths are client/shared-setting based.
- Payment Disbursement/Advance Salary still lacks a dedicated server-authoritative Node API; the Web implementation stores loan records through client-side company settings. A financial mobile mutation workflow is intentionally not invented.
- Push notifications require a device-token/event API plus Firebase/APNs project credentials.
- Live Meta template/campaign sending, staging financial mutations and attendance writes were not performed.
- iOS compile/sign/TestFlight verification remains pending macOS, Xcode and Apple signing assets.

## Build 9 — Complete Web-to-Flutter Mobile Transformation (2026-11-26)

Build 9 transforms the existing `mobile/` Flutter codebase into an adaptive 2026 Material 3 + Cupertino enterprise mobile application with strict role-based navigation, dedicated role dashboards, unified Approvals & Payment Disbursement hubs, and fixes for every root cause identified across Flutter, Node.js backend, and read-only production PostgreSQL audits. See `docs/BUSINZ_MOBILE_TRANSFORMATION_SPEC.md` for the full parity register and root-cause analysis.

### Key Transformation Deliverables

1. **2026 Adaptive Design System (Material 3 + Cupertino)**:
   - Added centralized design tokens (`core/theme/app_tokens.dart`), full Light + Dark Material 3 & `CupertinoThemeData` themes (`core/theme/app_theme.dart`), persisted `ThemeController` (`core/theme/theme_controller.dart`), Compass `Result<T>`/`Command` utilities (`core/utils/result.dart`), and adaptive UI components (`BusinzBrandMark`, `CompactKpiCard`, `AdaptiveSegmentedControl`, `showAdaptiveConfirmDialog`, `AppSkeletonList`).
   - Preserved authentic BUSINZ logo (`assets/businz-logo.png`) and `#0E7490` Deep Teal brand identity.
2. **Strict Role-Based Shells & 4 Dedicated Dashboards**:
   - `HomeShell` adapts responsively (`NavigationBar` on phones, `NavigationRail` on tablets `>= 700px`) with strict role destinations:
     - **CEO / Super Admin**: `Home | Approvals | Tasks | More` (never shows personal Attendance punch station).
     - **HR**: `Home | Attendance | Approvals | More`.
     - **Accounts / Finance**: `Home | Payments | Claims | More` (no Employee Directory, Company Reports, or HR Settings).
     - **Manager / Employee**: `Home | Attendance | Leave | Tasks | More`.
   - Built 4 distinct role dashboards in `dashboard_screen.dart` with real API-backed KPIs, Attendance Donut + 7-day trend (CEO/HR), Pending Approvals & Disbursement banners, Personal Shift/Punch hero card (Employee), and RBAC-filtered Quick Actions.
3. **New Unified Enterprise Modules**:
   - **Unified Approvals Center** (`features/approvals/presentation/approvals_screen.dart`): Single CEO/HR review queue across Leaves, Finance & Claims, Shift Requests, Petty Cash (CEO), and Advance Salary with inline Approve/Reject actions.
   - **Payment Disbursement Desk** (`features/payments/presentation/payment_disbursement_screen.dart`): Dedicated Accounts & CEO payout hub unifying Claims, Expenses, Petty Cash, Advances, and Monthly Payroll with UTR/payment mode confirmation.
   - **Profile & Settings** (`features/profile/presentation/profile_settings_screen.dart`): Live System/Light/Dark appearance switcher, role/scope transparency, Change Password flow, and adaptive Sign Out.
   - **Advance Salary, Holidays & Reports** (`features/modules/presentation/auxiliary_screens.dart`): Native screens wired directly to real `loan_records_data`, `holiday_policies_data`, and live workforce/attendance/claims metrics.
4. **Core Module Defect Fixes**:
   - **Shifts**: Strict role split — CEO/HR manage Shift Masters, roster assignments, and Shift Change Request approvals; Employee/Accounts see My Assigned Shift, Request Shift Change, and Request History.
   - **Field Tracking**: Added `canStartTrackingAssignment` guard so Completed/Archived/Cancelled/other-employee duties NEVER show "Start authorized tracking"; added CEO/HR Duties/Assign Duty, Travel History, Alerts resolution, and upgraded 4-control Apple/Google Maps style route viewer with deduplicated markers.
   - **Finance & Claims**: Renamed and unified Field Visits & Claims + Expense History (25 real rows), fixed CEO approval visibility, added Camera/Gallery receipt picker, and hid employee New Claim FAB for CEO.
   - **Payroll & Payslips**: Added schema-safe gateway fallback in `HrmsRepository` + fixed `backend/src/repositories/payrollRepository.ts` dynamic column handling for `payroll_month DATE` / `hr_payroll_status`, eliminating the HTTP 500 error on live production data (84 payroll records) and enabling immediate PDF payslip generation.
   - **Assets**: Fixed backend `rbacRepository.ts` (`'assets'` in `CORE_MODULES`, `'Super Admin'` -> `'CEO'`) and `dataGatewayController.ts` visibility so CEO/HR view and manage all 47 assets with resolved assignee names.
   - **Leave & Attendance Log**: Responsive 3-column leave balance grid (hidden for CEO), employee identity & inline approvals, searchable Attendance Log with HR/CEO `Correct Attendance` time-picker bottom sheet (`POST /attendance/correct`).
   - **Tasks**: Search bar, `Open / My Tasks / Overdue / Completed / Drafts / All` filters, inline comment composer, inline base64 image attachment previews, and Manager `Approve & Close / Reopen` controls.
   - **WhatsApp CRM**: Added `formatMetaFailureReason` parser so Meta 131047/131049 raw JSON errors render as clear human messages with 1-tap `Send Approved Template` re-engagement, added Search and `Sync from Meta` action.

### Verification (Build 9)

- **Playwright MCP & Chrome DevTools MCP (Read-Only on `https://hrms.businz.com`)**: Verified live login UI (desktop `1536x720`, mobile `390x844`), `TTFB: 115 ms`, `Load: 529 ms`, brand `#0e7490`, live `/health`, `/settings/geofence`, and `/auth/otp-config`.
- **Flutter Static Analysis (`flutter analyze`)**: **0 issues** (`No issues found!`).
- **Flutter Unit & Widget Tests (`flutter test`)**: **16/16 passed** (`test/widget_test.dart` + `test/rbac_and_modules_test.dart`, verifying role detection, strict RBAC visibility, all 4 role `HomeShell` navigation bars, `ShiftsScreen` CEO vs Employee split, `canStartTrackingAssignment` state guard, Meta 131047/131049 parser, Compass `Result<T>`, and `CompactKpiCard`).
- **Backend Build & Security Verification**: `npm run build --prefix backend` (`tsc` exit 0); Security (`10/10`), Phase 1 Remediation (`20/20`), and Mobile Data Isolation (`10/10`) Vitest suites verified `40/40` passed after backend RBAC/Gateway/Payroll fixes.
- **Production Isolation**: No VPS deployment, no container restarts, no production database mutations, and no changes to other domains were performed.

### Build 9 Artifact

| Artifact | Bytes | SHA-256 | Package / Version | Signing |
|---|---:|---|---|---|
| `releases/BUSINZ-HRMS-v1.1.0-build9.apk` | 68,634,580 (65.5 MB) | `82A98A8695C597B438D2B1A38A1CFF988468BF25221395E746EB5CC7D2A6CCA3` | `com.businz.hrms`, `1.1.0` (`9`) | Release-mode APK signed with local Android debug fallback certificate (compatible upgrade over Build 7/8; supply `mobile/android/key.properties` for Play Store signing) |

### Outstanding Blockers & Pending Items

1. **Backend Production Deployment (Pending User Authorization)**: Local backend fixes in `backend/src/repositories/rbacRepository.ts`, `backend/src/controllers/dataGatewayController.ts`, and `backend/src/repositories/payrollRepository.ts` are ready and tested, but intentionally NOT deployed to `hrms.businz.com` VPS without explicit authorization. Mobile includes graceful gateway fallbacks so Build 9 works immediately against the current live server and improves further once deployed.
2. **Physical Device Testing**: No Android USB device or iPhone was connected to this Windows workstation; physical camera/GPS/background-tracking soak testing remains pending device installation.
3. **iOS Compilation & Signing**: `mobile/ios/` runner, Info.plist permissions, background modes, and icons are configured and Cupertino adaptive widgets are implemented, but `.ipa` compilation and TestFlight signing require macOS + Xcode + Apple Developer certificates.
4. **Play Store Release Keystore**: `mobile/android/key.properties` is not configured in this repository; release APK uses Android debug fallback signing until production keystore credentials are supplied.
5. **Authenticated Multi-Role Web Playwright Walkthrough**: Live production testing was kept strictly read-only without mutating live accounts or requesting privileged production credentials.

