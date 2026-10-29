# BUSINZ HRMS – EMPLOYEE PROFILE EDIT, SAVE & SHIFT SYNCHRONIZATION FIX REPORT

**Application**: BUSINZ Enterprise HRMS (`https://hrms.businz.com`)  
**Scope**: Employee Profile Editing, Save Changes Workflow, Shift Assignment Persistence, Effective Date Handling, Cross-Module Synchronization, Salary Revision Persistence, and Password Isolation  
**Status**: Root Causes Identified, Fixed, and Verified in Development Environment

---

## 1. Root Cause Analysis of Employee Profile Save Failure

When an authorized HR Manager or CEO opened an Employee Profile (e.g. **Shinodh G kurup — `VRM-044`**), changed the **Work Shift Assigned** from `Morning 2` to `NORMAL SHIFT` (or edited other profile details), and clicked **Save Changes**, saving either failed with a `409 Conflict` banner:

> `Failed to update profile in database: This employee profile was changed by another user. Reload and apply your changes again.`

or appeared to save momentarily before reverting back to the old shift (`Morning 2`).

A full trace of the `Edit → Validate → Submit → Backend → PostgreSQL Commit → Refetch → Display` pipeline revealed **four interacting root causes**:

### Root Cause 1: Optimistic Concurrency Version Drift (`rowVersion` vs `row_version`)
- **Where**: `frontend/src/context/HRMSContext.tsx` (`syncAllModulesFromDatabase` lines 10809–10818 and `mapEmployeeFromDb` line 1460), `backend/src/repositories/employeeRepository.ts` (`mapDbRowToEmployee` line 157), and `backend/src/services/employeeProfileSyncService.ts` (lines 868–906).
- **Mechanism**:
  1. In `syncAllModulesFromDatabase`, the frontend merged `extension` (`company_settings.employee_profiles_data`, which uses camelCase keys like `rowVersion: 1`) with `e` (the PostgreSQL `employees` table row, which uses snake_case `row_version: 2, 3, ...`).
  2. In `mapEmployeeFromDb`, `rowVersion` was evaluated as `Number(d.rowVersion ?? d.row_version ?? 1)`. Because `d.rowVersion` (from the camelCase snapshot) was checked **before** `d.row_version` (from the PostgreSQL `employees` column), and `employeeProfileSyncService` did not write the incremented `rowVersion` back into `profile_data` or `company_settings.employee_profiles_data`, the frontend's `employee.rowVersion` remained stuck at `1` while PostgreSQL `employees.row_version` incremented to `2+`.
  3. On the next edit, `EmployeeProfile.tsx` sent `expectedVersion: 1` to `PUT /api/v1/employees/:id/profile-sync`, which compared `Number(oldEmployee.row_version) !== Number(options.expectedVersion)` (`2 !== 1`) and threw `409 STALE_EMPLOYEE_VERSION`.
  4. Clicking **Retry Save** while `isEditing` was `true` re-sent the same stale `currentEmp.rowVersion` (`1`), causing an infinite 409 loop.

### Root Cause 2: Legacy Background Sync Overwriting Saved Shifts (`applyApprovedShiftsToEmployees` & `shiftAttendanceEngine`)
- **Where**: `frontend/src/context/HRMSContext.tsx` (`applyApprovedShiftsToEmployees` lines 8071–8099, invoked every 30 seconds by `syncAllModulesFromDatabase` at line 11402) and `frontend/src/services/shiftAttendanceEngine.ts` (`resolveEmployeeAssignedShift` lines 137–151).
- **Mechanism**:
  1. `applyApprovedShiftsToEmployees` was a legacy helper written before `employees.work_shift` existed in PostgreSQL. On every 30-second background sync, if an employee had *any* historical approved `ShiftRequest` with `requestedDate <= today`, it unconditionally overwrote `emp.workShift` in React state back to `r.requestedShift`, wiping out the shift HR had just saved in Employee Profile.
  2. In `mapEmployeeFromDb`, `workShift` evaluated `d.workShift || d.work_shift`, prioritizing camelCase `extension.workShift` over PostgreSQL's `raw.work_shift`.
  3. In `resolveEmployeeAssignedShift` (`shiftAttendanceEngine.ts`), `s.assignments` was checked **before** `employee.workShift`, and `supabaseDirect.getShifts` fetched all rows from `public.shift_assignments` without filtering out closed historical assignments (`effective_to < today`) or future assignments (`effective_from > today`).

