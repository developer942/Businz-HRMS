# BUSINZ HRMS Employee Data Cleanup Report

## Status

- Phase: inspection and deletion preview only
- Environment inspected: production API at `hrms.businz.com`
- Configured PostgreSQL database: `businz_hrms`
- Inspection timestamp: 2026-10-21 06:53:44 UTC
- Public tables inspected: 47
- Destructive statements executed: **0**
- Approval requested: **No — execution is blocked by administrator deployment/login verification and backup verification**

No `DELETE`, `TRUNCATE`, `DROP`, or cleanup `UPDATE` was executed.

## Blocking safety findings

### 1. The intended system Super Admin is separate from employees, but production login currently fails

The owner confirmed the protected account is `developer@businz.com` / `EMP-000`. It is intentionally a system administrator, not a real employee, and must not appear in Employee Management.

Code inspection verified that employee-list filters already exclude `EMP-000`, `admin@businz.com`, and `developer@businz.com`. However, the credential check existed only in an unused legacy frontend service. The current frontend uses the backend `/api/v1/auth/login` endpoint, whose deployed implementation authenticates only rows from `employees`.

Two production login verification attempts on 2026-10-21 returned HTTP 401 `INVALID_CREDENTIALS` and issued no token. They added two normal failed-login audit entries but changed no employee data.

The backend has now been updated locally to resolve `developer@businz.com` / `EMP-000` from secure environment configuration as a virtual `Super Admin` account. It does not create an `employees` row and therefore remains hidden from the directory. The change builds successfully, four focused tests pass, and localhost end-to-end verification confirms login, JWT issuance, and `/auth/me` session restoration as `Super Admin`. It is not deployed to production because VPS SSH is unreachable.

### 2. PostgreSQL backup is blocked

The application and PostgREST API are reachable, but both direct PostgreSQL port 5432 and VPS SSH port 65002 time out from this environment. Consequently:

- `current_database()` could not be checked against the server directly.
- Live `pg_catalog` delete actions could not be queried directly.
- A PostgreSQL-native `pg_dump` backup could not be created or verified.
- The non-public `auth.users` compatibility table could not be inspected directly.

Cleanup must not proceed until a native PostgreSQL backup is created and verified through VPS/SSH or other authorized PostgreSQL access.

## Administrator and login architecture

- Regular employee profiles and login accounts are stored together in `employees`.
- The intended `developer@businz.com` / `EMP-000` Super Admin is a separate environment-backed system account and requires no employee row.
- All 17 employees have active login accounts and stored passwords.
- All 17 `auth_id` values are `NULL`; there is no live employee-to-`auth.users` link visible through the public schema.
- All 17 stored passwords are non-bcrypt legacy values. Password values were not recorded in this report.
- `password_resets` contains 0 rows.
- `auth_audit_logs` now contains 252 rows:
  - 110 reference current employee codes.
  - 140 reference 13 previously deleted/orphan employee codes.
  - 2 are failed production verification attempts for the system Super Admin and must be preserved.

The current production system-admin login is not functional. It must succeed after deploying the environment-backed backend path and before any employee deletion.

## Employee candidates

Because the protected Super Admin is separate from `employees`, all 17 current employee/login rows are provisional cleanup candidates:

`VRM-001`, `VRM-002`, `VRM-003`, `VRM-004`, `VRM-005`, `VRM-006`, `VRM-007`, `VRM-008`, `VRM-009`, `VRM-010`, `VRM-011`, `VRM-012`, `VRM-013`, `VRM-014`, `VRM-015`, `VRM-016`, `VRM-017`.

The protected system administrator is not included in this table and will remain available as `EMP-000` after the backend fix is deployed.

## Actual current counts

The `Deleted` column records completed deletion only. It remains zero because this is the preview stage.

| Item | Before | Deleted | Remaining |
|---|---:|---:|---:|
| Employee records | 17 | 0 | 17 |
| Employee login accounts | 17 | 0 | 17 |
| Attendance records | 71 relational + 6 JSON | 0 | 71 relational + 6 JSON |
| Face attendance logs | 24 relational + 45 JSON | 0 | 24 relational + 45 JSON |
| Leave records | 32 relational + 32 JSON | 0 | 32 relational + 32 JSON |
| Payroll records | 7 relational + 6 JSON | 0 | 7 relational + 6 JSON |
| Payroll runs | 12 | 0 | 12 |
| Expense claims | 4 relational + 4 JSON | 0 | 4 relational + 4 JSON |
| Shift assignments | 2 | 0 | 2 |
| Shift requests | 0 relational + 36 JSON | 0 | 0 relational + 36 JSON |
| Enterprise employee tasks | 15 | 0 | 15 |
| Salary advance/loan records | 0 relational + 7 JSON | 0 | 0 relational + 7 JSON |
| Overtime records | 0 relational + 11 JSON | 0 | 0 relational + 11 JSON |
| Field-duty assignments/trips | 0 relational + 2 JSON | 0 | 0 relational + 2 JSON |
| Employee documents | 0 relational | 0 | 0 relational |
| Employee profile JSON entries | 5 | 0 | 5 |
| Employee notification recipient rows | 0 | 0 | 0 |
| Authentication audit records | 252 | 0 | 252 |
| Configured system Super Admin | 1 | 0 | 1 |
| Working system Super Admin login | 0 | 0 | 0 |

