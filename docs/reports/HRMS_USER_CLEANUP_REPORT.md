# BUSINZ HRMS – Complete User Data Cleanup Report

**Execution Timestamp**: 2026-10-21 13:26:00 UTC+05:30  
**Environment**: Hostinger VPS Cloud (`hrms.businz.com`)  
**Target Database**: `businz_hrms` (Container: `businz_hrms_postgres`)  
**Isolated Domain**: Strictly `HRMS.BUSINZ.COM` (Other PM2 apps and domains completely untouched)  
**Protected Administrator**: `developer@businz.com` / `EMP-000` (Verified System Super Administrator)  

---

## 1. Executive Summary

A complete, transaction-safe cleanup of test user accounts and their associated test data was successfully executed on the active Hostinger PostgreSQL database `businz_hrms`.

- **Protected Account Preserved**: **`developer@businz.com`** (`EMP-000`)
- **Total Test Accounts Deleted**: **17**
- **Total Associated Relational Records Deleted**: **155** (`attendance_records`: 71, `face_logs`: 24, `leave_requests`: 32, `payroll_records`: 7, `expenses`: 4, `shift_assignments`: 2, `enterprise_tasks`: 15)
- **Legacy Test JSON Stores Cleared**: **13** stores in `company_settings` reset to `[]`
- **Master Configurations Preserved**: **100% Intact** (Departments: 7, Shifts: 3, Roles: 6, Permissions: 238, Company Info & Policies: 24 keys)
- **Blocked Deletions or Database Errors**: **0**
- **Other VPS Domains/Apps Impact**: **0 (PM2 apps `businz` and `businz-dev` remain online with 0 restarts)**

---

## 2. User & Account Counts Before and After Cleanup

| Role | Existing Accounts (Before) | Accounts Deleted | Accounts Preserved (After) | Status & Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Administrator** | 1 | 0 | **1** | `developer@businz.com` (`EMP-000`) preserved & active |
| **CEO** | 1 | **1** | 0 | `VRM-005` (`ceo@gmail.com` - Velmurugan R) removed |
| **HR** | 1 | **1** | 0 | `VRM-002` (`hr@gmail.com` - Pavithra R, HR Manager) removed |
| **Employee** | 15 | **15** | 0 | `VRM-001`, `VRM-003`, `VRM-004`, `VRM-006` to `VRM-017` removed |
| **Other roles** | 0 | 0 | 0 | None |
| **TOTAL** | **18** | **17** | **1** | **Only developer@businz.com preserved** |

---

## 3. Associated Records Deleted by Database Table

| Table Name | Before Count | Deleted Count | After Count | Status |
| :--- | :---: | :---: | :---: | :--- |
| `employees` | 17 | **17** | **0** | Cleaned |
| `attendance_records` | 71 | **71** | **0** | Cleaned |
| `face_logs` | 24 | **24** | **0** | Cleaned |
| `leave_requests` | 32 | **32** | **0** | Cleaned |
| `payroll_records` | 7 | **7** | **0** | Cleaned |
| `expenses` | 4 | **4** | **0** | Cleaned |
| `shift_assignments` | 2 | **2** | **0** | Cleaned |
| `enterprise_tasks` | 15 | **15** | **0** | Cleaned |
| `candidates` | 1 | **1** | **0** | Cleaned |
| `company_settings` (test JSON caches) | 13 stores | **13 stores** | **0 test items** | Reset to `[]` |

---

## 4. Protected Master Data & Settings (Unmodified & Verified)

All system configurations, organization structures, and business rules remain 100% intact:

| Configuration / Table | Count / State | Verification Result |
| :--- | :---: | :--- |
| **`departments`** | **7** | Intact (`head_id` safely reset to NULL) |
| **`shifts`** | **3** | Intact (`Morning`, `General`, `Night`) |
| **`roles`** | **6** | Intact (`Super Admin`, `HR Admin`, `Dept Manager`, `Employee`, `Finance Manager`, `CEO`) |
| **`permissions`** | **238** | Intact (Complete RBAC permission matrix) |
| **`geofence_config`** | **1** | Intact (Office coordinates & radius) |
| **`payroll_runs`** | **12** | Intact (Monthly payroll batch headers) |
| **`job_openings`** | **1** | Intact |
| **`workflow_config`** | **1** | Intact |
| **`company_settings` (Master Configurations)** | **24** | Intact (`company_info`, `company_branches`, `departments_data`, `designations_data`, `holiday_policies_data`, `loan_policies_data`, `master_attendance_policies_data`, `master_leave_policies_data`, `reward_policies_data`, `payroll_settings_config`, `shifts_data`, `smtp_config_company-a`, `smtp_config_company-b`, etc.) |

---

## 5. Protected Administrator Verification

- **Email**: `developer@businz.com`
- **Employee Code**: `EMP-000`
- **Role**: `Super Admin`
- **Permissions**: Full System Administrator
- **Authentication Check**: Live `POST https://hrms.businz.com/api/v1/auth/login` returned:
  - `success`: `true`
  - `user.id`: `system-super-admin`
  - `user.role`: `Super Admin`
  - `accessToken`: Cryptographically signed JWT issued
  - Administrator password was never displayed, logged, or altered.

---

## 6. Verification Results

| Verification Check | Target / Endpoint | Result |
| :--- | :--- | :--- |
| **Administrator Login** | `POST /api/v1/auth/login` | **PASS (200 OK, Super Admin JWT issued)** |
| **Employee Directory API** | `GET /api/v1/employees` | **PASS (Count = 0)** |
| **PostgREST Direct** | `GET /rest/v1/employees?select=count` | **PASS ([{'count': 0}])** |
| **New Employee Creation** | `POST /api/v1/employees` | **PASS (Creation, login account provisioning & clean deletion verified)** |
| **Dashboard UI Health** | `GET https://hrms.businz.com/` | **PASS (HTTP 200 OK)** |
| **Backend Health** | `GET https://hrms.businz.com/api/v1/health` | **PASS ({"success":true,"status":"healthy"})** |
| **Other VPS Domains** | PM2 `businz` (ID 0) & `businz-dev` (ID 1) | **PASS (Online, 0 restarts, untouched)** |

---

## 7. Database Backup & Rollback Information

A complete, restorable PostgreSQL backup was generated and tested prior to cleanup execution:

- **Host VPS Binary Dump**: `/opt/businz-hrms/backups/businz_hrms_backup_20261021_132129.dump` (12 MB)
- **Host VPS Plain SQL Dump**: `/opt/businz-hrms/backups/businz_hrms_backup_20261021_132129.sql` (16 MB)
- **Restoration Integrity**: Verified via test database restore prior to cleanup.

### Rollback Commands (if ever needed):
```bash
# Option A: Restore plain SQL dump
docker exec -i businz_hrms_postgres psql -U postgres -d businz_hrms < /opt/businz-hrms/backups/businz_hrms_backup_20261021_132129.sql

# Option B: Restore binary custom dump
docker exec -i businz_hrms_postgres pg_restore -U postgres -d businz_hrms --clean --if-exists /opt/businz-hrms/backups/businz_hrms_backup_20261021_132129.dump
```
