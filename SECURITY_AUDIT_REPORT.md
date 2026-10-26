# 🛡️ BUSINZ HRMS — Comprehensive Application Security Audit Report

**Audit Date**: October 22, 2026  
**Auditor**: Senior Application Security Engineer & DevOps Security Specialist  
**Application**: BUSINZ Enterprise HRMS  
**Infrastructure**: Hostinger VPS Cloud (Ubuntu Linux, Docker Engine, Nginx)  
**Database**: Self-hosted PostgreSQL 16 (Migrated from Supabase)  
**Scope**: Full Stack (Frontend React 19, Backend Express/TypeScript, Database PostgreSQL 16, PostgREST Proxy, Nginx, Integrations, Docker)

---

## 1. Executive Summary

A comprehensive application security audit of the **BUSINZ Enterprise HRMS** platform was conducted across all 20 specified security domains. The assessment revealed several **Critical** architectural and access control vulnerabilities that require immediate remediation before production deployment.

### Key Risk Areas:
1. **Direct PostgREST Exposure & Plaintext Password Exposure**: The Nginx configuration exposes the database PostgREST service directly to the public internet (`/rest/v1/`) without authentication (`web_anon` role with disabled Row Level Security and `GRANT ALL PRIVILEGES`), allowing unauthenticated attackers to dump, modify, or drop the entire PostgreSQL database including employee salaries and plain passwords.
2. **Plaintext Password Storage & Client-Side Verification**: Employee passwords are saved in unhashed plaintext in PostgreSQL (`employees.password` and `company_settings.employee_profiles_data`), and the frontend service verifies passwords by fetching the plaintext password to the browser and running `cleanPass === dbPass`.
3. **Password Leakage in Employee API**: `mapDbRowToEmployee()` in `backend/src/repositories/employeeRepository.ts` includes the `password` field in `EmployeeRecord`, exposing password hashes and plaintext passwords in `GET /api/v1/employees` responses.
4. **Broken Object-Level Authorization (BOLA/IDOR)**: Normal employees can query other employees' payslips (`/api/v1/payroll/payslips/:id`), punch attendance on behalf of other staff, and submit leave under other employee IDs.
5. **Brute Force Rate-Limit Bypass**: `authRateLimiter` contains a bypass header check (`req.headers['x-internal-benchmark'] !== undefined`) allowing attackers to bypass login brute-force throttling.

---

## 2. Vulnerability Findings Matrix