## Relationship and dependency inventory

### Direct employee foreign keys observed in the live PostgREST schema

| Table | Employee column(s) | Current rows | Employee references |
|---|---|---:|---:|
| `attendance_records` | `employee_id` | 71 | 71 |
| `face_logs` | `employee_id` | 24 | 24 |
| `leave_requests` | `employee_id`, `approved_by` | 32 | 32 employee owners |
| `shift_assignments` | `employee_id` | 2 | 2 |
| `shift_requests` | `employee_id`, `approved_by` | 0 | 0 |
| `payroll_records` | `employee_id` | 7 | 7 |
| `expenses` | `employee_id`, `approved_by` | 4 | 4 employee owners |
| `salary_structures` | `employee_id` | 0 | 0 |
| `employee_documents` | `employee_id` | 0 | 0 |
| `notification_recipients` | `employee_id` | 0 | 0 |
| `performance_scores` | `employee_id` | 0 | 0 |
| `tasks` | `created_by`, `assigned_by`, `responsible_person_id`, `closed_by` | 0 | 0 |
| `task_assignees` | `employee_id` | 0 | 0 |
| `task_updates` | `employee_id`, `updated_by` | 0 | 0 |
| `task_comments` | `user_id` | 0 | 0 |
| `task_attachments` | `uploaded_by` | 0 | 0 |
| `mom_meetings` | `organizer_id` | 0 | 0 |
| `field_duty_assignments` | `employee_id`, `created_by` | 0 | 0 |
| `field_trip_sessions` | `employee_id` | 0 | 0 |
| `field_location_points` | `employee_id` | 0 | 0 |
| `field_tracking_alerts` | `employee_id` | 0 | 0 |
| `assets` | `assigned_employee_id` | 0 | 0 |
| `candidates` | `referrer_employee_id` | 1 | 0 |
| `departments` | `head_id` | 7 | 0 |
| `employees` | `reporting_manager_id` | 17 | 1 |

Indirect dependent tables include `performance_history`, `task_timeline`, `task_audit_logs`, `task_dependencies`, and `mom_action_items`. All currently contain 0 rows.

### Declared delete behavior

The deployed SQL and migrations declare:

- `CASCADE`: attendance, face logs, employee documents, shift assignments, shift requests, notification recipients, leave owner records, payroll owner records, expense owner records, task assignees/updates, performance scores.
- `SET NULL`: department head, asset assignee, candidate referrer, task creator/assigner/closer, meeting organizer, approval references, employee reporting manager.
- `RESTRICT`: several field-duty/tracking employee references in the base schema.

The live existence of the foreign keys was verified through PostgREST metadata. Their live `ON DELETE` actions must be reconfirmed through `pg_catalog` after direct PostgreSQL access is restored.

## Employee data outside foreign-key enforcement

These records will not reliably follow an employee deletion:

| Location | Current data | Finding |
|---|---:|---|
| `auth_audit_logs` | 250 | Employee code stored as text; 140 orphan rows already exist |
| `password_resets` | 0 | Employee code stored as text |
| `enterprise_tasks` | 15 | Employee identifiers/names stored as text and JSON; 12 match current employees |
| `payroll_runs` | 12 | Processor/approver stored as text; no live FK to payroll records |
| `company_settings.employee_profiles_data` | 5 entries | Three employees represented; UUID/code duplicates exist |
| `company_settings.*_data` | Multiple arrays | Duplicate employee transactions stored as JSONB |

The five profile JSON entries belong only to cleanup candidates. Some profile objects include credential, bank, salary, document, and system-access fields.

## Missing normalized tables

The live public schema does not contain these tables even though some appear in later repository migrations or feature terminology:

- `advance_salary_records`
- `overtime_records`
- `payroll_earnings`
- `payroll_deductions`
- `payroll_attendance`
- `payslips`
- `payroll_audit_logs`
- `leave_balances`
- `employee_profiles`