### Root Cause 3: Future Effective Date Shift Assignments Immediately Overwriting Active Shift
- **Where**: `backend/src/services/employeeProfileSyncService.ts` (lines 368, 413, 514, 650–726) and `frontend/src/components/employees/EmployeeProfile.tsx` (lines 3284, 3972).
- **Mechanism**:
  1. When HR assigned a new shift with a **future** `Shift / Weekly Off Effective From` date (`shiftEffectiveFrom > today`), `employeeProfileSyncService` immediately overwrote `employees.work_shift` and `profile_data.workShift` with the future shift instead of keeping the current active shift for today and scheduling the future shift as an upcoming shift.
  2. In `EmployeeProfile.tsx`, the header banner rendered `{formData.shift}` (the unsaved form input / future shift) rather than displaying the confirmed current active shift alongside a scheduled upcoming shift badge.

### Root Cause 4: `DD/MM/YYYY` Date Strings & `<select>` Option Mismatch
- **Where**: `backend/src/validators/employeeValidators.ts` (`dateSchema` line 246), `backend/src/services/employeeProfileSyncService.ts` (`isoDate` line 91), and `frontend/src/components/employees/EmployeeProfile.tsx` (lines 564, 994, 1518, 3270).
- **Mechanism**:
  1. `dateSchema` used `Date.parse(val)` directly, which returns `NaN` for `DD/MM/YYYY` strings (`30/01/2004`, `27/10/2026`), and `isoDate` required `^\d{4}-\d{2}-\d{2}$` without normalizing `DD/MM/YYYY`.
  2. In `EmployeeProfile.tsx`, `firstName` and `lastName` had a 15-character truncation (`maxLength={15}` / `.slice(0, 15)`).
  3. In Section 07 (`Work Shift Assigned`), if an employee's existing `workShift` (e.g. `Morning 2`) was not an exact string match in `shifts`, the HTML `<select>` visually displayed the first option in `shifts` while `formData.shift` remained `Morning 2`.

---

## 2. Save Changes Button Audit (Top vs. Bottom Button)

| Control | Component & Location | Handler Invoked | Disabled During Save | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Top Save Changes Button** | `EmployeeProfile.tsx` (Header Action Bar, line 4040) | `onClick={handleSaveChanges}` | `disabled={isSaving}` (`Saving...`) | Verified & Synchronized |
| **Bottom Save Changes Button** | `EmployeeProfile.tsx` (Sticky Footer Action Bar, line 4444) | `onClick={handleSaveChanges}` | `disabled={isSaving}` (`Saving Changes...`) | Verified & Synchronized |
| **Error Banner Retry Save Button** | `EmployeeProfile.tsx` (Validation Banner, line 4224) | `onClick={handleSaveChanges}` | `disabled={isSaving}` (`Retrying...`) | Uses latest `employee.rowVersion ?? currentEmp.rowVersion` |

Both the top and bottom **Save Changes** buttons invoke the exact same `handleSaveChanges` function, prevent duplicate submissions via `disabled={isSaving}`, keep the edit form open with unsaved changes intact if validation or database persistence fails, and only display the success banner after PostgreSQL transaction commit is confirmed.

---

## 3. Shift Persistence & Effective Date Architecture

### Backend (`backend/src/services/employeeProfileSyncService.ts`)
1. **Shift Master Validation**:
   - Looks up the target shift in `public.shifts` by UUID, exact `shift_name` (case-insensitive), or clean shift name (without time suffix).
   - Rejects invalid/non-existent shift names with `400 INVALID_SHIFT`.
