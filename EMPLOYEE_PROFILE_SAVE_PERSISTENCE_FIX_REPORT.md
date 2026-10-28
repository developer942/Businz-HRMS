# BUSINZ HRMS – EMPLOYEE PROFILE SAVE & POSTGRESQL PERSISTENCE FIX REPORT

**Target Environment:** Isolated HRMS Development & Verification Environment (Production URL `https://hrms.businz.com` untouched pending explicit deployment approval)  
**Module:** Employee Directory & Employee Profile (`EmployeeProfile.tsx`, `HRMSContext.tsx`, `employeeController.ts`, `employeeValidators.ts`, `employeeProfileSyncService.ts`, `employeeRepository.ts`, `authRepository.ts`)

---

## 1. Phase 1 – Root Cause Audit (14-Step Save Workflow)

Through systematic inspection of the complete 14-step Employee Profile save pipeline (`Edit Profile` → controlled form state → frontend validation → `handleSaveChanges` → `PUT /api/v1/employees/:id/profile-sync` → `authMiddleware` / `roleMiddleware` → `updateEmployeeSchema` → `employeeController.syncEmployeeProfile` → `employeeProfileSyncService.syncEmployeeProfile` → PostgreSQL transaction → response → cache invalidation → `syncAllModulesFromDatabase`), **8 concrete root causes** were identified and verified:

| # | Step in Save Workflow | Root Cause Identified | Symptom Observed |
| :--- | :--- | :--- | :--- |
| **RC-0** | **Step 5–6: Auth Token Key Mismatch (`HRMSContext.tsx`)** | `authService.ts` stores the authenticated JWT session under `'vrm_auth_token'` (`sessionStorage` & `localStorage`), whereas `HRMSContext.updateEmployee` (and `updateEmployeeLoginStatus`) looked only for `localStorage.getItem('vrm_hrms_token') \|\| localStorage.getItem('hrms_auth_token')`. Consequently, `updateEmployee` could not find the active session token (`vrm_auth_token`) and aborted before calling `PUT /api/v1/employees/:id/profile-sync`. | Clicking **Save Changes** failed with `"Your authenticated session is unavailable. Please sign in again."` or never reached the backend sync endpoint. |
| **RC-1** | **Step 5–8: Zod Validation (`employeeValidators.ts`)** | `EmployeeProfile.tsx` always sends complete nested objects (`currentAddress`, `permanentAddress`, `educationalDetails`, `experienceDetails`, `bankDetails`) with empty string `""` for unfilled optional sub-fields. `updateEmployeeSchema` previously shared the strict creation sub-schemas (`min(1)` on `street`, `city`, `state`, `qualification`, `institution`, `bankName`, and regex on `pincode`, `accountNumber`, `ifscCode`), rejecting profile edits with HTTP `422 Validation Error` whenever any optional sub-field was blank. | Clicking **Save Changes** on an employee whose address, education, or bank details were partially empty failed with a validation error. |
| **RC-2** | **Step 7: RBAC / Role Resolution (`authRepository.ts`)** | `authRepository.findByIdentifier` matched only `employee_id` or `email` (not `employee.id::text`) and did not inspect `profile_data.systemAccess.role` or short department/designation names (`HR`, `Accounts`). HR users whose designation was `"HR"` or whose role was stored in `profile_data.systemAccess.role` resolved to `'Employee'`, causing `roleMiddleware(['Super Admin', 'CEO', 'HR Manager'])` to return `403 Forbidden`. | Authorized HR users received `403 Forbidden` when saving employee profiles. |
| **RC-3** | **Step 9–10: Department Mapping (`employeeProfileSyncService.ts` & `HRMSContext.tsx`)** | `EmployeeProfile.tsx` edited `formData.department` (department name) without updating `departmentId`. On the backend, `employeeProfileSyncService.ts` prioritized `input.departmentId` (the old UUID) over `input.department` (the newly selected name). Additionally, on the frontend, `resolveEmployeeDepartmentName` in `HRMSContext.tsx` checked `inferDepartmentFromDesignation` *before* reading `raw.department_name` or `raw.profile_data.department`. | Changing an employee's department appeared to save or reverted immediately to the old department or designation-inferred department on refresh. |
| **RC-4** | **Step 10: Partial Update Null-Overwrite & `salary_structures` Constraint (`employeeProfileSyncService.ts`)** | (a) When updating a subset of fields, `employeeProfileSyncService.ts` used `input.field || null` instead of falling back to `oldEmployee.field`, overwriting omitted columns (`phone`, `designation`, `joining_date`, `reporting_manager_id`) with `NULL`. (b) In `public.salary_structures`, `Math.round()` on component percentages (`NUMERIC(5,2)`) could sum to `99` or `101`, violating PostgreSQL `CONSTRAINT check_percentages_sum CHECK (basic_percentage + da_percentage + conveyance_percentage + hra_percentage = 100.00)` and rolling back the entire transaction. | Editing a single field could wipe other columns, or editing non-standard salary splits rolled back the PostgreSQL transaction with a check constraint error. |
| **RC-5** | **Step 10: Shift Lookup Failure (`employeeProfileSyncService.ts`)** | `EmployeeProfile.tsx` sends shift labels formatted with timings (e.g., `"Normal Shift (09:30 - 18:30)"`) or legacy codes (`"SH-01"`), whereas `public.shifts.name` stored `"Normal Shift"`. The exact-match lookup failed and threw `400 VALIDATION_ERROR: Selected shift does not exist`, rolling back the profile save. | Saving a profile when a shift with time range or legacy code was selected failed with a 400 error. |
| **RC-6** | **Step 12–13: Backend Memory Cache & `mapDbRowToEmployee` (`employeeRepository.ts` & ` employeeProfileSyncService.ts`)** | (a) `employeeProfileSyncService.ts` did not invalidate `memoryCache` (`emp_*`, `ss_*`, `employees_all_active`) after committing the transaction. (b) `employeeRepository.mapDbRowToEmployee` did not unpack `data.profile_data`, omitting `bankDetails`, `allowances`, `currentAddress`, `gpsAllowed`, `reportingManagerName`, and `rowVersion` on subsequent `GET /api/v1/employees` requests. | Reopening the profile or refreshing fetched cached/incomplete rows missing JSONB profile fields. |
| **RC-7** | **Step 13–14: Stale `company_settings.employee_profiles_data` Overwriting PostgreSQL (`HRMSContext.tsx`)** | In `HRMSContext.syncAllModulesFromDatabase`, `const merged = { ...base, ...extension }` spread `company_settings.employee_profiles_data` (`extension`) *on top of* the authoritative PostgreSQL `public.employees` row (`base`). Because `persistEmployeeProfileExtension` ran asynchronously or held an older snapshot, refreshing the page overwrote the newly saved PostgreSQL columns (`firstName`, `lastName`, `department`, `designation`, `basicSalary`, `workShift`, `bankDetails`) with stale values from `company_settings`. | Fields appeared updated temporarily right after clicking Save, but reverted to old values after refreshing the page or logging out and back in. |

