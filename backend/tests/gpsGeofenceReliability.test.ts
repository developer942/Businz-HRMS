import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  calculateHaversineMeters as backendHaversine,
  evaluateGeofenceBoundary as backendEvaluateBoundary,
  verifyPunchGeofence,
  recordGpsDiagnostic,
  getRecentGpsDiagnostics
} from '../src/services/geofenceService.js';
import {
  parseGoogleMapsLink as backendParseMapsLink,
  compareOfficeCoordinates as backendCompareCoords,
  buildCanonicalGoogleMapsUrl
} from '../src/utils/googleMapsParser.js';
import { updateGeofenceSettingsSchema as geofenceSettingsSchema } from '../src/validators/settingsValidators.js';
import { punchSchema } from '../src/validators/attendanceValidators.js';
import {
  assertAttendanceTransition,
  getAttendanceState
} from '../src/services/attendanceStateMachine.js';
import {
  calculateHaversineMeters as frontendHaversine,
  evaluateGeofenceBoundary as frontendEvaluateBoundary,
  acquireHighAccuracyGps,
  acquireGpsWithBoundedRetry,
  cancelActiveGpsAcquisition,
  detectBrowserDeviceCategory,
  GpsAcquisitionError
} from '../../frontend/src/services/gpsAcquisitionService.js';
import {
  parseGoogleMapsLink as frontendParseMapsLink,
  compareOfficeCoordinates as frontendCompareCoords
} from '../../frontend/src/utils/googleMapsParser.js';

const SAVED_OFFICE = { lat: 13.151660, lng: 80.208618 };
const GMAPS_LINK_OFFICE = { lat: 13.152218, lng: 80.209216 };
const RADIUS_METERS = 250;

/**
 * Helper to offset latitude by exact northward distance in metres
 */
function offsetNorthMeters(lat: number, lng: number, metersNorth: number): { lat: number; lng: number } {
  const deltaLat = (metersNorth / 6371000) * (180 / Math.PI);
  return { lat: Number((lat + deltaLat).toFixed(6)), lng };
}