| Security Area | Vulnerability | Severity | Affected Files | Recommended Fix | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Database & API Gateway** | PostgREST endpoint `/rest/v1/` exposed publicly without authentication via Nginx; RLS disabled and `GRANT ALL` on `web_anon`. | **Critical** | `frontend/nginx.conf`<br>`deploy/vps/nginx/rest-proxy.conf`<br>`deploy/vps/db/99-vps-access.sql`<br>`frontend/src/services/supabaseDirectService.ts` | Remove public `/rest/v1/` proxy pass from frontend Nginx. Route all database access exclusively through backend Express API. Re-enable RLS and revoke `web_anon` privileges. | Verified via static config & route inspection |
| **Cryptography & Storage** | Passwords stored in plaintext in `employees.password` and `company_settings.employee_profiles_data`. Frontend performs client-side password verification. | **Critical** | `backend/src/repositories/authRepository.ts`<br>`backend/src/repositories/employeeRepository.ts`<br>`frontend/src/services/supabaseDirectService.ts` | Enforce bcrypt hashing (salt rounds >= 10) on all passwords. Never store or sync plaintext passwords in `company_settings`. Remove client-side password comparison. | Verified via code audit |
| **Data Protection & PII** | Employee API returns `password` column in JSON responses for `GET /api/v1/employees` and `GET /api/v1/employees/:id`. | **Critical** | `backend/src/repositories/employeeRepository.ts`<br>`backend/src/controllers/employeeController.ts` | Strip `password` field completely from `EmployeeRecord` in `mapDbRowToEmployee()`. Never include passwords in employee read payloads. | Verified via code audit |
| **Object-Level Access (BOLA)** | Normal employees can fetch any employee's payslip and payroll records via `/api/v1/payroll/payslips/:id` and `/records` with no IDOR protection. | **Critical** | `backend/src/routes/payrollRoutes.ts`<br>`backend/src/controllers/payrollController.ts` | Apply `requirePermission('payroll', 'view')` and restrict regular employees strictly to `req.user.employeeId === requestedId`. | Verified via route & controller audit |
| **Authentication & Abuse** | Unauthenticated `/api/v1/employees/send-credentials` endpoint allows arbitrary email dispatch through company SMTP. | **High** | `backend/src/routes/employeeRoutes.ts`<br>`backend/src/controllers/employeeController.ts` | Move route below `authenticateToken` and require `requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin'])`. | Verified via route middleware audit |
| **Brute Force & Throttling** | `authRateLimiter` can be completely bypassed by sending any `x-internal-benchmark` header. | **High** | `backend/src/middleware/rateLimiter.ts` | Remove header bypass from production `authRateLimiter`. Restrict skip conditions strictly to automated test runners. | Verified via middleware audit |
| **Session Management** | Excessive JWT expiration (7 days) without server-side token revocation, blacklisting, or logout endpoint. | **High** | `backend/src/repositories/authRepository.ts`<br>`backend/src/routes/authRoutes.ts` | Reduce access token TTL to 15-30 minutes with secure HTTP-only refresh tokens. Implement `/api/v1/auth/logout` endpoint. | Verified via auth audit |
| **Object-Level Access (BOLA)** | Normal employees can punch attendance or submit leave on behalf of other employees by altering `employeeId` in payload. | **High** | `backend/src/controllers/attendanceController.ts`<br>`backend/src/controllers/leaveController.ts` | Enforce that `validated.employeeId === req.user.employeeId` unless user possesses HR or Managerial delegation permissions. | Verified via controller audit |
| **RBAC & Authorization** | WhatsApp CRM endpoints (`/broadcasts`, `/messages`, `/templates`) have no role checks, allowing any employee to send mass messages or delete contacts. | **High** | `backend/src/routes/crmRoutes.ts`<br>`backend/src/routes/whatsappRoutes.ts` | Add RBAC middleware (`requirePermission('customer_data', ...)` and `requireRoles`) to all CRM routes. | Verified via route audit |
| **Network Security** | PostgreSQL port 5432 bound to public VPS IP with `DATABASE_SSL=false`, transmitting database credentials and data in cleartext. | **High** | `backend/.env`<br>VPS Host configuration | Bind PostgreSQL to `127.0.0.1` or internal Docker bridge network only. Enable SSL (`DATABASE_SSL=true`) for any remote connections. | Verified via `.env` inspection |
| **Multi-Tenancy** | Tenant company isolation bypassable via `companyId` query parameter in CRM, Customer, and Payroll routes. | **High** | `backend/src/controllers/customerController.ts`<br>`backend/src/controllers/crmController.ts`<br>`backend/src/controllers/payrollController.ts` | Enforce tenant scoping from `req.user.company_id` for non-Super-Admin roles. Reject arbitrary `req.query.companyId`. | Verified via controller audit |
| **CORS Configuration** | Wildcard `*` in `CORS_ORIGINS` alongside `credentials: true` and unchecked `*.vercel.app` origin allowance. | **Medium** | `backend/src/config/env.ts`<br>`backend/src/app.ts` | Restrict allowed origins strictly to production domain (`https://hrms.businz.com`) and local development origins in non-production. | Verified via env & app audit |
| **Client-Side Secrets** | Google Gemini AI key stored in browser `localStorage` and called directly from client, vulnerable to XSS exfiltration. | **Medium** | `frontend/src/services/geminiApiService.ts` | Proxy all Gemini AI calls through backend `/api/v1/ai` endpoints. Remove Gemini API key from browser `localStorage`. | Verified via service audit |
| **HTTP Security Headers** | Frontend Nginx reverse proxy missing `X-Frame-Options`, `X-Content-Type-Options`, HSTS, and Referrer-Policy headers. | **Medium** | `frontend/nginx.conf` | Add security headers (`X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Strict-Transport-Security`, `Content-Security-Policy`). | Verified via Nginx audit |
| **Dependency Vulnerabilities** | Outdated packages with known CVEs (`proxy-addr` critical IP spoofing, `tinypool` prototype pollution, `xlsx` ReDoS). | **Medium** | `backend/package.json`<br>`frontend/package.json` | Run `npm audit fix` and pin safe dependency versions (`proxy-addr >= 2.0.7`, `xlsx` alternatives). | Verified via `npm audit` scan |
| **Resource Exhaustion (DoS)** | Excessive `50mb` JSON request body limit on general API endpoints. | **Medium** | `backend/src/app.ts`<br>`frontend/nginx.conf` | Reduce default express JSON limit to `2mb`. Provide dedicated higher limit only on specific document upload routes. | Verified via middleware audit |
| **Credential Management** | Predictable default password for System Super Admin (`developer@2026`) in configuration. | **Low** | `backend/.env` | Enforce complex, randomly generated password for Super Admin and rotate immediately. | Verified via `.env` inspection |
| **Legacy Architecture** | Discontinued Supabase packages and client wrappers still present in active runtime codebase. | **Informational** | `frontend/src/services/supabaseDirectService.ts`<br>`backend/src/config/supabase.ts` | Refactor remaining frontend direct calls to use backend Express REST API. Deprecate `supabaseDirectService.ts`. | Verified via code search |