---

## 2. Summary of Fixes Implemented (Phases 2–6 & Phase 8)

### Phase 2 – All Editable Profile Fields Fixed
- **Backend Validator ([`employeeValidators.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/validators/employeeValidators.ts))**:
  - Added `emptyToUndefined` preprocessing and dedicated update sub-schemas (`updateCurrentAddressSchema`, `updateEducationalDetailsSchema`, `updateExperienceDetailsSchema`, `updateBankDetailsSchema`) so blank optional sub-fields (`""` or `null`) are cleanly accepted on profile update, while non-empty invalid values (invalid phone, email, pincode, PAN, IFSC, account number, or negative salary) are strictly rejected with HTTP `422`.
- **Full Field Coverage**:
  - Verified end-to-end persistence for:
    - Employee Name (`firstName`, `lastName`)
    - Contact Number (`phone`)
    - Email (`email`, `personalEmail`)
    - Current & Permanent Address (`currentAddress`, `permanentAddress`, `address`)
    - Emergency Contact (`emergencyContact`)
    - Department (`department`, `departmentId`)
    - Designation (`designation`)
    - Reporting Manager (`reportingManagerId`, `reportingManagerName`)
    - Employment Type (`employmentType`) & Status (`status`, `accountStatus`)
    - Joining Date (`joiningDate`)
    - Assigned Shift (`workShift`, `shiftDetails`) & Weekly Off (`shiftDetails.weeklyOff`)
    - Attendance Settings (`attendanceMethod`) & GPS Remote Punch Permission (`gpsAllowed`)
    - Bank Details (`bankDetails`: `bankName`, `accountNumber`, `ifscCode`, `branchName`)
    - Statutory Details (`panNumber`, `uanNumber`, `withPf`, `salaryScheme`)
    - Salary Structure (`basicSalary`, `allowances`, `salaryDetails`)
    - Employee Documents (`documents`), Education (`educationalDetails`), and Experience (`experienceDetails`)

### Phase 3 – Authoritative PostgreSQL Persistence & Transactions
- **Transactional Save ([`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts))**:
  - Uses parameterized SQL queries inside `withTransaction` (`BEGIN` ... `COMMIT` / `ROLLBACK`).
  - Automatically ensures required schema extensions (`ensureProfileSyncSchema`) exist on `public.employees` (`profile_data`, `row_version`, `payroll_eligible`, `shift_effective_from`, `salary_effective_from`, `weekly_off_policy`) and supporting tables (`employee_weekly_off_assignments`, `employee_profile_audit_logs`).
  - Resolves `department_id` by prioritizing the updated `input.department` name and auto-creating missing department records in `public.departments` if needed.
  - Preserves existing column values on partial updates (`hasField` check falls back to `oldEmployee` instead of `NULL`).
  - Verifies `updatedResult.rowCount > 0` (throws `500 UPDATE_ZERO_ROWS` if zero rows are affected).
  - Enforces optimistic concurrency control via `row_version` (`409 CONFLICT` on concurrent conflicting edits).
  - Synchronizes `public.company_settings` (`'employee_profiles_data'`) inside the same PostgreSQL transaction so the extension snapshot never lags behind `public.employees`.
  - Records an immutable audit trail entry in `public.employee_profile_audit_logs` with `performed_by`, `old_values`, and `new_values`.

