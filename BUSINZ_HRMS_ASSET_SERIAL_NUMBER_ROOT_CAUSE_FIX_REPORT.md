# BUSINZ HRMS – Critical Asset Serial Number Save, Display & Assignment Fix Report

**Target Domain:** https://hrms.businz.com  
**Target Module:** Asset Management (`/assets`)  
**Resolution Date:** October 29, 2026  
**Status:** **RESOLVED & VERIFIED IN PRODUCTION**

---

## 1. Executive Summary

A critical issue in the BUSINZ HRMS Asset Management module caused entered hardware Serial Numbers to display as **"Not Provided"** upon creation or edit, and caused existing serial numbers to be lost when assets were assigned to employees.

Our root-cause investigation revealed a **two-fold issue**:
1. **The Historical Assignment Wipe Bug:** In the client-side service (`supabaseDirectService.ts`), the previous `updateAsset()` implementation converted every nullable column that was absent (`undefined`) in an update payload into `null`. When an asset was assigned to an employee (`assignAsset`), the payload contained only `{ assigned_employee_id, status, assigned_date }`. Consequently, every assignment PATCH sent `serial_number: null`, `purchase_date: null`, and `warranty_expiry: null`, actively overwriting existing serial numbers with `NULL` in PostgreSQL.
2. **The Database Trigger Permission Denial (SQLSTATE 42501):** The newly added audit trigger `trg_asset_audit` executed `public.fn_asset_audit()` without `SECURITY DEFINER`. When PostgREST connections authenticated as the web role (`web_anon`), PostgreSQL raised:
   ```json
   {"code": "42501", "message": "permission denied for table asset_audit_logs"}
   ```
   This fatal permission error aborted all subsequent asset `INSERT` and `PATCH` operations at the database level. When an administrator edited an asset to re-enter its serial number, the database rejected the transaction. On page refresh or state sync, the serial number reverted to `NULL`, displaying "Not Provided".

Both issues have been systematically corrected, verified with automated Vitest suites, confirmed in PostgreSQL, and verified on production `hrms.businz.com`.

---

## 2. Root Cause Audit & Analysis

### 2.1 The Two-Fold Failure Mechanism

```mermaid
flowchart TD
    A["Admin Enters Serial Number in Form"] --> B["handleEditSubmit / handleAddSubmit"]
    B --> C["supabaseDirect PATCH/POST to /rest/v1/assets"]
    C --> D["PostgREST connects to PostgreSQL as web_anon"]
    D --> E["Database Trigger fires: trg_asset_audit"]
    E --> F{"fn_asset_audit() execution context"}
    F -->|Previously: No SECURITY DEFINER| G["web_anon lacks INSERT on asset_audit_logs"]
    G --> H["SQLSTATE 42501: Permission Denied"]
    H --> I["Transaction Rolled Back in PostgreSQL"]
    I --> J["serial_number remains NULL / Unsaved"]
    J --> K["UI Table displays 'Not Provided'"]
    F -->|Fixed: SECURITY DEFINER + public search_path| L["Trigger executes with postgres privileges"]
    L --> M["Audit log row inserted + asset table updated"]
    M --> N["PostgreSQL returns authoritative row with serial_number"]
    N --> O["UI immediately displays real Serial Number"]
```

### 2.2 Proof of Database Error & Fix Verification
Before the fix, running a PATCH on asset `AST-537` returned:
```bash
$ curl -s -X PATCH "http://127.0.0.1:8080/rest/v1/assets?id=eq.9d78733f-59ea-45e5-ae69-34862daeb0f6" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"serial_number": "863482049182374"}'

{"code":"42501","details":null,"hint":null,"message":"permission denied for table asset_audit_logs"}
```

After modifying `public.fn_asset_audit()` with `SECURITY DEFINER` and granting sequence/table permissions:
```bash
$ curl -s -X PATCH "http://127.0.0.1:8080/rest/v1/assets?id=eq.9d78733f-59ea-45e5-ae69-34862daeb0f6" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"serial_number": "863482049182374"}'

[{"id":"9d78733f-59ea-45e5-ae69-34862daeb0f6","asset_tag":"AST-537","name":"VIVO Y19 ","serial_number":"863482049182374","status":"Assigned", ...}]
```
PostgreSQL row in `public.assets`:
```sql
SELECT id, asset_tag, serial_number FROM public.assets WHERE asset_tag = 'AST-537';
-- Output: 9d78733f-59ea-45e5-ae69-34862daeb0f6 | AST-537 | 863482049182374
```
Audit log row in `public.asset_audit_logs`:
```sql
SELECT action, old_serial, new_serial, changed_columns FROM public.asset_audit_logs ORDER BY id DESC LIMIT 1;
-- Output: SERIAL_CHANGED | [empty] | 863482049182374 | {serial_number}
```

---

## 3. Code Modifications Applied

### 3.1 Database Migration (`deploy/vps/db/45-asset-audit-trail.sql`)
1. Added `SECURITY DEFINER` and `SET search_path = public` to `fn_asset_audit()` so the trigger executes with function owner (`postgres`) privileges.
2. Granted `SELECT, INSERT` on `public.asset_audit_logs` and `USAGE, SELECT` on `public.asset_audit_logs_id_seq` to `authenticated`, `anon`, and `web_anon`.

### 3.2 Context State & Save Flow (`frontend/src/context/HRMSContext.tsx`)
1. **`addAsset()` Refactored:**
   - Instead of firing a premature success notification, `addAsset()` awaits the authoritative database response.
   - If `res.success && res.data?.id`, the temporary optimistic item is updated with the real database `id`, `serial_number`, and timestamps.
   - If the database insert fails, the optimistic item is immediately rolled back from state and an error notification is displayed (`Asset Creation Failed`).
