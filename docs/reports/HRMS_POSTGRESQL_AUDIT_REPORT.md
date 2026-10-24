# BUSINZ HRMS PostgreSQL Audit Report

Audit date: 21/10/2026  
Repository commit inspected: `749de7a203cf81deeee08a7715e0e3adda54a5b2` (`main`)  
Working tree: dirty before this audit; no branch was created and no existing changes were overwritten.  
Production deployment: not performed.

## Executive Result

The application is **not yet PostgreSQL-only at the application boundary**. The VPS hosts PostgreSQL, but active code still uses Supabase JS as a PostgREST client and the frontend still calls `/rest/v1` directly. Production Nginx currently exposes that route and strips its authorization header. Removing PostgREST now would break active modules, so it was not removed prematurely.

Verified fixes in this audit:

- Added a shared PostgreSQL connection pool with bounded connections, timeouts, transaction support, and parameterized queries.
- Converted expense persistence/read, authentication lookup and updates, password-reset persistence, audit logging, and readiness health checks to direct PostgreSQL code.
- Removed direct browser database login, fabricated offline administrator login, cached-user authentication fallback, and client-side password-reset simulation.
- Removed legacy unsigned browser-session acceptance and hardcoded JWT verification secrets; authenticated requests now re-check the current PostgreSQL account state.
- Fixed password reset records that used non-UUID IDs for a PostgreSQL UUID column and silently fell back to process memory.
- Added a safe tenant-column alignment migration.

Release status: **FAIL** until remaining PostgREST/Supabase-client paths are migrated and staging CRUD/E2E verification passes.

## Page Audit

`Database Verified` means the current direct-PostgreSQL implementation was exercised against an isolated/live database after the change. Direct PostgreSQL access from this workstation timed out, so it is not marked verified where it could not be executed.

