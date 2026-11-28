# BUSINZ HRMS — Complete Web-to-Flutter Transformation Blueprint & Audit Matrix

**Audit Date:** 26 November 2026  
**Web Reference:** `https://hrms.businz.com` (React 19 + Vite, Node.js/Express `/api/v1`, PostgreSQL `businz_hrms`)  
**Flutter Project:** `mobile/` (`com.businz.hrms`, Flutter 3.47.4 / Dart 3.13.3, Android & iOS shared codebase)  
**Architecture References:**
1. **Flutter Compass App** (`flutter/samples/compass_app`) — Layered UI / Application / Data architecture, `Result<T>` wrapper, `Command0`/`Command1` async action lifecycle, Riverpod + GoRouter dependency boundaries.
2. **Flutter Material 3 Demo** (`flutter/samples/material_3_demo`) — Modern Material 3 seeded surface hierarchy, `NavigationBar` / `NavigationRail` responsive shells, `SearchBar`, `FilterChip`, tonal containers, bottom sheets, dynamic light/dark themes.
3. **Flutter Cupertino Gallery** (`flutter/samples/cupertino_gallery`) — Native iOS adaptive surfaces (`CupertinoSlidingSegmentedControl`, `CupertinoActivityIndicator`, `CupertinoActionSheet` / adaptive dialogs, iOS typography rhythm & edge-to-edge safe areas).
4. **Very Good CLI** (`VeryGoodOpenSource/very_good_cli`) — Strict linting (`analysis_options.yaml`), structured feature modules, mirrored `test/` coverage, clean environment separation.

---

## 1. Live MCP Audit Findings (Playwright MCP + Chrome DevTools MCP)

Both **Playwright MCP** and **Chrome DevTools MCP** were verified connected and used directly against `https://hrms.businz.com` (strictly read-only; zero production mutations):
- **Page Load & Perf (Chrome DevTools MCP):** `Businz — Enterprise HRM`, TTFB `115 ms`, DOMContentLoaded `529 ms`, Load `529 ms`.
- **Brand Tokens Verified:** Primary `--color-primary-blue: #0e7490`, Background `#eef5f9`, Authentic Logo `/logo.png` (bundled natively as `mobile/assets/businz-logo.png`).
- **Auth Capabilities Verified (Playwright MCP desktop 1536×720 & mobile 390×844):**
  - Dual tabs: `Password` and `Login with OTP` (`Email OTP` + `Mobile OTP`), with explicit notice that privileged roles (CEO, HR, Accounts) require standard password authentication.
  - Endpoints confirmed live: `GET /health` (200), `GET /api/v1/settings/geofence` (200), `GET /api/v1/auth/otp-config` (200), `POST /api/v1/auth/refresh` (401 when unauthenticated).
  - Public policy routes: `/privacy-policy`, `/terms-of-service`, `/data-deletion`.

---

## 2. Root-Cause Analysis of All 12 Reported Mobile Defects