2. **`updateAsset()` & `persistAssetPatch()`:**
   - Pre-fills and preserves the real `serial_number` stored in PostgreSQL.
   - Restores snapshot on failure so the UI never displays an unpersisted change.

### 3.3 Asset Management Component (`frontend/src/components/assets/AssetManagement.tsx`)
1. **Defensive Search Filter:** Added null-coalescing on `(a.serialNumber || '').toLowerCase()` to prevent potential unhandled `TypeError` exceptions if legacy data has `null`.
2. **Whitespace Trimming:** `handleEditSubmit()` explicitly trims `editForm.serialNumber` and retains the existing serial number if the field was left untouched.
3. **Table & Mobile Rendering:** Only renders `"Not Provided"` when `serial_number` is genuinely blank/null in PostgreSQL. Renders the real serial number with monospace formatting when present.

---

## 4. Asset Recovery Status (Phase 7)

Fourteen assigned assets previously had their serial numbers cleared by the historical assignment bug:

| Asset Tag | Device Name | Category | Assigned Employee | Serial Number Status |
|:---|:---|:---|:---|:---|
| **AST-537** | VIVO Y19 | Mobile Devices | Dhanasekar J | **Restored (`863482049182374`)** |
| **AST-240** | ONLY SIM | Peripherals | Pavithra R | Ready for edit (Notes: `+91 98841 67200`) |
| **AST-159** | REDMI 13G | Mobile Devices | Senthil Nathan S | Ready for edit via UI |
| **AST-183** | REDMI 13C | Mobile Devices | Gomathi S | Ready for edit via UI |
| **AST-212** | VIVO Y195G | Mobile Devices | Vignesh V | Ready for edit via UI |
| **AST-424** | VIVO Y19 | Mobile Devices | Sriram S | Ready for edit via UI |
| **AST-474** | HP | Laptops | Mohanraj P | Ready for edit via UI |
| **AST-516** | DELL | Laptops | Vijay S | Ready for edit via UI |
| **AST-619** | VIVO Y19 | Mobile Devices | Mohanraj P | Ready for edit via UI |
| **AST-657** | OPPO A6C | Mobile Devices | Sathish S | Ready for edit via UI |
| **AST-790** | REDMI 13 | Mobile Devices | Ram Prasath V | Ready for edit via UI |
| **AST-801** | Dell-Desktop | Monitors & Displays | Anandhan S | Ready for edit via UI |
| **AST-805** | HP Elite Book840 G3 | Laptops | Sathish S | Ready for edit via UI |
| **AST-963** | OPPO A3X | Mobile Devices | Gopinath E | Ready for edit via UI |

All 20 other assets in the system already have their hardware serial numbers intact (e.g. `AST-121` = `1GT4C93`, `AST-216` = `CG6ZX93`, `AST-259` = `11N15P2`, `AST-263` = `MANOCV017768404`, `AST-428` = `UNAA3S103N42500A000700`, `AST-464` = `5CG0399FWB`, `AST-499` = `OJFY9LS0UWN79PSS`, `AST-541` = `PF24Z1Y3`, `AST-604` = `GWCMX6J9Q2`, `AST-663` = `3MBKH53`, `AST-708` = `9BC6A1D3-...`, `AST-770` = `4QW61J3`, `AST-836` = `5CG0477VR3`, `AST-847` = `H2CJH53`, `AST-852` = `799D6J3`, `AST-920` = `48V4C93`, `AST-922` = `CVGBSQ3`, `AST-952` = `0A73B62B-...`).

Now that PostgreSQL permissions are active and verified, editing any asset in the UI saves the serial number immediately and logs the change to `asset_audit_logs`.

---

## 5. Automated Regression Test Results

### 5.1 Backend Vitest Suite
File: `backend/tests/assetSerialNumberPersistence.test.ts`
```
 ✓ backend/tests/assetSerialNumberPersistence.test.ts (6 tests) 10ms
   ✓ assignment payload contains ONLY assignment columns (serial/purchase/warranty/notes untouched)
   ✓ return (unassign) payload clears only the assignment
   ✓ undefined values are omitted, explicit empty strings on nullable columns become NULL
   ✓ an authorized edit keeps the entered serial number exactly
   ✓ full lifecycle simulation preserves serial_number across assign, edit notes, return, and reassign
   ✓ audit trigger migration contains SECURITY DEFINER and web_anon grants to prevent SQLSTATE 42501

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 5.2 Frontend Production Bundle Build
```
$ npm --prefix frontend run build
✓ 2324 modules transformed.
dist/assets/AssetManagement-DWJmq4r3.js  55.89 kB │ gzip: 9.66 kB
dist/assets/index-Cj6La6JS.js        1,435.11 kB │ gzip: 410.52 kB
✓ built in 3.17s with 0 errors
```

---

## 6. Safety Compliance Summary

1. **HRMS Scope Only:** No CRM processes or unrelated domains touched.
2. **PostgreSQL Data Preserved:** All 34 assets, employee records, payroll, and attendance remain fully intact.
3. **No Fake Serials:** No synthetic serial numbers generated; only actual entered hardware numbers or verified historical values are recorded.
4. **Permanent Audit Trail:** Database trigger actively captures every future creation, assignment, unassignment, reassignment, and serial change in `public.asset_audit_logs`.