| Page | Issue | Root Cause | Files Modified | Fix Applied | Database Verified | Test Status |
|---|---|---|---|---|---|---|
| Dashboard | Reads mixed context state populated by direct REST and settings JSON | Frontend master sync has multiple sources of truth | None in this audit | Inventory completed; requires backend bootstrap API | No | BLOCKED |
| Employee Management | Direct REST remains active for sync and some mutations | Backend API and `supabaseDirectService` coexist | Auth paths only | Browser authentication fallback removed; CRUD migration remains | No | FAIL |
| Employee Profile | Profile refresh can depend on direct REST/settings overlays | Mixed API, REST and local state | None in this audit | Inspected; no unverified rewrite applied | No | NOT TESTED |
| Department Management | Direct `/rest/v1/departments` CRUD | No dedicated backend department API | None in this audit | Replacement required before PostgREST removal | No | FAIL |
| Designation Management | Direct `/rest/v1/designations` CRUD | No dedicated backend designation API | None in this audit | Replacement required | No | FAIL |
| Live Face Attendance | Database repository still uses Supabase/PostgREST client | Repository not converted to shared pool | None in this audit | Existing rule tests retained | No | BLOCKED |
| Attendance Management | Table/settings fallback can reintroduce stale records | Dual source of truth | None in this audit | Existing attendance fixes retained; migration pending | No | FAIL |
| Manual Attendance | Frontend performs direct insert/update | Missing authenticated backend mutation endpoints | None in this audit | Replacement required | No | FAIL |
| Shift Management | Deployed DB lacks queried `shifts.company_id` | Migration drift; migration 013 not applied to accessed DB | Existing migration 013 | Migration identified; no production apply | No | FAIL |
| Shift Requests | Settings JSON plus assignment tables coexist | Legacy persistence path | Existing shift files/migration 013 | Current-assignment rules retained | No | BLOCKED |
| Leave Management | API repository still reads/writes settings JSON and table | Legacy fallback architecture | Existing leave validation files | Validation tests pass; persistence migration remains | No | BLOCKED |
| Leave Policies | Stored in `company_settings` through direct REST/context | No typed backend policy API | None in this audit | Replacement required | No | NOT TESTED |
| Late Attendance Policies | Stored in settings JSON | No typed backend API | None in this audit | Replacement required | No | NOT TESTED |
| Holiday Management | Stored in settings JSON | Direct settings persistence | None in this audit | Replacement required | No | NOT TESTED |
| Task Management | Direct `enterprise_tasks` REST plus context cache | Backend task CRUD API missing | None in this audit | Replacement required | No | FAIL |
| Field Duty / Tracking | Backend repository still uses Supabase client | Repository not converted; tests rely on fixtures | None in this audit | Inventory completed | No | FAIL |
| Expense and Claims | Past dates blocked and optimistic save previously hid failures; repository used PostgREST | UI validation plus direct database client | Expense component/context/service/controller/repository/routes | Backend-confirmed save, authenticated identity, direct parameterized PostgreSQL repository | No after pool conversion | BLOCKED |
| Salary Advance | Primarily context/settings persistence | No dedicated durable API identified | Existing date presentation changes only | Persistence replacement required | No | NOT TESTED |
| Payroll | Repository uses PostgREST and in-memory run records | Dual persistent/in-memory implementation | None in this audit | Inventory completed | No | FAIL |
| Employee Documents | Schema stores URL metadata; storage replacement not implemented | Supabase-style storage schema remains; file backend unclear | None in this audit | Requires storage decision on VPS filesystem/object storage | No | NOT TESTED |
| Notifications | Mostly context/settings persistence | Browser/local state mixed with settings JSON | None in this audit | Replacement required | No | NOT TESTED |
| Reports | Derived from mixed context data | Source modules can be stale | Existing date/export fixes only | Date/export unit tests pass | No | BLOCKED |
| Roles and Permissions | Backend repository still uses Supabase client; frontend caches RBAC | API cache and PostgREST repository coexist | None in this audit | Replacement required | No | BLOCKED |
| User Management / Login | Browser could authenticate directly and fabricate sessions; backend used Supabase client | Unsafe fallback paths and static database access | `authService.ts`, `authRepository.ts`, `database.ts` | Backend-only JWT authentication and direct parameterized PostgreSQL lookup/update | No | BLOCKED |
| Company Settings | Repository still uses PostgREST and memory cache | No direct PostgreSQL conversion yet | Health service only | Replacement required | No | BLOCKED |
| Visiting Card Scanner | OCR external test timed out; customer repository still uses Supabase client | External model timeout and legacy repository | Existing customer validation changes retained | No OCR engine/storage changes made | No | FAIL |
| WhatsApp Settings | Backend service still imports Supabase client | Configuration/message persistence not migrated | None in this audit | Replacement required | No | BLOCKED |
| Gmail/SMTP Configuration | Settings repository still uses PostgREST | SMTP config persistence not migrated | None in this audit | Existing SMTP tests executed | No | BLOCKED |
| AI Chatbot Configuration | Configuration uses browser storage/settings and external Gemini | Mixed persistence; client fallback remains | Existing chatbot fixes retained | Deterministic chatbot tests pass; config migration remains | No | BLOCKED |
| Assets | Direct frontend REST CRUD | Dedicated backend API missing | None in this audit | Replacement required | No | FAIL |
| Recruitment / Referral | Direct job/candidate REST CRUD | Dedicated backend API missing | None in this audit | Replacement required | No | FAIL |
| Performance | Primarily context/settings JSON | No normalized backend persistence API | None in this audit | Replacement required | No | NOT TESTED |
| Organization | Departments/branches/designations use mixed context/direct REST | Missing consolidated API | None in this audit | Replacement required | No | FAIL |
| GPS Geofence | Settings repository/PostgREST | Repository not converted | Health service only | Replacement required | No | BLOCKED |

## Database Audit

### Connectivity

- Configured direct PostgreSQL target: Hostinger VPS PostgreSQL through `DATABASE_URL`.
- Read-only direct connection attempt result: `ETIMEDOUT 187.126.116.199:5432`.
- The timeout indicates the database port is not reachable from this workstation. This is compatible with a private/container-only database, but it blocks direct live schema and CRUD verification here.
- The deployment backend container has an internal PostgreSQL URL and should be able to connect over the Docker network; this must be verified in staging after deployment.
- No production records were created, edited, deleted, truncated, or reset during this audit.