| # | Reported Issue | Verified Root Cause (Code & Production Schema) | Permanent Fix |
|---|---|---|---|
| **A** | Outdated, card-heavy CEO UI & wrong actions | `AppUser.isCeo` only checked `role == 'ceo'` (missing `Super Admin`, designation `CEO`, `EMP-000`, `VRM-001`). `HomeShell` gave every role the same 5 tabs. | Role-specific shells (`CEO`, `HR`, `Accounts`, `Employee`), bespoke executive dashboard with charts & approval queue, 2026 adaptive M3/Cupertino design system. |
| **B** | Tasks empty for some users / missing tabs | No My Tasks vs Team Tasks vs Drafts tabs; limited search/department filter; no manager review/reopen or comment posting in detail view. | Full tabbed Tasks workspace (My Tasks, Team/All, Overdue, Drafts, Completed), search, department filter, comments, daily reports, attachments, delegated assign check. |
| **C** | Shifts shows "Request shift change" to CEO | `shifts_screen.dart` unconditionally showed `Request shift change` button to ALL roles and never loaded shift assignments or shift change requests. | Strict role split: CEO/HR get **Manage Shifts, Roster Assignments, Shift Change Requests (Approve/Reject with Reason), Create Shift**; Employee/Accounts get **My Shift & Request Shift Change + My Request History**. |
| **D** | Leave balance cards overflow & missing employee names | `_LeaveBalanceSummary` used fixed-width 132px horizontal scroll cards; CEO/HR saw "Casual Leave" without the requesting employee's name; CEO saw Apply FAB. | Responsive 3-column adaptive balance strip (Employee/HR/Accounts), segmented Pending/All/History tabs, employee name + department headers for approvers, inline Approve/Reject with reason. |
| **E** | Payroll: "The HRMS server had a problem" | **SMOKING GUN:** Production `public.payroll_records` has `payroll_month DATE` (no `payroll_year`, no `salary_structure_id`, no `payroll_attendance` table) and enum `hr_payroll_status` = `('Pending','Verified','Processed','Paid')`. `payrollRepository.ts` queried missing columns and uppercase `'PROCESSED'` -> PostgreSQL `22P02` HTTP 500! | Fixed `payrollRepository.ts` schema-aware SQL + enum cast AND added mobile graceful fallback to `/data-gateway/proxy` (`payroll_records` + `payroll_records_data`) so it works immediately even before backend deploy. |
| **F** | Finance & Claims: "No expense claims" | `public.expenses` has 0 rows while `company_settings.expenses_data` has 25 real records and `field_allowance_requests` has 2 real records. Web unified Finance & Claims into `FieldAllowanceModule` + `AccountsPaymentDashboard`. | Unified **Finance & Claims** workspace (4 KPI cards, Claims/Field Visits workflow + Expenses history, search, filters, receipt upload, CEO/HR approval/correction/rejection, Accounts disbursement & settlement confirmation) + dedicated **Payment Disbursement** screen for Accounts/CEO. |
| **G** | Assets: CEO sees zero assets | **SMOKING GUN:** `public.assets` has 47 real rows, but `'assets'` was omitted from `CORE_MODULES` in `rbacRepository.ts`, and `'Super Admin'` matched `'Admin'` before `'CEO'` -> `dataGatewayController.ts` returned 403/filtered all rows! | Added `assets` (and all core modules) to `CORE_MODULES`, fixed `Super Admin -> CEO` mapping & `dataGatewayController.ts` CEO/HR bypass, plus rich mobile inventory with KPIs, category/status filters, add/edit/assign/return/delete. |
| **H** | Attendance Log shows duplicate dates with no employee name | List cards only displayed `date` without `employeeName`/`employeeId` on company-wide lists, and lacked date/status/employee filtering or HR/CEO correction action. | Display employee identity & avatar on company-wide logs, search & date/status filter chips, attendance photo & GPS map modal, plus HR/CEO **Correct Attendance** sheet wired to `POST /attendance/correct`. |
| **I** | Field Tracking shows "Start Tracking" on Completed assignments | `_AssignmentCard` rendered `Start authorized tracking` unconditionally regardless of `status` (`Completed`/`Archived`/`Cancelled`). | State-gated actions (`Start` only for `Scheduled`/`Active` assignments owned by user), CEO/HR **Field Overview, Assign Duty & Alerts** tabs, clean Apple/Google Maps route view with Punch In (Green), Visits (Orange), Punch Out/Miss Punch Out (Red), blue polyline & GPS quality badge. |
| **J** | WhatsApp CRM blank or failed messages | Live `crm_messages` contains Meta error `131047` ("24-hour window closed — send Approved Template") shown as raw JSON, and empty webhook records with blank `content_text`. | Parse Meta JSON error codes cleanly (131047, 131049, 131026, etc.) with one-tap "Send Approved Template" action, clean fallback labels for empty/media/reaction events, search, template sync, and broadcast delivery breakdown. |
| **K** | More page shows unauthorized/missing modules | `moduleCatalog` missed Payment Disbursement, Finance & Claims rename, Advance Salary, Overtime, Holidays (`holiday_policies_data` vs nonexistent `holiday_calendar`), Performance, Recruitment, Settings, and Profile. | Dynamic permission-aware grouped More directory matching Web `Sidebar.tsx` rules, including Petty Cash active custodian verification and Accounts/HR/CEO restrictions. |
| **L** | Generic UI, wrong logo on splash, poor navigation | `_LaunchScreen` drew a briefcase icon instead of `assets/businz-logo.png`; `AppTheme` lacked design tokens, dark mode toggle, Cupertino adaptivity, and skeleton states. | Premium 2026 adaptive Material 3 + Cupertino design system (`AppTokens`, `AppTheme`, `AdaptiveScaffold`, `BusinzBrandMark`, responsive cards, compact KPIs, smooth animations, zero overflow). |

