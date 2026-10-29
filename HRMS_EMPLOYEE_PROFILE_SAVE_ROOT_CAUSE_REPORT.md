# BUSINZ HRMS – Employee Profile Save & Optimistic Concurrency Fix Report

## 1. Executive Summary

- **Affected Endpoint**: `PUT /api/v1/employees/:id/profile-sync`
- **Affected Records (Examples)**: `VRM-042` (`Dhanasekar J`), `VRM-044` (`Shinodh G kurup`), and all employee profiles edited after a prior transaction rollback.
- **Observed Error**:
  > `"Failed to update profile in database: This employee profile was changed by another user. Reload and apply your changes again."` (`HTTP 409 STALE_EMPLOYEE_VERSION`)

---

## 2. Confirmed Root Causes (Phase 1 Trace)

### Root Cause 1 (Primary): Transactional DDL Rollback Poisoned `schemaEnsured = true`, Leaving `row_version` Undefined (`NaN !== 1`)
- In [`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts), `ensureProfileSyncSchema(client)` was executed **inside** `withTransaction(async client => { ... })` and immediately set the module-level flag `schemaEnsured = true` before the PostgreSQL transaction committed.
- When the initial transaction rolled back due to a downstream SQL error (detailed in Root Causes 2–4 below), PostgreSQL rolled back the transactional DDL (`ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS row_version INTEGER DEFAULT 1`, `profile_data JSONB`, `payroll_eligible BOOLEAN`), **while `schemaEnsured` remained `true` in Node.js memory**.
- On every subsequent save attempt (`VRM-042`, `VRM-044`, etc.):
  1. `ensureProfileSyncSchema(client)` returned early because `schemaEnsured === true`.
  2. `resolveEmployee(client, ...)` selected the employee row from `public.employees`, where `row_version` did not exist (`oldEmployee.row_version === undefined`).
  3. The concurrency check evaluated:
     ```ts
     Number(oldEmployee.row_version) !== Number(options.expectedVersion)
     // Number(undefined) !== 1  =>  NaN !== 1  =>  true
     ```
  4. This threw `409 STALE_EMPLOYEE_VERSION` (`"This employee profile was changed by another user. Reload and apply your changes again."`) with `currentVersion: NaN` (serialized as `null` in JSON) on **every** ordinary profile save.

### Root Cause 2: Unprotected Query Against Nonexistent `public.payroll_settings` / `public.payroll_runs` Aborted the Transaction
- When an employee profile save included salary details (`coreGross > 0`), `recalculateDraftPayroll` executed `SELECT * FROM public.payroll_settings` and joined `public.payroll_runs` inside the same PostgreSQL transaction without a `SAVEPOINT`.
- In the database schema where `public.payroll_records` is a standalone table (without `public.payroll_settings` or `public.payroll_runs`), PostgreSQL threw `42P01: relation "public.payroll_settings" does not exist`, aborting and rolling back the entire transaction (including the `ensureProfileSyncSchema` DDL).

### Root Cause 3: Polymorphic Parameter Type Error (`42P18`) on Shift Attendance Update & Date Cast Error (`42804`) on Documents
- In Step 5 (`UPDATE public.attendance_records`), parameter `$3` (`shiftRow.shift_name`) was referenced only inside `jsonb_build_object('shiftId', $2, 'shiftName', $3, ...)` without an explicit type cast (`$3::text`), causing PostgreSQL to throw `42P18: could not determine polymorphic type because input has type unknown`.
- In Step 8 (`INSERT INTO public.employee_documents ... SELECT $1, $2, $3, $4, $5`), parameter `$5` (`upload_date`) was selected without `$5::date`, causing PostgreSQL to throw `42804: column "upload_date" is of type date but expression is of type text`.

### Root Cause 4: Whole-Row Version Comparison Without Field-Level Merge & Stale Prop Version in Frontend
- In [`EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx), `handleSaveChanges` passed `expectedVersion: employee.rowVersion ?? currentEmp.rowVersion` (preferring the initial `employee` prop over the updated `currentEmp` state) and formatted empty address fields as `", ,  - "`.
- In [`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts), whole-row version comparison rejected non-overlapping concurrent edits by two administrators editing different fields and lacked field-level conflict reporting (`conflictingFields`, `latestEmployee`).

---

## 3. Permanent Fixes Implemented (Phases 2 – 7)

1. **Rollback-Safe Schema Initialization & Self-Healing (`employeeProfileSyncService.ts`)**:
   - `schemaEnsured = true` is now set **only after** `withTransaction` commits, and is explicitly reset to `false` in `catch` if any transaction rolls back.
   - Added runtime self-healing: if `oldEmployee` ever lacks `'row_version'` or `'profile_data'`, `ensureProfileSyncSchema(client, true)` is re-executed and `oldEmployee` is re-read within the transaction.
   - Added `NOTIFY pgrst, 'reload schema'` and `CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_assignment_employee_effective ON public.shift_assignments (employee_id, effective_from)`.

2. **Field-Level Optimistic Concurrency Control & Atomic Conditional Updates (Phase 2)**:
   - Normalized `currentDbVersion` so `undefined`/`null` defaults to `1` and never evaluates to `NaN`.
   - Enforced atomic conditional SQL update: `WHERE id = $1 AND COALESCE(row_version, 1) = $55 RETURNING *`.
   - Added field-level diff & version history (`_versionHistory` and `baseValues` / `changedFields`):
     - **Non-conflicting concurrent edits (Scenario 7) & false concurrency drift (Scenario 9)**: When two administrators edit *different* fields or when `row_version` drifted without changing the user's edited fields, only the user's modified fields are merged onto the latest record and `row_version` increments cleanly.
     - **Genuine concurrent conflicts on the same field (Scenarios 8 & 10)**: Returns `HTTP 409 STALE_EMPLOYEE_VERSION` with `currentVersion`, `conflictingFields`, and `latestEmployee`.
     - **Reviewed Reapplication (`forceReapplyVersion`)**: [`HRMSContext.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/context/HRMSContext.tsx) and [`EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx) preserve unsaved form edits, display the conflicting field values (`Server` vs `Your edit`), and allow safe reapplication via **Review & Apply My Changes**.

3. **Savepoint-Protected Draft Payroll Recalculation & Explicit SQL Parameter Casts (Phases 3, 4, 5)**:
   - Wrapped `recalculateDraftPayroll` in `SAVEPOINT sp_draft_payroll` with a fallback `SAVEPOINT sp_direct_payroll` for standard `public.payroll_records` tables so draft payroll recalculation never aborts the outer profile transaction.
   - Cast all polymorphic and `SELECT` parameters explicitly (`$2::text`, `$3::text`, `$4::text`, `$5::text`, `$6::int`, `$7::date` in `attendance_records`; `$1::uuid`, `$2::text`, `$3::text`, `$4::text`, `$5::date` in `employee_documents`).
   - Prevented blank address templates (`", ,  - "`) from overwriting existing employee addresses.

4. **Top & Bottom Save Button Deduplication & Strict Password Isolation (Phases 6 & 7)**:
   - Added synchronous `savingRef` lock in [`EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx) so simultaneous clicks on the top and bottom **Save Changes** buttons never dispatch duplicate requests.
   - Strictly stripped `password`, `passwordHash`, `plainPassword`, and `mustChangePassword` across frontend payloads, controller validation, `profile_data`, and `company_settings.employee_profiles_data`.