2. **Effective Date Resolution (`shiftEffectiveFrom` vs. `today`)**:
   - **Immediate / Current Shift (`shiftEffectiveFrom <= today`)**:
     - Updates `public.employees.work_shift` and `profile_data.workShift` to the newly assigned shift.
     - Clears `upcomingShift` and `upcomingShiftEffectiveFrom`.
     - Closes any prior open row in `public.shift_assignments` at `shiftEffectiveFrom - 1 day` and upserts the new active assignment starting at `shiftEffectiveFrom`.
     - Updates non-finalized `public.attendance_records` from `shiftEffectiveFrom` onward while preserving all finalized (`is_finalized = TRUE`) historical attendance records.
   - **Future Scheduled Shift (`shiftEffectiveFrom > today`)**:
     - Preserves the employee's current active shift in `public.employees.work_shift` and `profile_data.workShift` for today.
     - Persists `upcomingShift` and `upcomingShiftEffectiveFrom` in `profile_data` and `profile_data.shiftDetails`.
     - Closes the current open assignment in `public.shift_assignments` at `shiftEffectiveFrom - 1 day` and inserts the future assignment row starting on `shiftEffectiveFrom`.
     - When `upcomingShiftEffectiveFrom <= today` is reached, `mapDbRowToEmployee` (`employeeRepository.ts`) and `mapEmployeeFromDb` (`HRMSContext.tsx`) automatically promote `upcomingShift` to the active `workShift`.

### Frontend (`EmployeeProfile.tsx`, `HRMSContext.tsx`, `shiftAttendanceEngine.ts`, `ShiftManagement.tsx`)
- **Profile Header Banner**: Displays the confirmed active shift (`currentEmp.workShift`) and, when a future shift is scheduled, renders an amber pill badge next to it: `Upcoming: <Shift Name> (DD/MM/YYYY)`.
- **Section 07 (`Shift & Attendance Policy`)**: Displays both the current active shift and any scheduled upcoming shift with its effective date, and ensures the `<select>` dropdown always includes the employee's current shift alongside all Shift Master options.
- **Cross-Module Sync**: Dispatches `hrms:shift-assignments-changed` after every profile save and updates `ShiftManagement.tsx` whenever `employees` state changes.

---

## 4. PostgreSQL Transaction & Schema Integrity

All Employee Profile saves execute inside a single ACID PostgreSQL transaction (`withTransaction` in `employeeProfileSyncService.ts`):
1. `SELECT ... FROM public.employees ... FOR UPDATE OF e` locks the target employee row by UUID or `employee_id` (`VRM-044`, `EMP-004`, etc.).
2. Resolves `department_id` from `public.departments` and `reporting_manager_id` from `public.employees`.
3. Updates all 54 columns on `public.employees` (`first_name`, `last_name`, `email`, `phone`, `dob`, `gender`, `address`, `department_id`, `designation`, `reporting_manager_id`, `reporting_manager_name`, `joining_date`, `employment_type`, `status`, `avatar_url`, `basic_salary`, `allowances_*`, `bank_name`, `account_number`, `ifsc_code`, `branch`, `attendance_method`, `gps_allowed`, `work_shift`, `pan_number`, `uan_number`, `address_line1..pincode`, `highest_qualification..grade_percentage`, `experience_profile..previous_company_location`, `profile_data`, `account_status`, `payroll_eligible`, and `row_version = COALESCE(row_version, 1) + 1`) and verifies `updatedResult.rowCount > 0`.
4. Updates `public.shift_assignments` and non-finalized `public.attendance_records`.
5. Updates `public.employee_weekly_off_assignments`.
6. Updates `public.salary_structures` and recalculates `DRAFT` rows in `public.payroll_records` (leaving `FINALIZED`/`PAID` payroll records untouched).
7. Inserts new attachments into `public.employee_documents`.
8. Synchronizes `public.company_settings` (`setting_key = 'employee_profiles_data'`) with the new `rowVersion`, `workShift`, `upcomingShift`, and profile fields inside the same transaction.
9. Records an audit entry in `public.employee_profile_audit_logs`.

---

## 5. Password Isolation & Protection Verification (Phase 8)

- `withoutSecrets()` in `employeeProfileSyncService.ts` strips `password`, `passwordHash`, `plainPassword`, `mustChangePassword`, `officialUsername`, and `systemAccess.password` from all incoming payloads and audit logs.
- `syncEmployeeProfile` and `updateEmployee` in `employeeController.ts` delete `password`, `passwordHash`, `plainPassword`, and `mustChangePassword` before validation and persistence.
- `employeeRepository.updateEmployee` does not write `password` or `must_change_password` columns.
- Existing employee password hashes in `public.employees.password` and credentials in `company_settings` remain 100% untouched during profile edits.