Salary advances/loans and overtime are currently persisted in `company_settings` JSON. Leave balances are computed from leave requests and policy data rather than stored in a dedicated table.

## Non-destructive deletion preview

This revised preview preserves the separate `developer@businz.com` / `EMP-000` system account and treats all database employee rows as removable employee test data.

| Target | Proposed removal | Proposed remaining | Notes |
|---|---:|---:|---|
| `employees` and login accounts | 17 | 0 | System Super Admin is not an employee row |
| `attendance_records` | 71 | 0 | All employee attendance data |
| `face_logs` | 24 | 0 | All employee face-attendance data |
| `leave_requests` | 32 | 0 | All owned by cleanup candidates |
| `shift_assignments` | 2 | 0 | Both owned by cleanup candidates |
| `expenses` | 4 | 0 | All owned by cleanup candidates |
| `payroll_records` | 7 | 0 | Includes the former CEO employee payroll row |
| `auth_audit_logs` | 250 | 2 | Preserve the system-admin failed-login audit entries |
| `enterprise_tasks` | 15 | 0 | Includes 12 current-employee and 3 legacy/orphan task rows |
| `payroll_runs` | 12 | 0 | Transactional test batches; independent of current payroll FK graph |
| Employee profile JSON | 5 entries | 0 | No protected-account profile entry exists |
| Attendance JSON | 6 entries | 0 | Legacy employee attendance data |
| Face-log JSON | 45 entries | 0 | 44 current-candidate and 1 legacy/orphan entry |
| Leave JSON | 32 entries | 0 | All match cleanup candidates |
| Expense JSON | 4 entries | 0 | All match cleanup candidates |
| Payroll JSON | 6 entries | 0 | All belong to employee rows being removed |
| Salary advance/loan JSON | 7 entries | 0 | Four current-candidate and three legacy/orphan records |
| Overtime JSON | 11 entries | 0 | Employee transaction records using legacy identifiers |
| Shift-request JSON | 36 entries | 0 | 35 current-candidate and one legacy record |
| Field assignment/trip JSON | 2 entries | 0 | Employee field-duty history |
| Shared notification JSON | 0 notifications | 100 notifications | Remove only two cleanup-employee targeting/read references; preserve messages |

No rows or JSON entries have been removed.

## Explicit preservation set

The following are excluded from deletion:

- All 37 `company_settings` rows; only approved employee-data elements inside specific JSON values may later be removed.
- 7 departments.
- 0 normalized designations and 3 designation JSON definitions.
- 3 normalized shift templates and 12 shift-template JSON definitions.
- 6 roles.
- 238 permissions.
- 1 payroll-settings row and payroll policy JSON.
- Attendance, leave, overtime, loan, holiday, and reward policy definitions.
- 1 geofence configuration row.
- 1 workflow configuration row.
- SMTP and company/integration configuration.
- 1 job opening and 1 candidate; the candidate has no employee referrer link.
- All 100 shared notification messages; only employee-specific target/read references are candidates.
- Environment-backed `developer@businz.com` / `EMP-000` system account and its audit history. It has no employee-directory row.

## Backup and rollback plan

Before any approval-ready execution:

1. Restore SSH or direct PostgreSQL access.
2. Confirm `current_database()`, server identity, PostgreSQL version, and production container name.
3. Run `pg_dump` in PostgreSQL custom format with timestamp and checksum.
4. Verify the dump with `pg_restore --list` and store its SHA-256 checksum.
5. Export the exact approved employee rows and dependent records separately for audit.
6. Deploy the environment-backed system-admin backend change and verify login plus `/auth/me` session restoration.
7. Re-query role assignments and certify that the protected identity remains outside the employee cleanup set.
8. Execute cleanup in one database transaction using an immutable protected system-account identity.
9. Run post-change assertions before commit; issue `ROLLBACK` if the protected account, roles, permissions, or configuration counts differ.
10. After commit, test protected-account login and authenticated CEO/HR/employee creation.
11. If post-commit validation fails, restore into a separate database/container from the verified dump, validate it, and switch back safely rather than overwriting production blindly.

## Approval gate

Deletion is **not approval-ready**. Required inputs/actions:

1. Restore authorized PostgreSQL/SSH access so a native backup and direct catalog inspection can be completed.
2. Deploy the local environment-backed system-admin fix with `SYSTEM_SUPER_ADMIN_EMAIL` and `SYSTEM_SUPER_ADMIN_PASSWORD` configured securely.
3. Verify successful `developer@businz.com` login, JWT issuance, `/auth/me`, and employee-creation authorization before deleting any employee row.

No permanent deletion should be approved or attempted until all conditions are satisfied.