---

## 3. Deep-Dive Analysis of Critical Findings

### Finding 1: Unauthenticated Database Access via Public PostgREST (CRITICAL)
- **Vulnerability**: In `frontend/nginx.conf`, the block:
  ```nginx
  location /rest/v1/ {
    proxy_pass http://rest-proxy:3001/rest/v1/;
  }
  ```
  routes traffic directly to `rest-proxy:3001`, which proxies to PostgREST and **strips the Authorization header** (`proxy_set_header Authorization "";`).
- **Impact**: In `deploy/vps/db/99-vps-access.sql`, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` was executed on all tables, and `GRANT ALL PRIVILEGES` was given to `web_anon`. Consequently, **any unauthenticated person on the internet** can send standard PostgREST requests:
  - `GET /rest/v1/employees` (Dumps all employee personal data, salaries, bank accounts, and passwords)
  - `DELETE /rest/v1/employees` (Wipes the entire workforce database)
  - `PATCH /rest/v1/employees?id=eq.<id>` (Overwrites any user's credentials)
- **Remediation**:
  1. Remove `location /rest/v1/` from `frontend/nginx.conf`. PostgREST must never be directly exposed to the public internet.
  2. All database interactions from the frontend must go through the authenticated Node.js backend (`/api/v1/...`).
  3. Re-enable Row Level Security (RLS) on all PostgreSQL tables.
  4. Revoke `ALL PRIVILEGES` from `web_anon`.

---

### Finding 2: Plaintext Password Storage and Client-Side Auth (CRITICAL)
- **Vulnerability**:
  In `frontend/src/services/supabaseDirectService.ts` (lines 246–268):
  ```typescript
  const res = await fetch(`${DATABASE_REST_URL}/rest/v1/employees?${filter}&select=*&limit=1`, ...);
  const user = rows[0];
  const isPasswordValid = cleanPass === dbPass;
  ```
  The browser downloads the employee's password from the database and checks equality in client JavaScript!
  Furthermore, in `backend/src/repositories/authRepository.ts` (line 244):
  ```typescript
  await query(
    `UPDATE employees SET password = $1, must_change_password = FALSE, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
    [newPassword, user.email]
  );
  ```
  The backend saves the raw, unhashed `newPassword` into `employees.password` and mirrors it to `company_settings.employee_profiles_data`.
- **Impact**: Compromise of the database or any employee viewing API network traffic instantly yields plaintext passwords for all users.
- **Remediation**:
  1. Always store `bcrypt.hash(password, 10)` in `employees.password`.
  2. Deprecate and remove plaintext password storage in `company_settings`.
  3. Ensure all authentication takes place on the backend via `/api/v1/auth/login`.

---

### Finding 3: Password Exposure in Employee API (CRITICAL)
- **Vulnerability**:
  In `backend/src/repositories/employeeRepository.ts` (line 93):
  ```typescript
  function mapDbRowToEmployee(data: any): EmployeeRecord {
    return {
      ...
      password: data.password || undefined,
      ...
    };
  }
  ```
  When `GET /api/v1/employees` or `GET /api/v1/employees/:id` is called, `password` is returned in the JSON response payload.
- **Impact**: Any user with permission to view employee profiles (such as managers or staff in departmental views) receives passwords/hashes over HTTP.
- **Remediation**:
  Remove `password` from `mapDbRowToEmployee()`. Passwords should never be part of the `EmployeeRecord` domain model.

---

### Finding 4: Broken Object-Level Authorization (BOLA/IDOR) on Payslips & Payroll (CRITICAL)
- **Vulnerability**:
  In `backend/src/routes/payrollRoutes.ts`:
  ```typescript
  payrollRouter.get('/records', (req, res, next) => payrollController.getRecords(req, res, next));
  payrollRouter.get('/payslips/:id', (req, res, next) => payrollController.getPayslip(req, res, next));
  payrollRouter.get('/employees/:employeeId/payslips', (req, res, next) => payrollController.getPayslip(req, res, next));
  ```
  In `backend/src/controllers/payrollController.ts`:
  `getPayslip()` does not check if `req.user.employeeId === requestedId` or whether the user has financial administrator privileges.
- **Impact**: A regular employee with ID `EMP-005` can request `/api/v1/payroll/payslips/EMP-001` or `/api/v1/payroll/records` and inspect the CEO's and all other employees' full compensation, tax, and deduction data.
- **Remediation**:
  Verify in `getPayslip()` that if `req.user.role === 'Employee'`, `req.user.employeeId` MUST match the requested employee ID. Block non-admins from accessing `/api/v1/payroll/records`.

---

## 4. Remediation Plan

We will proceed with phased, safe remediations on a dedicated Git branch:

1. **Phase 1: Critical API & Model Fixes**:
   - Strip `password` from `mapDbRowToEmployee()` in `backend/src/repositories/employeeRepository.ts`.
   - Protect `/api/v1/employees/send-credentials` with authentication & HR/Admin RBAC.
   - Enforce BOLA authorization on `/api/v1/payroll/payslips/:id` and `/records`.
   - Remove rate-limiter bypass header from `authRateLimiter`.
   - Prevent attendance and leave employee impersonation in `attendanceController.ts` and `leaveController.ts`.
   - Add RBAC to WhatsApp CRM routes in `crmRoutes.ts` and `whatsappRoutes.ts`.
2. **Phase 2: Password Hashing Enforcement**:
   - Ensure all password updates in `authRepository.ts` save only bcrypt hashes.
   - Remove plaintext password syncing to `company_settings`.
3. **Phase 3: Gateway & Nginx Hardening**:
   - Block public access to `/rest/v1/` on Nginx.
   - Add HTTP security headers to `frontend/nginx.conf`.
4. **Phase 4: Verification & Regression Testing**:
   - Run backend typechecks and existing Vitest & script test suites to ensure zero functionality breakage.