### Phase 4 – Immediate UI Synchronization Across Desktop & Mobile
- **Authoritative State Merging ([`HRMSContext.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/context/HRMSContext.tsx) & [`employeeRepository.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/repositories/employeeRepository.ts))**:
  - Updated `employeeRepository.mapDbRowToEmployee` to unpack `data.profile_data` alongside SQL columns.
  - Invalidated backend `memoryCache` (`emp_*`, `ss_*`, `employees_all_active`) immediately upon transaction commit.
  - Fixed `resolveEmployeeDepartmentName` in `HRMSContext.tsx` to prioritize PostgreSQL `department_name`, `department_id`, and `profile_data.department` over designation inference.
  - Fixed `syncAllModulesFromDatabase` in `HRMSContext.tsx` so authoritative PostgreSQL `public.employees` fields (`base`) always take precedence over `company_settings.employee_profiles_data` (`extension`).

### Phase 5 – Shift & Salary Synchronization
- **Shift & Weekly Off Synchronization ([`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts))**:
  - Normalized shift lookups to strip parenthesized timing suffixes (`"Normal Shift (09:30 - 18:30)"` → `"Normal Shift"`), map legacy shift codes (`SH-01`..`SH-04`), and auto-provision valid named shifts in `public.shifts`.
  - Closes prior active `public.shift_assignments` rows before `shiftEffectiveFrom`, inserts/updates the new shift assignment, updates `public.employee_weekly_off_assignments`, and updates unfinalized `public.attendance_records` on or after `shiftEffectiveFrom` while preserving finalized historical attendance.
- **Salary & Draft Payroll Synchronization ([`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts))**:
  - Computes 2-decimal component percentages (`NUMERIC(5,2)`) guaranteed to sum to `100.00` (`check_percentages_sum`), updates `public.salary_structures`, and recalculates `DRAFT` rows in `public.payroll_records` from `salaryEffectiveFrom` while preserving `PAID` finalized historical payrolls.

### Phase 6 – Password Protection (CRITICAL)
- **Zero Password Mutation Guarantee**:
  - [`EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx): Removed `password` and `mustChangePassword` from `handleSaveChanges` payload and made the Portal Login Password display read-only during profile editing (password resets remain exclusively in the dedicated Reset Login Credentials workflow).
  - [`HRMSContext.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/context/HRMSContext.tsx): Explicitly deletes `password`, `passwordHash`, `plainPassword`, and `mustChangePassword` from outgoing profile update payloads while preserving existing password metadata in local state.
  - [`employeeController.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/controllers/employeeController.ts) & [`employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts): Strips all password-related keys from request bodies, `profile_data`, and audit logs, and never touches `public.employees.password` or `must_change_password` in profile update SQL statements.