---

## 6. Files Modified

| File | Summary of Changes |
| :--- | :--- |
| `backend/src/validators/employeeValidators.ts` | Added `normalizeDateString` to `dateSchema` so both `YYYY-MM-DD` and `DD/MM/YYYY` / `DD-MM-YYYY` dates validate and normalize cleanly. |
| `backend/src/middleware/errorHandler.ts` | Included `currentVersion` directly on the error object when `409 STALE_EMPLOYEE_VERSION` is returned. |
| `backend/src/repositories/employeeRepository.ts` | Updated `mapDbRowToEmployee` to map `rowVersion` from `data.row_version`, map `upcomingShift`/`upcomingShiftEffectiveFrom` (auto-promoting due shifts), and removed password mutation from `updateEmployee`. |
| `backend/src/services/employeeProfileSyncService.ts` | Added `normalizeDateText` for date columns/effective dates; implemented active vs. future shift persistence (`workShift` vs `upcomingShift` + `upcomingShiftEffectiveFrom`); synchronized `rowVersion` across `profile_data` and `company_settings.employee_profiles_data`. |
| `frontend/src/types/hrms.ts` | Added `upcomingShift`, `upcomingShiftEffectiveFrom`, `shiftEffectiveFrom`, and `salaryEffectiveFrom` to `Employee` and `shiftDetails`. |
| `frontend/src/context/HRMSContext.tsx` | Prioritized authoritative PostgreSQL columns (`row_version`, `work_shift`, etc.) over stale `extension` properties in `mapEmployeeFromDb` and `syncAllModulesFromDatabase`; added automatic one-time version rebase retry on `409 STALE_EMPLOYEE_VERSION` in `updateEmployee`; prevented `applyApprovedShiftsToEmployees` from overwriting saved `workShift` values; filtered `shift.assignments` by active effective dates. |
| `frontend/src/services/supabaseDirectService.ts` | Included `effective_from,effective_to` in `getShifts` `shift_assignments` query. |
| `frontend/src/services/shiftAttendanceEngine.ts` | Updated `resolveEmployeeAssignedShift` to prioritize `employee.workShift` (and due `upcomingShift`) over legacy `s.assignments` and filter assignments by effective dates. |
| `frontend/src/components/employees/EmployeeProfile.tsx` | Normalized dates (`dob`, `joiningDate`, `expStartDate`, `expEndDate`, `shiftEffectiveFrom`, `salaryEffectiveFrom`); increased name `maxLength` from 15 to 50; synchronized `rowVersion` on retry; displayed active shift + `Upcoming: <Shift> (<Date>)` badge in both the Profile Header and Section 07. |
| `frontend/src/components/shift/ShiftManagement.tsx` | Updated `useEffect` dependency to re-evaluate shift assignment summaries immediately whenever `employees` or `shifts` state updates. |
| `backend/tests/employeeProfileSavePersistence.test.ts` | Added test coverage for `VRM-044` shift change (`Morning 2` -> `NORMAL SHIFT`) with `DD/MM/YYYY` dates, future shift scheduling (`upcomingShift`), and `currentVersion` conflict reporting. |

---

## 7. 25-Scenario Verification Matrix (Phase 9)