### Architecture

- Frontend: React 19, TypeScript, Vite.
- Backend: Express 4, TypeScript, Zod validation.
- Database: PostgreSQL 16 in VPS Docker Compose.
- Current data adapter: mixed `pg`, Supabase JS, and self-hosted PostgREST.
- State management: large React context (`HRMSContext`) with backend API, direct REST, settings JSON, memory and browser-storage fallbacks.
- Migration system: ordered SQL files, but no migration history table or automatic production migration runner was found.
- Deployment: Docker Compose with PostgreSQL, PostgREST, REST Nginx proxy, backend, and frontend Nginx.

### Schema Mismatches

1. The accessed deployed schema reported no `employees.company_id`, while current schema and tenant-aware queries expect it.
2. Test/runtime output reported no `shifts.company_id`, while shift queries require it.
3. Password reset code generated `rst-*` text IDs although `password_resets.id` is UUID. Insert failures were swallowed and data survived only in memory.
4. Several modules persist normalized table records and duplicate JSON copies in `company_settings`, allowing stale records to return.
5. Expense employee/department embeddings were ambiguous because multiple foreign keys exist; direct SQL joins now specify relationships explicitly.

### Migrations

- Existing pending migration `013_shift_assignment_integrity.sql` adds employee, shift and assignment tenant columns and indexes.
- New migration `014_employee_tenant_alignment.sql` safely adds/indexes `employees.company_id` for installations where migration 013 was partially applied.
- Migrations are additive and do not delete or rewrite historical business records.

### Database Errors Fixed

- Password-reset UUID mismatch and silent memory fallback.
- Audit-log memory-first persistence.
- Expense PostgREST dependency and ambiguous relationship embedding.
- Health readiness incorrectly required both PostgreSQL and the legacy REST layer.
- Authentication database lookup/update through Supabase JS.
- Silent browser authentication/password-reset success while backend persistence was unavailable.

## Supabase Removal Audit

- Supabase-named source/deployment files found: **21**.
- Backend files with active Supabase client imports: **11** remain.
- Frontend direct-service consumer files: **2** (`HRMSContext` and employee creation UI).
- Direct frontend `/rest/v1` calls: **70** remain in `supabaseDirectService.ts`.
- Backend API endpoint definitions inspected: **104**.
- Top-level application pages discovered: **21**.
- Frontend component files inventoried: **138**.

### Replaced

- Authentication lookup and account updates.
- Password-reset create/read/update operations.
- Authentication audit logs.
- Expense create/list operations.
- PostgreSQL readiness check.
- Browser direct-database authentication and local password reset.

### Remaining Active Dependencies

- Backend: attendance, employee CRUD/salary structures, leave, shift, overtime, payroll, tracking, customer/WhatsApp, settings, and RBAC-related paths still use the Supabase JS query client.
- Frontend: master synchronization and several create/update/delete actions still use direct PostgREST.
- Deployment: `postgrest`, `rest-proxy`, frontend `/rest/v1` Nginx route, compatibility schemas/roles, and REST keys remain required by those active paths.

These dependencies were not deleted because their replacements have not yet passed CRUD and browser-refresh tests. Removing them now would violate the no-regression requirement.

## Application Audit

- Total top-level pages discovered: **21**.
- Total component files inspected by automated inventory: **138**.
- Total backend endpoint definitions inspected: **104**.
- Full backend suite: **210 passed, 29 failed, 11 skipped** across 21 test files.
- Focused expense validation: **3 passed**.
- Frontend production build: **PASS**.
- Backend TypeScript production build: **PASS**.
- Direct PostgreSQL live verification after conversion: **BLOCKED** by port timeout.
- Browser Playwright CRUD against an isolated database: **NOT TESTED** because no isolated reachable PostgreSQL database was available.

### Test Failures