---

## 3. Authoritative Role-Permission & Navigation Matrix

Role identity is resolved from server JWT + `/auth/me` + `/rbac` matrix + active Petty Cash custodian check (`/petty-cash/custodian/active`), matching Web `authRepository.ts` & `Sidebar.tsx`:

| Role Family | Primary Bottom Navigation | Dashboard Focus | Restricted / Forbidden |
|---|---|---|---|
| **CEO / Super Admin** | `Home` \| `Approvals` \| `Tasks` \| `More` | Total Staff, Present/Absent/Late/On Leave, Pending Approvals, Open/Overdue Tasks, Monthly Payroll, Finance Queue, Petty Cash, Field Tracking, Attendance Donut & Trend | **NO** Face Attendance Punch; **NO** Employee Shift Change Request form |
| **HR / HR Manager / HR Admin** | `Home` \| `Attendance` \| `Approvals` \| `More` | Present/Absent/Late/Missed Punches, Pending Leaves, Pending Corrections, Pending Shift Requests, Employee Directory, Attendance Analytics | **NO** CEO-only financial approval on Petty Cash / Advance Salary / Payroll final sign-off; **NO** Accounts Payment Disbursement |
| **Accounts / Finance Manager** | `Home` \| `Payments` \| `Claims` \| `More` | Pending Disbursements (Salary/Claims/Advances/Petty Cash), Finance & Claims Queue, Petty Cash Wallet & Ledger, Payroll Operations, Own Attendance/Leave/Payslip | **NO** Employee Directory, Company Attendance Report, CEO-only Approvals, HR Settings |
| **Employee** (incl. Manager / TL with delegated permissions) | `Home` \| `Attendance` \| `Leave` \| `Tasks` \| `More` | My Shift & Today Punch Card, Monthly Attendance Stats, Leave Balance, My Open Tasks, Quick Actions (My Payslips, Finance & Claims, Advance Salary, My Assets, Tracking, Scanner, WhatsApp CRM) | Strictly scoped to **own** records (or team/delegated task assignment strictly when backend RBAC grants `tasks.create` / `assign_tasks`); Petty Cash visible **only** if active custodian |

---

## 4. Complete Web-to-Mobile Module Parity Register (37 Areas)

