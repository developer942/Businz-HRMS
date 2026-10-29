# BUSINZ HRMS – Production Face Attendance & GPS Root-Cause Report

**Date:** 29 Oct 2026  **Scope:** hrms.businz.com only (BUSINZ CRM / PM2 `businz`, `businz-dev` not inspected or touched)
**Status:** Root causes identified, fixes made in the local development workspace and covered by tests. **Not deployed.** Waiting for administrator decisions (§4) and approval to deploy.

---

## 1. Live production version (read-only audit)

| Item | Finding |
|---|---|
| Repo / path | `/opt/businz-hrms` (Docker Compose in `deploy/vps`) |
| Deployed commit | `2aa9c62` (29 Oct 14:46 IST) |
| Earlier "fast attendance" commit `4afd517` | **Deployed** (it is an ancestor of `2aa9c62`) |
| Containers | `businz_hrms_frontend`, `businz_hrms_backend` rebuilt 29 Oct 09:19 UTC; Postgres up 11 days |
| Live bundle | `FaceAttendance-BPoZA9f1.js` contains the optimized GPS service (`enableHighAccuracy:true`, `maximumAge:0`, `timeoutMs:12e3`) |
| Old bundle / PWA cache | **Not the cause.** No service worker; `index.html` is served `Cache-Control: no-cache, no-store` |
| Untracked files on server | `/opt/businz-hrms/assets/index-tLI7023E.js` and others, plus `backups/` and `cleanup_plan.sql`. Leftovers, not served (nginx proxies to the container) |

**Conclusion:** the earlier optimization is live. The problems persist because it did not address the real causes (§2). Its "14/14 tests passed" only covered an easy 48 m indoor fix and never the ~100 m indoor accuracy that production phones actually report.

## 2. Confirmed failure causes

### RC-1: Indoor punches waited the full 12-second GPS timeout (slow attendance)
`gpsAcquisitionService.ts` only "fast-settles" a reading that is already INSIDE the geofence when accuracy ≤ 95 m. Any reading with worse accuracy waited the full 12 s window, **even when it was already conclusively inside** (the whole accuracy circle lies within the radius).
**Production evidence:** today's successful punches reported **±99 m and ±102 m** accuracy (`attendance_punch_events`). Both qualify as INSIDE (D + A = 190 m ≤ 250 m), but the code waited about 12 s for each.
**Fix:** settle within 1.2 s once a reading is conclusively INSIDE, regardless of accuracy. The INSIDE rule (D + A ≤ R) is unchanged, so no reading is accepted that was not accepted before.

### RC-2: An uncertain position cost a second 12 s window (24 s, then failure)
When a position was UNCERTAIN, `acquireGpsWithBoundedRetry` always started a second full window: 12 s + 0.25 s + 12 s, and then usually still failed.
**Fix:** retry only if the first window produced fewer than 3 samples. Error retries (timeout / position unavailable) are unchanged.

### RC-3: Failed punch attempts were never recorded (no production visibility)
The client posts `acquisitionStatus`, `durationMs`, `accuracyMeters`, …, but the server schema requires `gpsAcquisitionStatus`, `gpsRequestDurationMs`, `reportedAccuracyMeters`, …. **Every diagnostic report was rejected with HTTP 422.** This was observed in the live access log: `POST /api/v1/attendance/gps-diagnostics 422`.
This is why the failures could not be diagnosed from the server: only successful punches leave a trace.
**Fix:** `buildGpsDiagnosticPayload()` maps the client fields onto the server schema exactly.

### RC-4: "Location reading was stale" for phones with a slow clock
The server compared the **phone-stamped** `locationTimestamp` with the **server** clock (limit 120 s). A phone whose clock runs more than 2 minutes slow was rejected as stale on every punch, even for a 1-second-old fix. Retrying cannot help, which matches the "repeated stale errors" complaint.
**Fix:** the client sends the fix's age measured on the phone's own clock at submit time. The server derives freshness from that age using its own clock. The 120 s limit is still enforced.
*Note:* this cause is proven at code level and by test (RC-4). Because of RC-3, there are no production logs of individual stale rejections that would show how many employees are affected.

### RC-5: Every browser wrote the geofence back to the database (data-integrity risk)
`HRMSContext` saved `geofence_config` to `company_settings` whenever the in-memory config changed, including when an employee's browser had simply loaded it. Face Attendance does this on every mount. A stale browser state could therefore overwrite the office centre or radius for everyone.
**Fix:** the loaded server value is fingerprinted, and only real changes (for example an administrator edit) are written.

## 3. GPS & geofence configuration findings (current PostgreSQL data)

| Source | Centre | Radius | Used by backend? |
|---|---|---|---|
| `company_settings.geofence_config` | **13.151660, 80.208618** | **250 m** | **Yes (authoritative)** |
| `googleMapsLink` stored in the same row | 13.152218, 80.209216 | – | No |
| Legacy table `public.geofence_config` | 13.151968, 80.2086053 | 200 m | Fallback only (not used while the first row exists) |

- The saved centre and the Google Maps pin are **89.7 m apart**. That gap uses up 90 m of the 250 m allowance for anyone standing at the Maps pin.
- Today's two punches came from within **2–3 m of the Maps pin** (88–89 m from the saved centre). Yesterday's came from near the saved centre. Employees appear to be at both points, which suggests the office or campus spans both. **This needs a human decision.**
- Distance calculation: Haversine, in metres, with identical frontend and backend implementations (verified by the existing test suite).

## 4. Decisions required from an authorized HR/CEO administrator