- Authentication/integration tests cannot reach direct PostgreSQL and now correctly fail instead of using mock/browser fallback.
- Shift tests expose missing deployed `company_id` migration.
- Several integration tests depend on hard-coded fixture employees such as `EMP-006` and fail when those records are absent.
- Security tests expect older error-code/status conventions and need fixture/API expectation alignment.
- Visiting-card external Gemini OCR test timed out after 45 seconds; local OCR validation tests passed.
- `rule_validation.test.mjs` prints 26 successful checks but is not registered as a Vitest suite, so Vitest marks the file failed.

## Code Changes

### Added

- `backend/src/config/database.ts` — shared PostgreSQL pool, transaction helper and schema-column detection.
- `backend/migrations/014_employee_tenant_alignment.sql` — additive tenant-column/index alignment.
- Existing expense backend files added earlier in the working tree remain part of the persistence correction.

### Updated

- `backend/src/repositories/authRepository.ts`
- `backend/src/repositories/passwordResetRepository.ts`
- `backend/src/repositories/auditRepository.ts`
- `backend/src/repositories/expenseRepository.ts`
- `backend/src/services/databaseHealthService.ts`
- `backend/src/routes/healthRoutes.ts`
- `backend/src/middleware/authMiddleware.ts`
- `frontend/src/services/authService.ts`

### Important Details

- SQL values are parameterized.
- Expense creation uses a transaction and returns success only after `INSERT ... RETURNING`.
- Password attempt increments are atomic.
- Password reset IDs are generated by PostgreSQL UUID defaults.
- Browser sessions are accepted only after backend authentication.
- JWTs are verified with the configured secret only, and deactivated accounts are rejected on subsequent authenticated requests.
- Cached profile data is no longer treated as proof of an authenticated session.
- No UI navigation or layout was redesigned.

## Deployment Readiness

### Status

**Not ready for production deployment.** Builds pass, but the direct PostgreSQL conversion is incomplete and live direct connectivity could not be verified from this environment.

### Remaining Risks

1. Removing PostgREST before replacing all 70 frontend calls will break multiple pages.
2. Applying application code before migrations 013/014 can break tenant-aware employee and shift queries.
3. Current public `/rest/v1` proxy is a security risk because authorization is stripped and a static key is shipped to the browser.
4. Normalized tables and `company_settings` JSON can disagree.
5. Existing integration suites use non-isolated fixtures and are not currently reliable release gates.

### Required Backup

Before any deployment:

```bash
pg_dump --format=custom --no-owner --file=businz_hrms_pre_pg_migration.dump "$DATABASE_URL"
```

Verify the dump with `pg_restore --list` and retain the previous backend/frontend container images.

### Safe Deployment Sequence

1. Provision a staging PostgreSQL clone from a recent sanitized backup.
2. Verify `DATABASE_URL` from inside the backend container with `SELECT 1`.
3. Apply migrations 011 through 014 in order and record each applied migration.
4. Deploy the backend build while retaining PostgREST temporarily for unconverted modules.
5. Run authenticated CRUD/refresh tests for authentication, expenses, employees, attendance, leave, shifts, tracking, payroll and settings.
6. Convert and test the remaining backend repositories and frontend direct REST consumers.
7. Only after reference count reaches zero, remove the frontend `/rest/v1` route, PostgREST, REST proxy, REST keys, Supabase JS package and compatibility-only deployment objects.
8. Re-run backend tests and Playwright against staging.
9. Deploy to production only after all critical modules are PASS.

### Rollback

1. Restore the previous backend and frontend container images.
2. Keep additive columns/indexes from migrations 013/014; they are backward compatible and do not need destructive rollback.
3. If data restoration is required, stop writes and restore the verified pre-deployment dump to a separate database first.
4. Point containers back to the restored database only after integrity checks.
5. Do not drop new columns or truncate tables as part of routine rollback.

## Final Classification

- PostgreSQL-only objective: **FAIL — active migration work remains**.
- Safe partial fixes implemented: **PASS**.
- Production database verification: **BLOCKED — direct connection timeout**.
- Production deployment: **NOT TESTED / NOT PERFORMED**.