---

## 4. Automated Verification Results (Phase 8 – All 15 Scenarios)

Executed via Vitest (`npx --prefix backend vitest run tests/employeeProfileSavePersistence.test.ts`):

| Scenario | Description | Result |
| :--- | :--- | :--- |
| **1–2** | Single-field & multi-field profile edits persisted to PostgreSQL without clobbering unrelated columns | **PASS** |
| **3** | Shift change (`Morning 2` → `NORMAL SHIFT`) with current & future effective dates, preserving finalized attendance | **PASS** |
| **4** | Salary revision persistence in `salary_structures`, recalculating draft payroll & preserving paid payroll | **PASS** |
| **5–6** | Profile refresh (`GET /api/v1/employees/:id`) and cross-session persistence with incremented `rowVersion` | **PASS** |
| **7** | Two administrators editing **different** fields concurrently both succeed and merge cleanly | **PASS** |
| **8 & 10** | Two administrators editing the **same** field concurrently returns `409 STALE_EMPLOYEE_VERSION` with `conflictingFields`, followed by safe reviewed reapplication | **PASS** |
| **9 & 12** | False-concurrency prevention when `row_version` is `undefined`/`null` after rollback + full transaction rollback integrity | **PASS** |
| **11** | Simultaneous Save button clicks deduplicated via `savingRef` | **PASS** |
| **13–14** | Immediate `memoryCache` invalidation + mobile/desktop DD/MM/YYYY and custom `FULL TIME` normalization | **PASS** |
| **15** | Employee password hash & `must_change_password` strictly preserved | **PASS** |