describe('BUSINZ HRMS – Phase 1 to Phase 10 GPS, Geofence & Face Attendance Reliability Suite', () => {
  afterEach(() => {
    cancelActiveGpsAcquisition();
    vi.restoreAllMocks();
  });

  // Scenario 20 & Phase 2: Office coordinate discrepancy detection & synchronization
  it('Phase 2 & Scenario 20/24: detects 90m discrepancy between Google Maps link (13.152218, 80.209216) and saved centre (13.151660, 80.208618) and validates confirmation schema', () => {
    const url = 'https://www.google.com/maps?q=13.152218,80.209216';
    const bComp = backendCompareCoords(SAVED_OFFICE.lat, SAVED_OFFICE.lng, url);
    const fComp = frontendCompareCoords(SAVED_OFFICE.lat, SAVED_OFFICE.lng, url);

    expect(bComp.parsedLink.success).toBe(true);
    expect(bComp.parsedLink.lat).toBe(13.152218);
    expect(bComp.parsedLink.lng).toBe(80.209216);
    expect(bComp.discrepancyMeters).toBe(90);
    expect(bComp.hasDiscrepancy).toBe(true);
    expect(fComp.discrepancyMeters).toBe(bComp.discrepancyMeters);

    // Negative / Western hemisphere coordinate parsing regression check
    const negParsed = frontendParseMapsLink('-33.868820, 151.209295');
    expect(negParsed.success).toBe(true);
    expect(negParsed.lat).toBe(-33.86882);
    expect(negParsed.lng).toBe(151.209295);

    const bNegParsed = backendParseMapsLink('-33.868820, -70.669265');
    expect(bNegParsed.success).toBe(true);
    expect(bNegParsed.lat).toBe(-33.86882);
    expect(bNegParsed.lng).toBe(-70.669265);

    // Confirming coordinates via settingsValidators
    const validUpdate = geofenceSettingsSchema.safeParse({
      officeName: 'VRM Structures India Pvt Ltd',
      centerLat: GMAPS_LINK_OFFICE.lat,
      centerLng: GMAPS_LINK_OFFICE.lng,
      radiusMeters: 250,
      googleMapsLink: buildCanonicalGoogleMapsUrl(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng),
      enabled: true,
      enforceStrictly: true,
      confirmCoordinateSource: 'google_maps_link'
    });
    expect(validUpdate.success).toBe(true);
  });

  // Scenarios 1, 2, 3, 4, 5, 6: Distance & Boundary Classification at 0m, 50m, 100m, 200m, ~250m, and outside
  it('Scenarios 1–6: accurately classifies employees at 0m, 50m, 100m, 200m, near 250m boundary, and clearly outside (>250m)', () => {
    // 1. At confirmed office centre (0m, accuracy 12m) -> D + A = 12 <= 250 -> INSIDE
    const d0 = backendHaversine(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    expect(d0).toBe(0);
    const eval0 = backendEvaluateBoundary(d0, RADIUS_METERS, 12, 'HQ');
    expect(eval0.classification).toBe('INSIDE');
    expect(eval0.canPunch).toBe(true);

    // 2. 50 metres from office (accuracy 15m) -> D + A = 65 <= 250 -> INSIDE
    const p50 = offsetNorthMeters(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, 50);
    const d50 = backendHaversine(p50.lat, p50.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    expect(d50).toBeGreaterThanOrEqual(49);
    expect(d50).toBeLessThanOrEqual(51);
    expect(backendEvaluateBoundary(d50, RADIUS_METERS, 15, 'HQ').classification).toBe('INSIDE');

    // 3. 100 metres from office (accuracy 20m) -> D + A = 120 <= 250 -> INSIDE
    const p100 = offsetNorthMeters(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, 100);
    const d100 = backendHaversine(p100.lat, p100.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    expect(d100).toBeGreaterThanOrEqual(99);
    expect(d100).toBeLessThanOrEqual(101);
    expect(backendEvaluateBoundary(d100, RADIUS_METERS, 20, 'HQ').classification).toBe('INSIDE');

    // 4. 200 metres from office (accuracy 25m) -> D + A = 225 <= 250 -> INSIDE
    const p200 = offsetNorthMeters(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, 200);
    const d200 = backendHaversine(p200.lat, p200.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    expect(d200).toBeGreaterThanOrEqual(199);
    expect(d200).toBeLessThanOrEqual(201);
    expect(backendEvaluateBoundary(d200, RADIUS_METERS, 25, 'HQ').classification).toBe('INSIDE');

    // 5. Close to 250m boundary: 242m with 6m accuracy -> INSIDE; 242m with 20m accuracy -> UNCERTAIN
    const p242 = offsetNorthMeters(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, 242);
    const d242 = backendHaversine(p242.lat, p242.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    expect(backendEvaluateBoundary(d242, RADIUS_METERS, 6, 'HQ').classification).toBe('INSIDE');
    const uncertainNearEdge = backendEvaluateBoundary(d242, RADIUS_METERS, 20, 'HQ');
    expect(uncertainNearEdge.classification).toBe('UNCERTAIN');
    expect(uncertainNearEdge.canPunch).toBe(false);
    expect(uncertainNearEdge.canRequestCorrection).toBe(true);
    expect(uncertainNearEdge.userMessage).toBe('We cannot confirm your position accurately enough yet. Please retry.');

    // 6. Clearly outside boundary: 340m with 15m accuracy -> D - A = 325 > 250 -> OUTSIDE
    const p340 = offsetNorthMeters(GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng, 340);
    const d340 = backendHaversine(p340.lat, p340.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
    const outsideEval = backendEvaluateBoundary(d340, RADIUS_METERS, 15, 'HQ');
    expect(outsideEval.classification).toBe('OUTSIDE');
    expect(outsideEval.canPunch).toBe(false);
    expect(outsideEval.canRequestCorrection).toBe(false);
    expect(outsideEval.userMessage).toBe('Your verified location is outside the configured 250-metre office boundary.');
  });

  // Scenario 7 & 16 & 17: Poor GPS accuracy, Indoor GPS, Outdoor GPS
  it('Scenarios 7, 16, 17: handles poor GPS accuracy (120m) as UNCERTAIN with specific message, while indoor (45m) and outdoor (8m) fixes inside boundary succeed', () => {
    // Scenario 7: Employee 160m from office with 120m coarse accuracy -> D + A = 280 > 250, D - A = 40 <= 250 -> UNCERTAIN
    const poorEval = backendEvaluateBoundary(160, RADIUS_METERS, 120, 'HQ');
    expect(poorEval.classification).toBe('UNCERTAIN');
    expect(poorEval.canPunch).toBe(false);
    expect(poorEval.errorCode).toBe('LOW_GPS_ACCURACY');
    expect(poorEval.userMessage).toBe('Your location accuracy is currently 120 metres. Please retry.');
    expect(poorEval.canRequestCorrection).toBe(true);

    // Scenario 16: Indoor GPS conditions (90m from office centre, 45m accuracy) -> D + A = 135 <= 250 -> INSIDE
    const indoorEval = backendEvaluateBoundary(90, RADIUS_METERS, 45, 'HQ');
    expect(indoorEval.classification).toBe('INSIDE');
    expect(indoorEval.canPunch).toBe(true);

    // Scenario 17: Outdoor GPS conditions (35m from office centre, 8m accuracy) -> D + A = 43 <= 250 -> INSIDE
    const outdoorEval = backendEvaluateBoundary(35, RADIUS_METERS, 8, 'HQ');
    expect(outdoorEval.classification).toBe('INSIDE');
    expect(outdoorEval.canPunch).toBe(true);
  });

  // Scenario 23: Frontend and Backend Haversine & Boundary Evaluation Agreement
  it('Scenario 23: guarantees 100% agreement between frontend and backend Haversine distances and boundary classifications', () => {
    const testCases = [
      { lat: 13.152218, lng: 80.209216, acc: 10 },
      { lat: 13.151660, lng: 80.208618, acc: 25 },
      { lat: 13.153100, lng: 80.209800, acc: 120 },
      { lat: 13.156500, lng: 80.214000, acc: 15 }
    ];

    for (const tc of testCases) {
      const fDist = frontendHaversine(tc.lat, tc.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
      const bDist = backendHaversine(tc.lat, tc.lng, GMAPS_LINK_OFFICE.lat, GMAPS_LINK_OFFICE.lng);
      expect(fDist).toBe(bDist);

      const fEval = frontendEvaluateBoundary(fDist, RADIUS_METERS, tc.acc, 'HQ');
      const bEval = backendEvaluateBoundary(bDist, RADIUS_METERS, tc.acc, 'HQ');
      expect(fEval.classification).toBe(bEval.classification);
      expect(fEval.canPunch).toBe(bEval.canPunch);
      expect(fEval.userMessage).toBe(bEval.userMessage);
    }
  });

  // Scenarios 8, 9, 10, 11, 12, 13, 14, 15, 21, 22: Mobile GPS Acquisition Lifecycle
  it('Scenarios 8, 9, 10, 11: handles Permission Denied, Timeout, Disabled Location Services, and Stale Readings with exact Phase 7 messages', async () => {
    const clearWatchMock = vi.fn();

    // Scenario 9: Permission Denied (code 1)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36',
      geolocation: {
        watchPosition: ( _success: any, error: any) => {
          setTimeout(() => error({ code: 1, message: 'User denied Geolocation' }), 10);
          return 101;
        },
        clearWatch: clearWatchMock
      }
    });

    await expect(acquireHighAccuracyGps({ timeoutMs: 500 })).rejects.toThrow(
      'Please allow precise location access for BUSINZ HRMS.'
    );
    expect(clearWatchMock).toHaveBeenCalledWith(101);

    // Scenario 10: Location services disabled / unavailable (code 2)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      geolocation: {
        watchPosition: (_success: any, error: any) => {
          setTimeout(() => error({ code: 2, message: 'Position unavailable' }), 10);
          return 102;
        },
        clearWatch: clearWatchMock
      }
    });

    await expect(acquireHighAccuracyGps({ timeoutMs: 500 })).rejects.toThrow(
      'Location services appear disabled or unavailable. Please enable GPS/location services and retry.'
    );

    // Scenario 8: Timeout (code 3 with no valid fix)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0',
      geolocation: {
        watchPosition: (_success: any, error: any) => {
          setTimeout(() => error({ code: 3, message: 'Timeout expired' }), 10);
          return 103;
        },
        clearWatch: clearWatchMock
      }
    });

    await expect(acquireHighAccuracyGps({ timeoutMs: 500 })).rejects.toThrow(
      'Unable to obtain your location. Please retry with location services enabled.'
    );

    // Scenario 11: Stale GPS reading rejected (reading timestamp 45 seconds old)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0',
      geolocation: {
        watchPosition: (success: any) => {
          setTimeout(() => {
            success({
              coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 12 },
              timestamp: Date.now() - 45_000
            });
          }, 10);
          return 104;
        },
        clearWatch: clearWatchMock
      }
    });

    await expect(
      acquireHighAccuracyGps({ timeoutMs: 120, maxStaleAgeMs: 15_000 })
    ).rejects.toThrow('Location reading was stale. Please retry to obtain a fresh GPS fix.');
  });

  it('Scenarios 12, 13, 14, 15, 21, 22: refines coarse Wi-Fi/cell fixes into accurate GNSS fixes on Android Chrome & iPhone Safari, deduplicates concurrent calls, and supports bounded retry', async () => {
    const clearWatchMock = vi.fn();

    // Scenarios 12, 14, 15: Android Chrome emits 3 initial coarse Wi-Fi/cell readings (140m, 125m, 110m) followed by a 16m satellite fix
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      geolocation: {
        watchPosition: (success: any) => {
          setTimeout(() => {
            success({ coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 140 }, timestamp: Date.now() });
          }, 10);
          setTimeout(() => {
            success({ coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 125 }, timestamp: Date.now() });
          }, 25);
          setTimeout(() => {
            success({ coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 110 }, timestamp: Date.now() });
          }, 40);
          setTimeout(() => {
            success({ coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 16 }, timestamp: Date.now() });
          }, 60);
          return 201;
        },
        clearWatch: clearWatchMock
      }
    });

    expect(detectBrowserDeviceCategory()).toBe('Android Chrome');

    // Scenario 22: Concurrent calls share the same active promise instead of spawning duplicate watchPosition listeners
    const [r1, r2] = await Promise.all([
      acquireHighAccuracyGps({
        timeoutMs: 2000,
        desiredAccuracyMeters: 30,
        geofenceContext: { centerLat: GMAPS_LINK_OFFICE.lat, centerLng: GMAPS_LINK_OFFICE.lng, radiusMeters: 250 }
      }),
      acquireHighAccuracyGps({
        timeoutMs: 2000,
        desiredAccuracyMeters: 30,
        geofenceContext: { centerLat: GMAPS_LINK_OFFICE.lat, centerLng: GMAPS_LINK_OFFICE.lng, radiusMeters: 250 }
      })
    ]);

    expect(r1.accuracy).toBe(16);
    expect(r2.accuracy).toBe(16);
    expect(r1.sampleCount).toBe(4);
    expect(clearWatchMock).toHaveBeenCalledTimes(1);

    // Scenario 13 & 21: iPhone Safari seconds-based timestamp normalization + bounded retry after initial timeout
    let callAttempt = 0;
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      geolocation: {
        watchPosition: (success: any, error: any) => {
          callAttempt += 1;
          if (callAttempt === 1) {
            setTimeout(() => error({ code: 3, message: 'Timeout' }), 15);
            return 301;
          }
          setTimeout(() => {
            // Simulate seconds-based epoch timestamp (< 1e12)
            const secondsEpoch = Math.floor(Date.now() / 1000);
            success({
              coords: { latitude: GMAPS_LINK_OFFICE.lat, longitude: GMAPS_LINK_OFFICE.lng, accuracy: 14 },
              timestamp: secondsEpoch
            });
          }, 15);
          return 302;
        },
        clearWatch: clearWatchMock
      }
    });

    expect(detectBrowserDeviceCategory()).toBe('iPhone Safari');

    const retriedFix = await acquireGpsWithBoundedRetry({
      timeoutMs: 1000,
      desiredAccuracyMeters: 25,
      maxRetries: 1,
      geofenceContext: { centerLat: GMAPS_LINK_OFFICE.lat, centerLng: GMAPS_LINK_OFFICE.lng, radiusMeters: 250 }
    });

    expect(retriedFix.accuracy).toBe(14);
    expect(retriedFix.retryCount).toBe(1);
    expect(retriedFix.timestamp).toBeGreaterThan(1e12);
  });

  // Scenarios 18, 19, 25 & Phase 9 Diagnostics
  it('Scenarios 18, 19, 25 & Phase 9: enforces separate Punch In/Out with fresh photo & 1-hour restriction, allows authorized field duty, and records privacy-conscious diagnostics', () => {
    const fp = (s: string) => createHash('sha256').update(s).digest('hex');
    const inTime = new Date('2026-10-29T04:00:00.000Z');

    // Scenario 18 & 19: Punch In -> 1-hour lock -> Punch Out with fresh photo
    expect(
      assertAttendanceTransition({
        type: 'IN',
        row: null,
        serverNow: inTime,
        newPhotoFingerprint: fp('fresh-checkin-selfie')
      })
    ).toBe('CHECKED_IN');

    const checkedInRow = {
      check_in: inTime.toISOString(),
      check_out: null,
      check_in_photo: 'fresh-checkin-selfie'
    };

    // 45 minutes later -> blocked by 1-hour rule
    expect(() =>
      assertAttendanceTransition({
        type: 'OUT',
        row: checkedInRow,
        serverNow: new Date('2026-10-29T04:45:00.000Z'),
        newPhotoFingerprint: fp('fresh-checkout-selfie'),
        checkInPhotoFingerprint: fp('fresh-checkin-selfie')
      })
    ).toThrow('Punch Out available at');

    // 61 minutes later -> succeeds with fresh selfie
    expect(
      assertAttendanceTransition({
        type: 'OUT',
        row: checkedInRow,
        serverNow: new Date('2026-10-29T05:01:00.000Z'),
        newPhotoFingerprint: fp('fresh-checkout-selfie'),
        checkInPhotoFingerprint: fp('fresh-checkin-selfie')
      })
    ).toBe('CHECKED_OUT');

    // Scenario 25: Authorized field-duty punch validation
    const fieldDutyPunch = punchSchema.safeParse({
      type: 'IN',
      method: 'Face Recognition',
      locationLat: 13.0827,
      locationLng: 80.2707,
      accuracyMeters: 18,
      locationTimestamp: new Date().toISOString(),
      photoBase64: `data:image/jpeg;base64,${'B'.repeat(100)}`,
      idempotencyKey: 'field-duty-punch-001',
      fieldDutyAuthorized: true,
      browserDeviceCategory: 'Android Chrome',
      gpsDurationMs: 1420,
      gpsSampleCount: 3
    });
    expect(fieldDutyPunch.success).toBe(true);

    // Phase 9: Privacy-conscious diagnostic logging (does NOT store raw lat/lng coordinates)
    const diag = recordGpsDiagnostic({
      employeeId: 'EMP-001',
      punchType: 'IN',
      acquisitionStatus: 'SUCCESS',
      durationMs: 1420,
      accuracyMeters: 18,
      readingAgeMs: 120,
      distanceMeters: 42,
      radiusMeters: 250,
      classification: 'INSIDE',
      errorCode: 'NONE',
      browserDeviceCategory: 'Android Chrome',
      sampleCount: 3,
      retryCount: 0
    });

    expect(diag).not.toHaveProperty('latitude');
    expect(diag).not.toHaveProperty('longitude');
    expect(getRecentGpsDiagnostics(5)[0].id).toBe(diag.id);
  });
});
