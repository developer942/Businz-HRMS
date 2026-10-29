# BUSINZ HRMS – Asset Serial Number Persistence Fix Report

**Date:** 29 Oct 2026  **Scope:** hrms.businz.com Asset Management only (CRM untouched)
**Status:** Root cause confirmed and fixed in the local development workspace. Production was only read (SELECTs, plus one fully rolled-back test transaction). **Not deployed.** **No production records were modified.**

---

## 1. Confirmed root cause (category C: values were overwritten in PostgreSQL)

Assets are written from the browser straight to PostgREST (`/rest/v1/assets`) via
`frontend/src/services/supabaseDirectService.ts → updateAsset()`. There is no backend asset API.

`updateAsset()` "normalised" seven nullable columns with this rule:

```ts
if (payload[k] === '' || payload[k] === undefined) payload[k] = null;
```

`undefined` means *not sent*. The **Assign** and **Return** actions send only
`{ assigned_employee_id, status, assigned_date }`, so every assignment PATCH became:

```
assigned_employee_id = <emp>, status = 'Assigned', assigned_date = <today>,
serial_number = NULL, purchase_date = NULL, warranty_expiry = NULL,
notes = NULL, assigned_department_id = NULL
```

**Why it looked as if it "disappeared after assignment":** the screen kept the old in-memory value until the next refresh or login reloaded the row from PostgreSQL, and by then the value had already been NULLed.

**Reproduced on the real production schema** (inside a transaction that was rolled back):

| Step | serial_number | purchase_date | warranty_expiry | notes |
|---|---|---|---|---|
| After CREATE | SN-REAL-ABC123 | 2026-10-29 | 2027-10-29 | dry run |
| After ASSIGN with the **old** PATCH body | **NULL** | **NULL** | **NULL** | **NULL** |
| After ASSIGN with the **new** PATCH body | SN-REAL-ABC123 | 2026-10-29 | 2027-10-29 | dry run |

### Secondary defects found
1. **Invented serial numbers:** Create Asset saved a random `SN-######` whenever the field was left empty (`AssetManagement.tsx`).
2. **Misleading "Verified S/N" caption:** it was hard-coded under every serial, including empty ones. No verification feature exists.
3. **Silent failures:** assign, return and edit were fire-and-forget. A failed PATCH still showed success until refresh, and the API response was never applied.

## 2. Fixes (local only)

| File | Change |
|---|---|
| `frontend/src/services/supabaseDirectService.ts` | New `buildAssetPatchPayload()`: **only keys the caller provides are written**; an explicit `''` still becomes NULL. New `updateAssetReturning()` returns the row PostgreSQL stored, or `null` (also when 0 rows matched). `updateAsset()` delegates to it. |
| `frontend/src/context/HRMSContext.tsx` | `assignAsset` (assign / return) and `updateAsset` (edit) use `persistAssetPatch()`. It applies the **authoritative DB row** after the save; if the save fails, it **restores the previous state** and shows an "Asset change not saved" notification. |
| `frontend/src/components/assets/AssetManagement.tsx` | No invented serials (`addForm.serialNumber.trim()`). The table, mobile card and details modal show the stored serial or **"Not Provided"**. The fake "Verified S/N" caption is removed. |
| `deploy/vps/db/45-asset-audit-trail.sql` (**new, not applied**) | Append-only `asset_audit_logs` plus trigger `trg_asset_audit`. Records CREATED, ASSIGNED, RETURNED, REASSIGNED, SERIAL_CHANGED and DETAILS_CHANGED, with old/new serial, employee, status, changed columns and PostgREST JWT claims. As a DB trigger it covers every write path. |
| `backend/tests/assetSerialNumberPersistence.test.ts` (**new**) | Payload regression tests. |

Not changed: asset tag, name, brand/model, category, purchase or warranty logic, documents, or assignment history semantics. No backend API was modified, because none exists for assets.

**PostgreSQL tables affected:** `public.assets` (write pattern only, no schema change). `public.asset_audit_logs` is new and will be created only when migration 45 is approved.

## 3. Lifecycle verification on the production schema (rolled back)