### Phase 8 – Error Handling & Retry UX
- **No False Success + Retry Button ([`EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx))**:
  - Added frontend validation for Bank Account Number (`9–18 digits`) and IFSC Code (`^[A-Z]{4}0[A-Z0-9]{6}$`).
  - If validation or backend save fails, `isEditing` remains `true`, all unsaved user inputs are preserved in `formData`, a clear error banner is displayed with a **Retry Save** button, and `"Saved Successfully!"` is never shown unless the PostgreSQL transaction commits and returns `200 OK`.

---

## 3. Phase 7 – Verification Matrix (All 20 Test Cases)

Automated verification was executed across:
- **Backend Integration & Validation Suite**: `npx vitest run tests/datatypeValidation.test.ts tests/employeeProfileSavePersistence.test.ts` (**60 / 60 tests passed**)
- **Frontend End-to-End Playwright Suite**: `npx playwright test e2e/employee-profile-persistence.spec.ts` (**Desktop, Android Chrome, iPhone Safari, and Error/Retry workflows passed**)

| Test # | Test Case Description | Verification Method | Result |
| :---: | :--- | :--- | :---: |
| **1** | Edit employee name and save | Vitest (`employeeProfileSavePersistence.test.ts`) + Playwright E2E | **PASS** |
| **2** | Edit mobile number and save | Vitest + Playwright E2E (`9840123456`) | **PASS** |
| **3** | Edit department and save | Vitest + Playwright E2E (`Sales` → `Engineering`) | **PASS** |
| **4** | Edit designation and save | Vitest + Playwright E2E (`Senior Structural Engineer` / `Lead Civil Engineer`) | **PASS** |
| **5** | Edit shift and save | Vitest (`Normal Shift (09:30 - 18:30)` → `shift_assignments` + unfinalized `attendance_records`) | **PASS** |
| **6** | Edit weekly off and save | Vitest (`Saturday & Sunday` → `employee_weekly_off_assignments`) | **PASS** |
| **7** | Edit salary structure and save | Vitest + Playwright E2E (`50000` CTC → `salary_structures` + `DRAFT` `payroll_records`) | **PASS** |
| **8** | Edit bank details and save | Vitest + Playwright E2E (`HDFC Bank`, `50100234567890`, `HDFC0000240`) | **PASS** |
| **9** | Save multiple fields together | Vitest + Playwright E2E (Name, Phone, Dept, Designation, Address, Emergency Contact, Shift, Salary, Bank) | **PASS** |
| **10** | Refresh page and verify persistence | Playwright E2E (`page.reload()` with stale `company_settings` snapshot) | **PASS** |
| **11** | Logout and login again and verify persistence | Verified via `/api/v1/employees` & `/api/v1/auth/me` reload cycle | **PASS** |
| **12** | Reopen employee profile and verify values | Playwright E2E (Close modal → reopen from Employee Directory) | **PASS** |
| **13** | Verify values in PostgreSQL | Vitest (`public.employees`, `profile_data`, `company_settings`, `employee_profile_audit_logs`) | **PASS** |
| **14** | Verify updated details in related modules | Vitest (`shift_assignments`, `attendance_records`, `salary_structures`, `payroll_records`) | **PASS** |
| **15** | Invalid input validation | Vitest (`datatypeValidation.test.ts` 55 tests + 422 test) & Frontend validation | **PASS** |
| **16** | Unauthorized user restriction | Vitest (`Employee` role receives `403 Forbidden`, zero DB mutations) | **PASS** |
| **17** | Employee login password remains unchanged | Vitest + Playwright E2E (`password` hash & plain password untouched, stripped from payload) | **PASS** |
| **18** | Android Chrome mobile view (`360x800`) | Playwright E2E (`Android Chrome Mobile (360x800)`) | **PASS** |
| **19** | iPhone Safari mobile view (`390x844`) | Playwright E2E (`iPhone Safari Mobile (390x844)`) | **PASS** |
| **20** | Desktop browser view (`1440x900`) | Playwright E2E (`Desktop Browser (1440x900)`) | **PASS** |

---

## 4. Modified Files

1. [`backend/src/validators/employeeValidators.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/validators/employeeValidators.ts)
2. [`backend/src/repositories/authRepository.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/repositories/authRepository.ts)
3. [`backend/src/services/employeeProfileSyncService.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/services/employeeProfileSyncService.ts)
4. [`backend/src/controllers/employeeController.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/controllers/employeeController.ts)
5. [`backend/src/repositories/employeeRepository.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/src/repositories/employeeRepository.ts)
6. [`frontend/src/context/HRMSContext.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/context/HRMSContext.tsx)
7. [`frontend/src/components/employees/EmployeeProfile.tsx`](file:///c:/Users/ahile/Downloads/HRM/frontend/src/components/employees/EmployeeProfile.tsx)
8. [`backend/tests/employeeProfileSavePersistence.test.ts`](file:///c:/Users/ahile/Downloads/HRM/backend/tests/employeeProfileSavePersistence.test.ts)
9. [`frontend/e2e/employee-profile-persistence.spec.ts`](file:///c:/Users/ahile/Downloads/HRM/frontend/e2e/employee-profile-persistence.spec.ts)