1. **Office centre:** confirm which point is the real office centre: the saved centre (13.151660, 80.208618) or the Google Maps pin (13.152218, 80.209216). Then confirm it in **Settings → GPS Geofence**. I have **not** changed it.
2. **Legacy `geofence_config` table** (200 m, a third centre): approve deleting or archiving it, so a future fallback cannot silently switch the office location.
3. **Uncertainty policy (no change made):** a reading counts as INSIDE only if *D + A ≤ R*. A phone reporting ±170 m accuracy is blocked even when its estimated position is inside. This is safe but strict. Loosening it is a policy decision, so I have not changed it, and the radius has not been increased.

## 5. Other findings (reported, not changed)

- **Server-side "face verification" only checks that a photo is present** (`attendanceRepository.verifyFace` returns `verified: true` for any image ≥ 50 chars). No biometric face match or liveness check runs on the server. Any real face-matching system would have to be selected and approved first.
- The punch request body (base64 JPEG at 480 px, quality 0.78) exceeds nginx's in-memory buffer and is spooled to disk (`client request body is buffered to a temporary file`). The punch **response** is about 24.8 KB because the photo is echoed back. Both are minor costs on mobile data and are left as optional optimizations.
- `FaceAttendance.tsx` still contains unused test helpers (`handleSetOfficeToMyLocation` and demo `inside`/`outside` location modes). They are not reachable from the UI. I recommend removing them.

## 6. Measurements

### Production (read-only, developer PC → hrms.businz.com, n = 20)
| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/v1/health` | 110 ms | 127 ms |
| `GET /api/v1/settings/geofence` | 111 ms | 135 ms |
| `GET /` | 108 ms | 117 ms |

The network and API are fast. **The slowness is in GPS acquisition on the device**, not in the backend.

### GPS acquisition time: before vs after (simulated geolocation, unit tests; *not* real devices)
| Scenario | Before | After |
|---|---|---|
| Indoor fix ±102 m, conclusively INSIDE (matches the live 15:01 punch) | 12 000 ms (full timeout) | ≤ 1 600 ms (measured 1 200 ms settle) |
| UNCERTAIN position after several samples | ~24 250 ms (2 windows) | ≤ 12 100 ms (1 window) |
| Fewer than 3 samples in the window | 2 windows | 2 windows (unchanged, bounded) |

The new tests were run against the **old** code: RC-1 and RC-2 fail there and pass with the fix.

**Not measured:** camera start-up, face capture, PostgreSQL transaction time and end-to-end p50/p95 on real phones. Production has no per-request timing log (the nginx log format has no `$request_time`), and no real-device session was available.

## 7. PostgreSQL save verification (read-only)
- `attendance_punch_events` stores one row per punch, with location, accuracy and location timestamp. Recent IN/OUT rows are consistent: OUT rows only appear after IN.
- `attendance_records` for the last 3 days: 22 / 23 / 49 rows. Check-out stays empty until a separate OUT punch (16 of 23 and 26 of 49 have check-out).
- The UI shows success only after `/attendance/punch` returns a 2xx with the saved record (`FaceAttendance.tsx` → `applyServerAttendanceRecord`). Cloud sync runs in the background afterwards.
- No attendance data was modified during this investigation.

## 8. Files modified (local development workspace only; not committed, not deployed)
| File | Change |
|---|---|
| `frontend/src/services/gpsAcquisitionService.ts` | RC-1 fast settle when conclusively INSIDE; RC-2 bounded retry only when samples < 3 |
| `frontend/src/services/attendanceApi.ts` | RC-3 `buildGpsDiagnosticPayload()` maps fields to the server schema |
| `frontend/src/components/attendance/FaceAttendance.tsx` | RC-4 sends the on-device reading age at submit time |
| `backend/src/controllers/attendanceController.ts` | RC-4 single-clock freshness check (120 s limit kept) |
| `frontend/src/context/HRMSContext.tsx` | RC-5 stops browsers echoing the geofence back to the DB |
| `backend/tests/faceAttendanceProductionRootCause.test.ts` | New: 6 regression tests |

## 9. Test results
- New suite: **6 / 6 pass**, and the RC-1 and RC-2 tests fail on the old code.
- Regression: `gpsGeofenceReliability`, `faceAttendanceVerification`, `shiftAttendanceEngine`, `employeeProfileSavePersistence`. **38 / 38 pass** in total.
- Frontend `tsc -b && vite build`: **pass** (built in 2.24 s). Backend `tsc`: **pass**.

## 10. Android / iOS real-device evidence
**None.** No real-device testing has been done, and none is claimed. Phase 9 (the 20 scenarios) still needs a person with an Android phone and an iPhone at the office. Once RC-3 is deployed, every failed attempt will be logged server-side (`GET /api/v1/attendance/gps-diagnostics`, HR only), which provides the evidence base for that test run.

## 11. Remaining limitations
- There is no real biometric face match (§5).
- The office centre is unconfirmed (§4.1). Until it is confirmed, employees near the Maps pin have about 160 m of accuracy margin instead of about 250 m.
- No real-device p50/p95 figures exist yet.
- The in-memory diagnostics buffer is cleared on every backend restart.

## 12. Production deployment readiness
**Ready for review, not yet deployed.** Before deploying:
1. Administrator confirms the decisions in §4 (deployment does not depend on 4.2 or 4.3).
2. Take a backup: `pg_dump` of `businz_hrms` (the attendance tables plus `company_settings`).
3. Get explicit approval for an HRMS-only rebuild of `businz_hrms_backend` and `businz_hrms_frontend` (CRM is not touched).
4. After deployment, run a real-device smoke test (Android Chrome and iPhone Safari, inside the office) and review `/attendance/gps-diagnostics`.