Create → Assign → Return → Reassign → Reassign → unrelated edit → authorized serial edit:

| Step | serial_number | Audit action |
|---|---|---|
| Create | SN-REAL-ABC123 | CREATED |
| Assign | SN-REAL-ABC123 ✅ | ASSIGNED |
| Return | SN-REAL-ABC123 ✅ | RETURNED |
| Reassign | SN-REAL-ABC123 ✅ | ASSIGNED / REASSIGNED |
| Edit notes only | SN-REAL-ABC123 ✅ | DETAILS_CHANGED `{notes}` |
| Authorized serial edit | SN-REAL-ABC124 | SERIAL_CHANGED (old → new recorded) |

Purchase date, warranty and notes were also preserved at every step. After `ROLLBACK`, the dry-run asset count was 0 and `asset_audit_logs` did not exist, so production is unchanged.

## 4. Existing affected records (read-only analysis, 34 assets)

| Status | Total | NULL serial | NULL purchase date | NULL warranty | NULL notes |
|---|---|---|---|---|---|
| Assigned | 32 | **14** | 19 | 32 | 14 |
| Available | 2 | 0 | 1 | 2 | 0 |

**14 assigned assets have no serial number:** AST-240, AST-537, AST-159, AST-657, AST-963, AST-805, AST-212, AST-790, AST-801, AST-424, AST-183, AST-619, AST-474 and AST-516, all assigned on 29 Oct. Before this fix, the Create form never saved an empty serial (it substituted a random `SN-######`). **Every one of these 14 rows therefore had a value at creation that was later wiped.** Some originals may have been real serials, others the random placeholder; that can't be determined now.

The other 18 assigned assets kept their serials because they were assigned through the **Edit** form (which re-sends every field) or at creation.

**Recovery sources checked (none can restore the values):**
- PostgreSQL `log_statement = none`, so no SQL values are logged.
- PostgREST and proxy access logs record only method, URL and response size, not values.
- `company_settings.assets_data` is empty (`[]`).
- The only server backup (`/opt/businz-hrms/backups/…20261021…`) predates every asset (created 26–29 Oct).

**Recovery plan (needs approval, no automatic restore):** IT/HR re-enters the serial printed on each physical device or its purchase invoice, using **Edit Asset**. Once migration 45 is applied, each correction is recorded as SERIAL_CHANGED. Warranty and purchase dates that were wiped need the same manual re-entry from invoices. No serial numbers will be generated.

## 5. Tests
- `assetSerialNumberPersistence.test.ts`: 4 tests. Assignment and return payloads contain only assignment columns; `undefined` is omitted; `''` becomes NULL; an edit keeps the entered serial.
- Regression run alongside: attendance/GPS, profile save, SQL parameter integrity, face verification, shift engine. **43 / 43 tests pass.** Frontend `tsc -b && vite build`: **pass** (2.09 s).
- **Desktop, Android Chrome and iPhone Safari UI testing has not been done.** The data path is the same shared context and service for desktop and mobile views, and has been verified at the database level above. Device testing is pending after deployment.
- **Concurrent updates:** each PATCH now carries only the columns its action owns, so an assignment can no longer overwrite a concurrent detail edit. There is no row-version check on assets yet.

## 6. Security finding (reported, not changed)
`deploy/vps/db/99-vps-access.sql` grants `ALL PRIVILEGES ON ALL TABLES` to `anon`, `web_anon` and `authenticated`. Role-based restrictions on asset editing are therefore enforced only in the UI, not in the database. I recommend moving asset writes behind an authorized backend API or adding RLS policies. This needs a separate, planned change.

## 7. Production deployment readiness
**Ready for review.** Steps once approved:
1. `pg_dump` backup of `businz_hrms`.
2. Apply `45-asset-audit-trail.sql` (idempotent; dry-run verified on the production schema).
3. Rebuild **only** `businz_hrms_frontend` (the fix is frontend-only; no backend change).
4. Smoke test: create an asset with a serial, assign, refresh, return, reassign. Check `public.assets` and `public.asset_audit_logs` after each step on desktop, Android and iPhone.
5. HR re-enters the 14 missing serials from devices or invoices.

