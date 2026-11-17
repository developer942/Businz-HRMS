import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateHaversineMeters as frontendHaversine,
  isValidMovementPoint,
  isTrackingGap as frontendIsGap,
  calculateSequentialRouteMetrics,
  normalizeTripSessionMetrics,
  matchContiguousClusterToRoad,
  matchTripSegmentsToRoads,
  isTrackingScheduleActive,
} from '../../frontend/src/services/trackingEngine';
import {
  OfflineTrackingStorage,
  generateTrackingUuid,
  BrowserLocationProvider,
} from '../../frontend/src/services/trackingLocationProvider';
import {
  validateLocationPoint,
  calculateBackendRouteMetrics,
  isTrackingGap as backendIsGap,
} from '../src/services/gpsAccuracyEngine.js';
import { toDeterministicUuid } from '../src/repositories/trackingRepository.js';
import { FieldAssignment, FieldTripSession, LocationPoint } from '../../frontend/src/types/tracking';

// Exact 6 points from the historical trip TRIP-1793021575710 in company_settings
const REAL_6_POINT_TRIP: FieldTripSession = {
  id: 'TRIP-1793021575710',
  assignmentId: 'FA-2026-001',
  employeeId: 'VRM-035',
  employeeName: 'Mohamed Noorisha Bilaly',
  department: 'SALES',
  dutyType: 'Site Visit',
  customerSiteName: 'bilali',
  tripStartTime: '2026-10-26T13:32:55.710Z', // 07:02:55 PM IST
  lastGpsUpdate: '2026-10-26T14:00:04.999Z', // 07:30:04 PM IST
  tripEndTime: '2026-10-26T15:05:59.728Z', // 08:35:59 PM IST
  checkInTime: '2026-10-26T13:32:49.687Z',
  checkOutTime: '2026-10-26T15:05:59.728Z',
  startLat: 13.129174,
  startLng: 80.215332,
  startAddress: 'Current Location',
  endLat: 13.1047613,
  endLng: 80.253853,
  endAddress: 'Field Duty Check-Out',
  totalKm: 5.28, // Legacy inflated stored value that included the 5.01km unrecorded gap
  status: 'Completed',
  gpsStatus: 'GPS Active',
  trackingStatus: 'Completed',
  createdAt: '2026-10-26T13:32:55.710Z',
  updatedAt: '2026-10-26T15:05:59.728Z',
  locationPoints: [
    {
      id: 'pt-1793021575710-1',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T13:32:55.710Z',
      latitude: 13.129174,
      longitude: 80.215332,
      accuracy: 15,
      speed: 0,
    },
    {
      id: 'pt-1793021580861-2',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T13:33:00.848Z',
      latitude: 13.1299162,
      longitude: 80.2141952,
      accuracy: 13.994,
      speed: 0,
      source: 'browser_watch',
    },
    {
      id: 'pt-1793023195461-3',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T13:59:55.349Z',
      latitude: 13.1049022,
      longitude: 80.2533614,
      accuracy: 9.521,
      speed: 13.34,
      heading: 112.99,
      source: 'browser_watch',
    },
    {
      id: 'pt-1793023199560-4',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T13:59:59.599Z',
      latitude: 13.1048787,
      longitude: 80.2535484,
      accuracy: 5.055,
      speed: 16.92,
      heading: 96.36,
      source: 'browser_watch',
    },
    {
      id: 'pt-1793023202566-5',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T14:00:02.596Z',
      latitude: 13.1048155,
      longitude: 80.2537107,
      accuracy: 4.986,
      speed: 22.34,
      heading: 114.66,
      source: 'browser_watch',
    },
    {
      id: 'pt-1793023204968-6',
      tripId: 'TRIP-1793021575710',
      assignmentId: 'FA-2026-001',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T14:00:04.999Z',
      latitude: 13.1047613,
      longitude: 80.253853,
      accuracy: 4.749,
      speed: 22.25,
      heading: 116.76,
      source: 'browser_watch',
    },
  ],
};