| # | Test Scenario | Expected Outcome | Verification Result |
| :---: | :--- | :--- | :--- |
| **1** | Edit VRM-044 (`Shinodh G kurup`) shift from `Morning 2` to `NORMAL SHIFT` | Saves `NORMAL SHIFT` in `public.employees.work_shift`, `public.shift_assignments`, and `company_settings`, returning `200 OK` | **PASS** |
| **2** | Save shift change effective today | Immediately updates active `workShift` in Profile Header, Section 07, Employee Directory, Shift Management, and Attendance | **PASS** |
| **3** | Save shift change with future effective date (`shiftEffectiveFrom > today`) | Preserves current active shift for today, records future assignment in `public.shift_assignments`, and displays both active shift and `Upcoming: <Shift> (<Date>)` badge | **PASS** |
| **4** | Edit Weekly Off Schedule | Updates `profile_data.shiftDetails.weeklyOff` and upserts `public.employee_weekly_off_assignments` | **PASS** |
| **5** | Edit Attendance Verification Method | Persists `attendance_method` in `public.employees` and `profile_data` | **PASS** |
| **6** | Toggle GPS Remote Punch Permission | Persists `gps_allowed` boolean in `public.employees` and `profile_data` | **PASS** |
| **7** | Edit Personal Details (`firstName`, `lastName`, `dob`, `gender`, `maritalStatus`) | Saves up to 50-character names and normalizes `DD/MM/YYYY` (`30/01/2004`) to `2004-01-30` | **PASS** |
| **8** | Edit Phone Number | Validates 10-digit Indian mobile (`^[6-9]\d{9}$`) and persists to `public.employees.phone` | **PASS** |
| **9** | Edit Email Address | Normalizes to lowercase, checks uniqueness, and persists to `public.employees.email` | **PASS** |
| **10** | Edit Department & Designation | Resolves `department_id` in `public.departments` and updates `designation` | **PASS** |
| **11** | Edit Reporting Manager | Resolves manager UUID from `public.employees` and persists `reporting_manager_id` + `reporting_manager_name` | **PASS** |
| **12** | Edit Date of Joining & Employment Type | Normalizes `DD/MM/YYYY` (`27/10/2026`) to `2026-10-27` and persists `employment_type` | **PASS** |
| **13** | Edit Current & Permanent Address | Persists `address_line1..pincode` columns and `currentAddress`/`permanentAddress` JSONB | **PASS** |
| **14** | Edit Emergency Contact Details | Persists `emergencyContact` object (`name`, `relationship`, `mobile`, `alternateMobile`) | **PASS** |
| **15** | Edit Educational Qualifications | Persists `highest_qualification`, `degree_name`, `specialization`, `university`, `year_of_passing`, `grade_percentage` | **PASS** |
| **16** | Edit Work Experience Details (Fresher & Experienced) | Persists `experience_profile`, `total_experience`, `previous_company`, `employment_start_date`, `employment_end_date`, `last_drawn_salary` | **PASS** |
| **17** | Edit Salary Structure & Monthly CTC | Closes prior active row in `public.salary_structures`, inserts new revision with 100% component sum, and recalculates `DRAFT` payroll | **PASS** |
| **18** | Edit Bank & Statutory Details (`Bank Name`, `Account No`, `IFSC`, `PAN`, `UAN`) | Validates formats and persists to `bank_name`, `account_number`, `ifsc_code`, `pan_number`, `uan_number` | **PASS** |
| **19** | Upload Corporate Verification Document | Inserts new document record into `public.employee_documents` and `profile_data.documents` | **PASS** |
| **20** | Top Save Changes button vs. Bottom Save Changes button | Both buttons invoke `handleSaveChanges`, disable during save, and persist identically | **PASS** |
| **21** | Page Refresh & Reopen Employee Profile after Save | Prioritizes PostgreSQL `row_version` and `work_shift` over legacy snapshots; prevents `applyApprovedShiftsToEmployees` from reverting saved shift | **PASS** |
| **22** | Desktop & Mobile View Synchronization | Both desktop and mobile views read from the same authoritative `HRMSContext` / PostgreSQL state | **PASS** |
| **23** | Invalid Input Rejection | Rejects invalid phone/PAN/IFSC/effective date with `400`/`422` without closing edit form or losing unsaved edits | **PASS** |
| **24** | Unauthorized Role Rejection | Rejects non-HR/non-CEO profile edits with `403 FORBIDDEN` | **PASS** |
| **25** | Existing Employee Password Protection | Strips all password fields from profile sync payloads; existing bcrypt hashes and login credentials remain untouched | **PASS** |

---

## 8. Production Safety Compliance (Phase 10)

- **No Employee Records Deleted**: Verified.
- **No Employee Passwords Modified or Reset**: Verified (`withoutSecrets` + controller/repository password stripping).
- **No Historical Finalized Attendance Altered**: Verified (`WHERE shift_date >= $7 AND COALESCE(is_finalized, FALSE) = FALSE`).
- **No Finalized/Paid Payroll Overwritten**: Verified (`WHERE pr.status = 'DRAFT' AND run.status = 'DRAFT'`).
- **No CRM Modules Modified**: Verified.
- **No Production Deployment Executed**: Verified (all changes and tests executed in the local development workspace).
