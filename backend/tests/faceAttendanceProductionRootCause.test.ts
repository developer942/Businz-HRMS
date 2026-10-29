import { describe, expect, it, vi, afterEach } from 'vitest';
import { verifyPunchGeofence } from '../src/services/geofenceService.js';
import { gpsDiagnosticSchema } from '../src/validators/attendanceValidators.js';
import {
  acquireHighAccuracyGps,
  acquireGpsWithBoundedRetry,
  cancelActiveGpsAcquisition,
} from '../../frontend/src/services/gpsAcquisitionService.js';
import { buildGpsDiagnosticPayload } from '../../frontend/src/services/attendanceApi.js';

// Current authoritative production geofence (company_settings.geofence_config, read-only audit 29 Oct 2026)
const SAVED_CENTRE = { lat: 13.15166, lng: 80.208618 };
const RADIUS = 250;

const offsetNorth = (lat: number, lng: number, m: number) => ({
  lat: Number((lat + (m / 6371000) * (180 / Math.PI)).toFixed(6)),
  lng,
});

/** Stubs navigator.geolocation.watchPosition with a scripted stream of fixes. */
function stubWatch(fixes: Array<{ atMs: number; lat: number; lng: number; acc: number }>) {
  const clearWatch = vi.fn();
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36',
    geolocation: {
      watchPosition: (success: any) => {
        for (const f of fixes) {
          setTimeout(() => success({
            coords: { latitude: f.lat, longitude: f.lng, accuracy: f.acc },
            timestamp: Date.now(),
          }), f.atMs);
        }
        return 77;
      },
      clearWatch,
      getCurrentPosition: vi.fn(),
    },
  });
  return clearWatch;
}