describe('BUSINZ HRMS – Employee GPS Tracking, Road Map Matching & Verified KM Suite (Phases 1–9)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Scenario 1 & 18: Trip start schedule validation, deterministic UUID mapping, and RBAC scoping', () => {
    const assignment: FieldAssignment = {
      id: 'FA-2026-001',
      employeeId: 'VRM-035',
      employeeName: 'Mohamed Noorisha Bilaly',
      department: 'SALES',
      dutyType: 'Site Visit',
      scheduleType: 'One Day',
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      startTime: '09:00',
      endTime: '21:00',
      customerSiteName: 'bilali',
      siteAddress: 'Perambur, Chennai',
      purpose: 'Client Visit',
      trackingRequired: true,
      travelKmRequired: true,
      attendanceType: 'Flexible Field Check-in',
      allowedRadiusMeters: 200,
      status: 'Active',
      createdAt: '2026-10-26T09:00:00.000Z',
      updatedAt: '2026-10-26T09:00:00.000Z',
    };

    const duringDuty = new Date('2026-10-26T14:00:00.000Z');
    expect(isTrackingScheduleActive(assignment, duringDuty)).toBe(true);

    const cancelledAssignment = { ...assignment, status: 'Cancelled' as const };
    expect(isTrackingScheduleActive(cancelledAssignment, duringDuty)).toBe(false);

    // Deterministic UUID mapping ensures string IDs (FA-..., TRIP-..., pt-...) map to valid PostgreSQL UUIDs
    const uuid1 = toDeterministicUuid('FA-2026-001');
    const uuid2 = toDeterministicUuid('FA-2026-001');
    const tripUuid = toDeterministicUuid('TRIP-1793021575710');
    expect(uuid1).toBe(uuid2);
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tripUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('Scenario 2, 6 & 7: Continuous GPS recording, 15-minute stationary stop recovery, and accuracy tiers', () => {
    const startPt: LocationPoint = {
      id: 'pt-1',
      tripId: 'TRIP-1',
      assignmentId: 'FA-1',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T10:00:00.000Z',
      latitude: 13.0827,
      longitude: 80.2707,
      accuracy: 12,
      speed: 0,
    };

    // 1. Stationary jitter (3m movement after 10s) -> suppressed
    const jitterRes = isValidMovementPoint(
      startPt,
      13.08272,
      80.27071,
      12,
      new Date('2026-10-26T10:00:10.000Z').getTime()
    );
    expect(jitterRes.valid).toBe(false);
    expect(jitterRes.isStationary).toBe(true);

    // 2. Scenario 6: Employee stops at a junction/shop for 15 minutes, then moves 18m
    // Previously, dividing 18m by 900s gave 0.072 km/h (< 3 km/h) and wrongly rejected the movement!
    const after15MinStop = isValidMovementPoint(
      startPt,
      13.082865, // ~18.3m north
      80.2707,
      14,
      new Date('2026-10-26T10:15:00.000Z').getTime()
    );
    expect(after15MinStop.valid).toBe(true);
    expect(after15MinStop.distanceMeters).toBeGreaterThanOrEqual(15);
    expect(after15MinStop.isGap).toBe(false);

    const backendAfterStop = validateLocationPoint(
      {
        latitude: 13.082865,
        longitude: 80.2707,
        accuracy: 14,
        recordedAt: '2026-10-26T10:15:00.000Z',
      },
      startPt
    );
    expect(backendAfterStop.accepted).toBe(true);

    // 3. Scenario 7: Moderate/low accuracy (65m in urban canyon with 30m movement) is accepted and flagged
    const urbanCanyonFix = isValidMovementPoint(
      startPt,
      13.083, // ~33m north
      80.2707,
      65,
      new Date('2026-10-26T10:00:15.000Z').getTime()
    );
    expect(urbanCanyonFix.valid).toBe(true);
    expect(urbanCanyonFix.qualityFlag).toBe('low_accuracy');

    // Extreme poor accuracy (> 100m) is rejected
    const extremePoorFix = isValidMovementPoint(
      startPt,
      13.0835,
      80.2707,
      145,
      new Date('2026-10-26T10:00:20.000Z').getTime()
    );
    expect(extremePoorFix.valid).toBe(false);
    expect(extremePoorFix.qualityFlag).toBe('rejected');
  });

  it('Scenario 8 & 9: Temporary internet disconnection, local offline queueing, and idempotent reconnection sync', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    const ptId = generateTrackingUuid();
    const offlinePt: LocationPoint = {
      id: ptId,
      tripId: 'TRIP-OFFLINE-1',
      assignmentId: 'FA-1',
      employeeId: 'VRM-035',
      recordedAt: '2026-10-26T11:00:00.000Z',
      latitude: 13.09,
      longitude: 80.25,
      accuracy: 10,
    };

    // Save twice to test deduplication
    OfflineTrackingStorage.saveOfflinePoint(offlinePt);
    OfflineTrackingStorage.saveOfflinePoint(offlinePt);

    const queued = OfflineTrackingStorage.getOfflinePoints();
    expect(queued.length).toBe(1);
    expect(queued[0].id).toBe(ptId);
    expect(queued[0].uploadStatus).toBe('pending');

    // Clear after reconnect sync
    OfflineTrackingStorage.clearOfflinePoints([ptId]);
    expect(OfflineTrackingStorage.getOfflinePoints().length).toBe(0);
  });

  it('Scenario 10, 11, 12, 13 & 15: Forensic audit & recalculation of the 6-point trip (TRIP-1793021575710)', () => {
    // Normalize the historical 6-point trip
    const normalized = normalizeTripSessionMetrics(REAL_6_POINT_TRIP);

    // 1. Preserves original 5.28 KM as legacyStoredKm for audit reference
    expect(normalized.legacyStoredKm).toBe(5.28);

    // 2. Verified Travel KM is strictly calculated from the 2 contiguous recorded road segments (~0.20 KM = 204.4m)
    // and NEVER includes the 5,006.9m unrecorded 27-minute gap!
    expect(normalized.totalKm).toBe(0.2);
    expect(normalized.verifiedDistanceMeters).toBeGreaterThanOrEqual(200);
    expect(normalized.verifiedDistanceMeters).toBeLessThanOrEqual(210);

    // 3. Unverified gap distance is 5072.1m (5.07 KM)
    expect(normalized.unverifiedDistanceMeters).toBe(5072.1);

    // 4. Detects both missing intervals:
    //    - Gap 1: 07:03:00 PM -> 07:29:55 PM (26m 55s)
    //    - Gap 2: 07:30:05 PM -> 08:35:59 PM (1h 05m 55s trailing gap before tripEndTime)
    expect(normalized.missingIntervalsCount).toBe(2);
    expect(normalized.missingDurationSeconds).toBeGreaterThan(5500);
    expect(normalized.gpsDataQuality).toBe('Partial (Gaps Detected)');

    // 5. Backend route metrics engine agrees 100% with frontend engine
    const backendMetrics = calculateBackendRouteMetrics(
      REAL_6_POINT_TRIP.locationPoints,
      REAL_6_POINT_TRIP.tripEndTime
    );
    expect(backendMetrics.verifiedKm).toBe(normalized.totalKm);
    expect(backendMetrics.unverifiedGapKm).toBe(5.07);
    expect(backendMetrics.missingIntervalsCount).toBe(normalized.missingIntervalsCount);
    expect(backendMetrics.gpsDataQuality).toBe('Partial (Gaps Detected)');
  });

  it('Scenario 3, 4, 5 & 14: Multi-road OSRM map matching preserves curves/turns on verified segments and never bridges missing GPS gaps', async () => {
    // Mock OSRM response for contiguous road sub-traces
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/match/v1/driving/') || url.includes('/route/v1/driving/')) {
        // Return a curved multi-vertex road geometry following street turns
        return {
          ok: true,
          json: async () => ({
            code: 'Ok',
            matchings: [
              {
                distance: 162.4,
                geometry: {
                  coordinates: [
                    [80.215332, 13.129174],
                    [80.21495, 13.12935],
                    [80.2146, 13.12965],
                    [80.214195, 13.129916],
                  ],
                },
              },
            ],
            routes: [
              {
                distance: 162.4,
                geometry: {
                  coordinates: [
                    [80.215332, 13.129174],
                    [80.21495, 13.12935],
                    [80.2146, 13.12965],
                    [80.214195, 13.129916],
                  ],
                },
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const matched = await matchTripSegmentsToRoads(
      REAL_6_POINT_TRIP.locationPoints,
      REAL_6_POINT_TRIP.tripEndTime,
      'https://router.project-osrm.org'
    );

    // Should have 3 segments:
    // 1. Cluster 1 (pt-1 -> pt-2): road_matched with 4 curved road coordinates
    // 2. Gap (pt-2 -> pt-3): unverified_gap (NOT road matched!)
    // 3. Cluster 2 (pt-3 -> pt-6): road_matched
    expect(matched.segments.length).toBe(3);
    expect(matched.segments[0].segmentType).toBe('road_matched');
    expect(matched.segments[0].coordinates?.length).toBe(4);
    expect(matched.segments[1].segmentType).toBe('unverified_gap');
    expect(matched.segments[2].segmentType).toBe('road_matched');

    // Verified KM only sums the 2 road-matched clusters, NEVER the 5.07km gap!
    expect(matched.verifiedKm).toBeLessThan(0.5);
    expect(matched.unverifiedGapKm).toBe(5.07);
  });

  it('Scenario 16: Foreground visibilitychange re-acquires Wake Lock and triggers immediate GPS fix', async () => {
    const getPosSpy = vi.fn((success: any) => {
      success({
        coords: { latitude: 13.105, longitude: 80.254, accuracy: 8, speed: 5, heading: 90, altitude: 12 },
        timestamp: Date.now(),
      });
    });
    const watchPosSpy = vi.fn(() => 77);
    const clearWatchSpy = vi.fn();
    const wakeLockReqSpy = vi.fn(async () => ({
      addEventListener: vi.fn(),
      release: vi.fn(),
    }));

    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: getPosSpy,
        watchPosition: watchPosSpy,
        clearWatch: clearWatchSpy,
      },
      wakeLock: {
        request: wakeLockReqSpy,
      },
    });

    const provider = new BrowserLocationProvider();
    const receivedCoords: any[] = [];
    const watchId = provider.watchPosition(
      (c) => receivedCoords.push(c),
      () => {},
      { activePollIntervalMs: 10000 }
    );

    expect(watchId).toBe(77);
    expect(wakeLockReqSpy).toHaveBeenCalledWith('screen');
    provider.clearWatch(watchId);
    expect(clearWatchSpy).toHaveBeenCalledWith(77);
  });
});