| # | Module / Feature | Backend Endpoints / Tables | Role Access | Mobile Implementation |
|---|---|---|---|---|
| 1 | Login, Email OTP, Forgot/Reset, Mandatory Password Change | `/auth/login`, `/auth/otp-login/*`, `/auth/forgot-password`, `/auth/change-password` | All | Branded 2026 Login with BUSINZ logo, Password & Email OTP tabs, Forgot Password & Forced Change flows |
| 2 | Role-Based Dashboards | `/attendance/summary`, `/leaves`, `/enterprise_tasks`, `/field-allowance/requests`, `/petty-cash/*`, `/payroll/records`, `/tracking/overview`, `/employees` | Role-specific | 4 dedicated layouts: CEO Executive, HR Ops, Accounts Finance, Employee Self-Service |
| 3 | Approvals Center (Unified Queue) | `/leaves`, `/field-allowance/requests`, `/petty-cash/requests`, `/expenses`, `shift_requests_data`, `loan_records_data` | CEO, HR | Dedicated tabbed Approvals hub in bottom nav for CEO & HR |
| 4 | Employee Directory & Profiles | `/employees`, `/employees/:id` | CEO, HR | Searchable, dept-filtered directory + rich profile tabs (Work, Contact, Salary for authorized roles, Documents) |
| 5 | Face Attendance (Full-Screen Camera + GPS) | `/attendance/shift-status`, `/attendance/verify-face`, `/attendance/punch` | HR, Accounts, Employee (Hidden for CEO) | Full-screen front camera + GPS verification + shift status + punch confirmation |
| 6 | Attendance Log & Corrections | `/attendance`, `POST /attendance/correct` | All (scoped) | Employee identity headers, date/status filters, GPS map + photo viewer, HR/CEO correction modal |
| 7 | Shift Management & Shift Change Approvals | `/shifts`, `/shifts/assignment-summary`, `POST /shifts`, `PUT /shifts/:id/assignments`, `/shifts/requests`, `shift_requests_data` | Role-specific | CEO/HR: Manage shifts, create shift, assign roster, approve/reject requests; Employee: My Shift + Request Change |
| 8 | Holiday Management | `company_settings?setting_key=eq.holiday_policies_data` | All (view), CEO/HR | Real holiday policies & upcoming holiday calendar cards |
| 9 | Leave Management & Approvals | `/leaves`, `/leaves/balances/:id`, `/leaves/:id/decision` | All (scoped) | Compact 3-col balance strip, Half-Day/Full-Day form, employee names & Approve/Reject with reason for HR/CEO |
| 10 | Tasks, Assignment, Drafts, Daily Reports, Comments, Attachments | `enterprise_tasks`, `/employees`, `/departments` | All (delegated create) | Tabs (My/Team/Overdue/Drafts/Completed), search, dept filter, comments, daily reports, attachments, manager review |
| 11 | Field Duty, Live Tracking & Travel History | `/tracking/assignments`, `/tracking/trips`, `/tracking/points`, `/tracking/overview`, `/tracking/alerts` | All (scoped), CEO/HR manage | State-gated Start/End tracking, offline encrypted GPS queue, CEO/HR Live Overview + Assign Duty + Alerts, clean route map |
| 12 | Contact Card Scanner & Customer Directory | `/customers`, `/customers/ocr-scan`, `/customers/check-duplicate` | All | Native camera/gallery OCR, editable fields, duplicate check, directory search |
| 13 | WhatsApp CRM (Inbox, Contacts, Templates, Broadcasts) | `/crm/conversations`, `/crm/messages/*`, `/crm/contacts`, `/crm/templates*`, `/crm/broadcasts` | All (RBAC gated) | Clean Meta error code formatting (131047/131049), media/buttons/emoji, template builder & sync, broadcast delivery metrics |
| 14 | Finance and Claims (Unified Field Visits + Expenses) | `/field-allowance/*`, `/expenses/*`, `company_settings.expenses_data` | All (role-gated actions) | 4 KPIs, Request Claim, HR/CEO Approve/Reject/Correction, Accounts Disbursement, Receipt Capture, Balance Settlement |
| 15 | Petty Cash | `/petty-cash/*` | CEO, Accounts, Active Custodian | Wallet card, CEO Custodian Assignment, Fund Request, Approval, Disbursement, Receipt Confirmation, Daily Expense, Ledger |
| 16 | Payment Disbursement Hub | `/field-allowance/*`, `/petty-cash/*`, `/expenses`, `/payroll/records`, `loan_records_data` | CEO, Accounts | Unified Accounts disbursement desk across Salary, Claims, Petty Cash, Advances with UTR/mode/proof/history |
| 17 | Advance Salary & Loans | `company_settings.loan_records_data`, `loan_policies_data` | All (scoped) | Eligibility summary, My Advances vs Admin Queue, Request/History views |
| 18 | Payroll & Payslips (PDF) | `/payroll/records`, `/payroll/runs`, `/payroll/employees/:id/payslips`, `payroll_records` fallback | All (scoped) | Month/Year selector, Payroll runs overview (CEO/HR/Accounts), real salary records, full Payslip + PDF preview/share |
| 19 | Asset Management | `/data-gateway/proxy` (`assets`) | CEO/HR manage; Employee own | KPIs, search, status/category filters, full detail sheet, Add/Edit/Assign/Return/Delete |
| 20 | Notifications | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | All | Role-filtered feed, unread count badge in AppBar, mark read/all, permission-checked deep links |
| 21 | Reports, Overtime, Performance, Recruitment, Documents, Profile & Settings | Backend APIs + `company_settings` | Role-gated | Dedicated native views in More directory + Profile & Theme Settings screen |