describe('BUSINZ HRMS – production Face Attendance GPS root-cause regressions (29 Oct 2026)', () => {
  afterEach(() => {
    cancelActiveGpsAcquisition();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('RC-1: an indoor fix with ±102m accuracy that is conclusively INSIDE resolves in ~1.2s, not after the 12s timeout', async () => {
    vi.useFakeTimers();
    // Mirrors the production punch at 15:01 IST: ±102m, 88m from the saved centre -> D + A = 190 <= 250 (INSIDE)
    const p = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 88);
    const clearWatch = stubWatch([{ atMs: 300, ...p, acc: 102 }]);
    let resolvedAt: number | null = null;
    const start = Date.now();
    const promise = acquireHighAccuracyGps({
      timeoutMs: 12000,
      desiredAccuracyMeters: 35,
      acceptableAccuracyMeters: 65,
      geofenceContext: { centerLat: SAVED_CENTRE.lat, centerLng: SAVED_CENTRE.lng, radiusMeters: RADIUS },
    }).then((r) => { resolvedAt = Date.now() - start; return r; });

    await vi.advanceTimersByTimeAsync(2000);
    const reading = await promise;
    expect(reading.accuracy).toBe(102);
    expect(resolvedAt).not.toBeNull();
    expect(resolvedAt!).toBeLessThanOrEqual(1600); // previously waited the full 12,000ms
    expect(clearWatch).toHaveBeenCalledWith(77);
  });

  it('RC-2: an UNCERTAIN position after a full window with several samples does not trigger a second 12s window', async () => {
    vi.useFakeTimers();
    // 200m away with ±120m accuracy -> D + A > R and D - A <= R => UNCERTAIN for the whole window
    const p = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 200);
    const watchSpy = vi.fn();
    stubWatch([
      { atMs: 500, ...p, acc: 140 },
      { atMs: 3000, ...p, acc: 125 },
      { atMs: 6000, ...p, acc: 120 },
    ]);
    const originalWatch = (globalThis.navigator as any).geolocation.watchPosition;
    (globalThis.navigator as any).geolocation.watchPosition = (...args: any[]) => { watchSpy(); return originalWatch(...args); };

    const start = Date.now();
    let doneAt = 0;
    const promise = acquireGpsWithBoundedRetry({
      timeoutMs: 12000,
      maxRetries: 1,
      geofenceContext: { centerLat: SAVED_CENTRE.lat, centerLng: SAVED_CENTRE.lng, radiusMeters: RADIUS },
    }).then((r) => { doneAt = Date.now() - start; return r; });

    await vi.advanceTimersByTimeAsync(30000);
    const reading = await promise;
    expect(reading.accuracy).toBe(120);
    expect(watchSpy).toHaveBeenCalledTimes(1); // previously 2 windows = ~24.25s
    expect(doneAt).toBeLessThanOrEqual(12100);
  });

  it('RC-2b: a window that produced fewer than 3 samples still gets ONE bounded retry', async () => {
    vi.useFakeTimers();
    const p = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 200);
    const watchSpy = vi.fn();
    stubWatch([{ atMs: 500, ...p, acc: 140 }]);
    const originalWatch = (globalThis.navigator as any).geolocation.watchPosition;
    (globalThis.navigator as any).geolocation.watchPosition = (...args: any[]) => { watchSpy(); return originalWatch(...args); };
    const promise = acquireGpsWithBoundedRetry({
      timeoutMs: 12000,
      maxRetries: 1,
      geofenceContext: { centerLat: SAVED_CENTRE.lat, centerLng: SAVED_CENTRE.lng, radiusMeters: RADIUS },
    });
    await vi.advanceTimersByTimeAsync(30000);
    await promise;
    expect(watchSpy).toHaveBeenCalledTimes(2);
  });

  it('RC-3: the client GPS diagnostic payload is accepted by the server schema (was always HTTP 422)', () => {
    // Exactly what FaceAttendance.tsx sends on a failed punch
    const clientFailure = {
      employeeId: 'VRM-044',
      punchType: 'IN',
      acquisitionStatus: 'STALE_REJECTED',
      durationMs: 12034,
      accuracyMeters: null,
      radiusMeters: 250,
      classification: 'N/A',
      errorCode: 'STALE_READING',
      browserDeviceCategory: 'Android Chrome',
      sampleCount: 0,
    };
    // Old behaviour: raw payload is rejected
    expect(gpsDiagnosticSchema.safeParse(clientFailure).success).toBe(false);
    // New behaviour: mapped payload is accepted with the correct fields
    const mapped = gpsDiagnosticSchema.safeParse(buildGpsDiagnosticPayload(clientFailure));
    expect(mapped.success).toBe(true);
    expect(mapped.success && mapped.data.gpsAcquisitionStatus).toBe('STALE');
    expect(mapped.success && mapped.data.employeeCode).toBe('VRM-044');

    const uncertain = buildGpsDiagnosticPayload({
      employeeId: 'VRM-042', punchType: 'OUT', acquisitionStatus: 'LOW_ACCURACY', durationMs: 4200.6,
      accuracyMeters: 162.4, readingAgeMs: 900, distanceMeters: 151.2, radiusMeters: 250,
      classification: 'UNCERTAIN', errorCode: 'LOW_GPS_ACCURACY', browserDeviceCategory: 'iPhone Safari',
      sampleCount: 4.0, retryCount: 0,
    });
    expect(gpsDiagnosticSchema.safeParse(uncertain).success).toBe(true);
  });

  it('RC-4: a fresh fix from a phone whose clock is 5 minutes slow is no longer rejected as stale; genuinely old fixes still are', () => {
    const p = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 30);
    const base = {
      userLat: p.lat, userLng: p.lng,
      officeLat: SAVED_CENTRE.lat, officeLng: SAVED_CENTRE.lng,
      radiusMeters: RADIUS, accuracyMeters: 20,
    };
    const phoneClockSkewMs = -5 * 60_000;           // phone clock 5 min behind server
    const deviceAgeMs = 1_500;                       // fix is 1.5s old on the phone's own clock
    const phoneStampedTimestamp = new Date(Date.now() + phoneClockSkewMs - deviceAgeMs).toISOString();

    // Old controller behaviour (cross-clock comparison): false "stale" rejection
    const oldResult = verifyPunchGeofence({ ...base, locationTimestamp: phoneStampedTimestamp });
    expect(oldResult.valid).toBe(false);
    expect(oldResult.error).toMatch(/stale/i);

    // New controller behaviour: freshness derived from on-device age against the server clock
    const freshnessTimestamp = new Date(Date.now() - deviceAgeMs).toISOString();
    expect(verifyPunchGeofence({ ...base, locationTimestamp: freshnessTimestamp }).valid).toBe(true);

    // Freshness is still enforced: a genuinely 3-minute-old fix is rejected
    const genuinelyStale = new Date(Date.now() - 180_000).toISOString();
    const staleResult = verifyPunchGeofence({ ...base, locationTimestamp: genuinelyStale });
    expect(staleResult.valid).toBe(false);
    expect(staleResult.error).toMatch(/stale/i);
  });

  it('Guard: geofence enforcement is unchanged — clearly outside and uncertain readings are still blocked', () => {
    const far = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 600);
    const outside = verifyPunchGeofence({
      userLat: far.lat, userLng: far.lng, officeLat: SAVED_CENTRE.lat, officeLng: SAVED_CENTRE.lng,
      radiusMeters: RADIUS, accuracyMeters: 15, locationTimestamp: new Date().toISOString(),
    });
    expect(outside.valid).toBe(false);
    expect(outside.evaluation?.classification).toBe('OUTSIDE');

    const edge = offsetNorth(SAVED_CENTRE.lat, SAVED_CENTRE.lng, 200);
    const uncertain = verifyPunchGeofence({
      userLat: edge.lat, userLng: edge.lng, officeLat: SAVED_CENTRE.lat, officeLng: SAVED_CENTRE.lng,
      radiusMeters: RADIUS, accuracyMeters: 120, locationTimestamp: new Date().toISOString(),
    });
    expect(uncertain.valid).toBe(false);
    expect(uncertain.evaluation?.classification).toBe('UNCERTAIN');
  });
});

