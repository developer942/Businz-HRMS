// ==============================================================================
// VRM Enterprise HRMS — High-Accuracy GPS Acquisition & Geofence Service
// Progressive multi-sampling GPS acquisition, stale reading rejection,
// bounded retry orchestration, uncertainty-aware classification & diagnostics
// ==============================================================================

export type GeofenceClassification = 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN';

export type GpsErrorCode =
  | 'NONE'
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'STALE_READING'
  | 'LOW_GPS_ACCURACY'
  | 'OUTSIDE_GEOFENCE'
  | 'GEOFENCE_UNCERTAIN'
  | 'INVALID_COORDINATES';

export interface GpsLocationReading {
  latitude: number;
  longitude: number;
  accuracy: number; // in metres (radius of 68% confidence)
  timestamp: number; // epoch ms from GeolocationPosition
  readingAgeMs: number; // age in ms at moment of capture
  sampleCount: number;
  durationMs: number;
  retryCount: number;
  deviceCategory: string;
  browserDeviceCategory: string;
}

export interface GeofenceEvaluation {
  classification: GeofenceClassification;
  distanceMeters: number;
  radiusMeters: number;
  accuracyMeters: number;
  isInside: boolean;
  canPunch: boolean;
  message: string;
  userMessage: string;
  errorCode: GpsErrorCode;
  canRequestCorrection: boolean;
  officeName: string;
}

export interface GpsAcquisitionProgress {
  phase: 'REQUESTING_PERMISSION' | 'ACQUIRING' | 'IMPROVING_ACCURACY' | 'RETRYING';
  message: string;
  currentAccuracyMeters?: number;
  bestAccuracyMeters: number | null;
  sampleCount: number;
  attempt: number;
  maxAttempts: number;
}

export interface GpsDiagnosticSummary {
  gpsRequestDurationMs: number;
  gpsAcquisitionStatus:
    | 'SUCCESS'
    | 'PERMISSION_DENIED'
    | 'TIMEOUT'
    | 'POSITION_UNAVAILABLE'
    | 'LOW_ACCURACY'
    | 'STALE';
  reportedAccuracyMeters: number | null;
  locationReadingAgeMs: number | null;
  calculatedDistanceMeters: number | null;
  configuredRadiusMeters: number;
  errorCode: GpsErrorCode;
  browserDeviceCategory: string;
  classification: GeofenceClassification | 'N/A';
  sampleCount: number;
  retryCount: number;
  timestamp: string;
}

export class GpsAcquisitionError extends Error {
  public readonly code: GpsErrorCode;
  public readonly durationMs: number;
  public readonly sampleCount: number;
  public readonly reportedAccuracyMeters: number | null;
  public readonly accuracyMeters: number | null;
  public readonly deviceCategory: string;

  constructor(params: {
    code: GpsErrorCode;
    message: string;
    durationMs: number;
    sampleCount?: number;
    reportedAccuracyMeters?: number | null;
    deviceCategory?: string;
  }) {
    super(params.message);
    this.name = 'GpsAcquisitionError';
    this.code = params.code;
    this.durationMs = params.durationMs;
    this.sampleCount = params.sampleCount ?? 0;
    this.reportedAccuracyMeters = params.reportedAccuracyMeters ?? null;
    this.accuracyMeters = params.reportedAccuracyMeters ?? null;
    this.deviceCategory = params.deviceCategory || detectBrowserDeviceCategory();
  }
}

/**
 * Detects browser and device category for privacy-conscious diagnostics and platform handling.
 */
export function detectBrowserDeviceCategory(customUserAgent?: string): string {
  const ua =
    customUserAgent ??
    (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '');
  if (!ua) return 'Unknown Device';

  const isAndroid = /Android/i.test(ua);
  const isIPhone = /iPhone|iPod/i.test(ua);
  const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && (navigator as any).maxTouchPoints > 1);
  const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg|OPR/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /Edg|EdgA|EdgiOS/i.test(ua);

  if (isAndroid && isChrome) return 'Android Chrome';
  if (isAndroid && isFirefox) return 'Android Firefox';
  if (isAndroid) return 'Android Browser';
  if (isIPhone && isSafari) return 'iPhone Safari';
  if (isIPhone && isChrome) return 'iPhone Chrome';
  if (isIPhone) return 'iPhone Browser';
  if (isIPad && isSafari) return 'iPad Safari';
  if (isIPad) return 'iPad Browser';
  if (isChrome) return 'Desktop Chrome';
  if (isSafari) return 'Desktop Safari';
  if (isEdge) return 'Desktop Edge';
  if (isFirefox) return 'Desktop Firefox';
  return 'Desktop Browser';
}

/**
 * Validates that latitude and longitude are finite numbers within geographic bounds and not Null Island (0,0).
 */
export function isValidGpsCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

/**
 * Calculates Great-Circle geodesic distance between two points in metres using the Haversine formula.
 * Earth mean radius = 6,371,000 metres.
 */
export function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Evaluates whether an employee is clearly inside, clearly outside, or uncertain relative to the office geofence.
 *
 * Conservative Uncertainty-Aware Classification (Phase 6):
 * - D = measured distance to office centre in metres
 * - R = configured geofence radius in metres
 * - A = device-reported GPS accuracy radius in metres
 *
 * Rules:
 * - Clearly inside:  D + A <= R
 * - Clearly outside: D - A > R
 * - Uncertain:       All other cases
 */
export function evaluateGeofenceBoundary(
  distanceMeters: number,
  radiusMeters: number,
  accuracyMeters: number = 15,
  officeName: string = 'Office',
  maxAccuracyMeters?: number
): GeofenceEvaluation {
  const D = Math.round(distanceMeters * 10) / 10;
  const R = Math.round(radiusMeters);
  const A = Math.max(0, Math.round((accuracyMeters ?? 15) * 10) / 10);

  const effectiveMaxAccuracy =
    maxAccuracyMeters !== undefined && Number.isFinite(maxAccuracyMeters) && maxAccuracyMeters > 0
      ? maxAccuracyMeters
      : undefined;

  if (effectiveMaxAccuracy !== undefined && A > effectiveMaxAccuracy) {
    const userMessage = `Your location accuracy is currently ${Math.round(A)} metres (required: ≤${Math.round(effectiveMaxAccuracy)}m). Please enable Precise Location and retry.`;
    return {
      classification: 'UNCERTAIN',
      distanceMeters: D,
      radiusMeters: R,
      accuracyMeters: A,
      isInside: false,
      canPunch: false,
      message: `${userMessage} (Distance: ${Math.round(D)}m, accuracy: ±${Math.round(A)}m, boundary: ${R}m).`,
      userMessage,
      errorCode: 'LOW_GPS_ACCURACY',
      canRequestCorrection: true,
      officeName,
    };
  }

  // Clearly inside: D + A <= R, OR for wide office geofences (R >= 400m, e.g. 500m) when measured coordinates
  // are within the allowed radius (D <= R) and mobile Wi-Fi/cellular triangulation accuracy is reasonable (A <= 2500m, e.g. iOS ±1414m)
  if (D + A <= R || (R >= 400 && D <= R && A <= 2500)) {
    const msg = `Within approved office geofence (${Math.round(D)}m from ${officeName}, allowed: ${R}m, GPS accuracy: ±${Math.round(A)}m).`;
    return {
      classification: 'INSIDE',
      distanceMeters: D,
      radiusMeters: R,
      accuracyMeters: A,
      isInside: true,
      canPunch: true,
      message: msg,
      userMessage: msg,
      errorCode: 'NONE',
      canRequestCorrection: false,
      officeName,
    };
  }

  // Clearly outside: D - A > R
  if (D - A > R) {
    const userMessage = `Your verified location is outside the configured ${R}-metre office boundary.`;
    return {
      classification: 'OUTSIDE',
      distanceMeters: D,
      radiusMeters: R,
      accuracyMeters: A,
      isInside: false,
      canPunch: false,
      message: `${userMessage} (${Math.round(D)}m from ${officeName}, accuracy ±${Math.round(A)}m).`,
      userMessage,
      errorCode: 'OUTSIDE_GEOFENCE',
      canRequestCorrection: false,
      officeName,
    };
  }

  // Uncertain: D - A <= R < D + A
  const isLowAccuracy = A >= 100 || A > R * 0.45;
  const userMessage = isLowAccuracy
    ? `Your location accuracy is currently ${Math.round(A)} metres. Please retry.`
    : `We cannot confirm your position accurately enough yet. Please retry.`;

  return {
    classification: 'UNCERTAIN',
    distanceMeters: D,
    radiusMeters: R,
    accuracyMeters: A,
    isInside: false,
    canPunch: false,
    message: `${userMessage} (Distance: ${Math.round(D)}m, accuracy: ±${Math.round(A)}m, boundary: ${R}m).`,
    userMessage,
    errorCode: isLowAccuracy ? 'LOW_GPS_ACCURACY' : 'GEOFENCE_UNCERTAIN',
    canRequestCorrection: true,
    officeName,
  };
}

let cachedReading: { reading: GpsLocationReading; acquiredAt: number } | null = null;
let activeCleanupFn: (() => void) | null = null;
let activeAcquisitionPromise: Promise<GpsLocationReading> | null = null;
let activeRequestSequence = 0;
let lastDiagnosticSummary: GpsDiagnosticSummary | null = null;

/**
 * Normalizes a browser GeolocationPosition.timestamp into a valid Unix epoch millisecond timestamp.
 *
 * Handles:
 * 1. Standard EpochTimeStamp in milliseconds (>= 1e12)
 * 2. Seconds-based Unix epoch timestamps (1e9 <= ts < 1e12, e.g., iOS Safari / native bridges)
 * 3. Relative DOMHighResTimeStamp in milliseconds since performance.timeOrigin (0 < ts < 1e9)
 * 4. Minor forward GNSS/system clock skew relative to Date.now()
 */
export function normalizeLocationTimestampMs(rawTimestamp: unknown, referenceNowMs: number = Date.now()): number {
  if (rawTimestamp instanceof Date) {
    const ms = rawTimestamp.getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, referenceNowMs) : referenceNowMs;
  }

  const num = typeof rawTimestamp === 'string' ? Number(rawTimestamp) : (rawTimestamp as number);
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) {
    if (typeof rawTimestamp === 'string') {
      const parsed = Date.parse(rawTimestamp);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(parsed, referenceNowMs);
      }
    }
    return referenceNowMs;
  }

  let epochMs: number;
  if (num >= 1e12) {
    // Already Unix epoch milliseconds
    epochMs = Math.round(num);
  } else if (num >= 1e9 && num < 1e12) {
    // Unix epoch seconds -> convert to milliseconds
    epochMs = Math.round(num * 1000);
  } else {
    // Relative DOMHighResTimeStamp (ms since performance.timeOrigin)
    const timeOrigin =
      typeof performance !== 'undefined' &&
      typeof performance.timeOrigin === 'number' &&
      performance.timeOrigin >= 1e12
        ? performance.timeOrigin
        : 0;
    epochMs = timeOrigin > 0 ? Math.round(timeOrigin + num) : referenceNowMs;
  }

  // Clamp minor forward GNSS/device clock drift so a live reading never has a negative or invalid age
  if (epochMs > referenceNowMs) {
    return referenceNowMs;
  }
  return epochMs;
}

/**
 * Computes the age in milliseconds of a geolocation reading relative to referenceNowMs.
 */
export function calculateLocationAgeMs(rawTimestamp: unknown, referenceNowMs: number = Date.now()): {
  normalizedTimestampMs: number;
  ageMs: number;
} {
  const normalizedTimestampMs = normalizeLocationTimestampMs(rawTimestamp, referenceNowMs);
  const ageMs = Math.max(0, referenceNowMs - normalizedTimestampMs);
  return { normalizedTimestampMs, ageMs };
}

export function getLastGpsDiagnosticSummary(): GpsDiagnosticSummary | null {
  return lastDiagnosticSummary;
}

/**
 * Cancels any active GPS watchPosition / acquisition request and cleans up timers.
 */
export function cancelActiveGpsAcquisition(): void {
  activeRequestSequence += 1;
  activeAcquisitionPromise = null;
  if (activeCleanupFn) {
    try {
      activeCleanupFn();
    } catch {
      // Ignore cleanup errors
    }
    activeCleanupFn = null;
  }
}

/**
 * Clears cached GPS reading (used in tests or when forcing a fresh fix).
 */
export function clearCachedGpsReading(): void {
  cachedReading = null;
}

/**
 * Checks browser geolocation permission state where the Permissions API is supported.
 * Note: iOS Safari may not support permissions.query for geolocation, so 'unknown' is returned safely.
 */
export async function checkGpsPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/**
 * Pre-warms GPS hardware silently in the background only if no active acquisition is running.
 * Does not contend with active watchPosition requests.
 */
export function prewarmGps(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  if (activeCleanupFn) return; // Never contend with an active acquisition
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 999;
        const now = Date.now();
        const { normalizedTimestampMs, ageMs } = calculateLocationAgeMs(pos.timestamp, now);
        const devCat = detectBrowserDeviceCategory();
        if (isValidGpsCoordinate(lat, lng) && acc <= 60 && ageMs <= 30000) {
          cachedReading = {
            reading: {
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lng.toFixed(6)),
              accuracy: Math.round(acc * 10) / 10,
              timestamp: normalizedTimestampMs,
              readingAgeMs: ageMs,
              sampleCount: 1,
              durationMs: 0,
              retryCount: 0,
              deviceCategory: devCat,
              browserDeviceCategory: devCat,
            },
            acquiredAt: now,
          };
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 6000 }
    );
  } catch {
    // Silent ignore in prewarm
  }
}

export interface AcquireGpsOptions {
  timeoutMs?: number;
  stageATimeoutMs?: number;
  stageBTimeoutMs?: number;
  desiredAccuracyMeters?: number;
  acceptableAccuracyMeters?: number;
  maxAccuracyMeters?: number;
  maxAcceptableAgeMs?: number;
  maxStaleAgeMs?: number;
  forceFresh?: boolean;
  geofenceContext?: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
    maxAccuracyMeters?: number;
  };
  onProgress?: (progress: GpsAcquisitionProgress) => void;
  attemptNumber?: number;
  maxAttempts?: number;
}

/**
 * Acquires a fresh high-accuracy GPS position using browser geolocation.
 *
 * Key Reliability Guarantees (Phases 3, 4, 6, 7):
 * - Enforces enableHighAccuracy: true and maximumAge: 0 for fresh hardware readings.
 * - Normalizes EpochTimeStamp, seconds-based timestamps, and relative DOMHighResTimeStamp safely.
 * - Uses a bounded acquisition window and settles quickly once inside the office boundary.
 * - Deduplicates concurrent calls so simultaneous requests share a single watchPosition listener.
 * - Guarantees clearWatch() cleanup on completion, error, or cancellation, and ignores obsolete callbacks.
 */
export async function acquireHighAccuracyGps(
  options: AcquireGpsOptions = {}
): Promise<GpsLocationReading> {
  if (activeAcquisitionPromise) {
    return activeAcquisitionPromise;
  }

  const requestSeq = ++activeRequestSequence;
  const timeoutMs = Math.max(50, Math.min(options.timeoutMs ?? 12000, 45000));
  const desiredAccuracyMeters = options.desiredAccuracyMeters ?? 35;
  const acceptableAccuracyMeters = options.acceptableAccuracyMeters ?? 65;
  const maxAcceptableAgeMs = options.maxStaleAgeMs ?? options.maxAcceptableAgeMs ?? 60000;
  const forceFresh = options.forceFresh ?? true;
  const attemptNumber = options.attemptNumber ?? 1;
  const maxAttempts = options.maxAttempts ?? 1;
  const deviceCategory = detectBrowserDeviceCategory();
  const startTime = Date.now();

  // Reuse recent warm reading ONLY if forceFresh is explicitly false and reading is very fresh (<10s)
  if (!forceFresh && cachedReading) {
    const age = Date.now() - cachedReading.acquiredAt;
    if (age < 10000 && cachedReading.reading.accuracy <= desiredAccuracyMeters) {
      return {
        ...cachedReading.reading,
        readingAgeMs: age,
      };
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    const err = new GpsAcquisitionError({
      code: 'POSITION_UNAVAILABLE',
      message: 'Location services appear disabled or unavailable. Please enable GPS/location services and retry.',
      durationMs: 0,
      deviceCategory,
    });
    lastDiagnosticSummary = {
      gpsRequestDurationMs: 0,
      gpsAcquisitionStatus: 'POSITION_UNAVAILABLE',
      reportedAccuracyMeters: null,
      locationReadingAgeMs: null,
      calculatedDistanceMeters: null,
      configuredRadiusMeters: options.geofenceContext?.radiusMeters ?? 250,
      errorCode: 'POSITION_UNAVAILABLE',
      browserDeviceCategory: deviceCategory,
      classification: 'N/A',
      sampleCount: 0,
      retryCount: attemptNumber - 1,
      timestamp: new Date().toISOString(),
    };
    throw err;
  }

  const promise = new Promise<GpsLocationReading>((resolve, reject) => {
    let bestReading: GpsLocationReading | null = null;
    let sampleCount = 0;
    let staleCount = 0;
    let finished = false;
    let watchId: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      finished = true;
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // Ignore clearWatch errors
        }
        watchId = null;
      }
      clearTimeout(deadlineTimer);
      if (activeCleanupFn === cleanup) {
        activeCleanupFn = null;
      }
      if (activeAcquisitionPromise === promise) {
        activeAcquisitionPromise = null;
      }
    };

    activeCleanupFn = cleanup;

    const recordDiagnosticFromReading = (
      reading: GpsLocationReading | null,
      status: GpsDiagnosticSummary['gpsAcquisitionStatus'],
      errorCode: GpsErrorCode
    ) => {
      const ctx = options.geofenceContext;
      let dist: number | null = null;
      let classification: GeofenceClassification | 'N/A' = 'N/A';
      if (reading && ctx && isValidGpsCoordinate(ctx.centerLat, ctx.centerLng)) {
        dist = calculateHaversineMeters(reading.latitude, reading.longitude, ctx.centerLat, ctx.centerLng);
        classification = evaluateGeofenceBoundary(dist, ctx.radiusMeters, reading.accuracy).classification;
      }
      lastDiagnosticSummary = {
        gpsRequestDurationMs: Date.now() - startTime,
        gpsAcquisitionStatus: status,
        reportedAccuracyMeters: reading ? reading.accuracy : null,
        locationReadingAgeMs: reading ? reading.readingAgeMs : null,
        calculatedDistanceMeters: dist,
        configuredRadiusMeters: ctx?.radiusMeters ?? 250,
        errorCode,
        browserDeviceCategory: deviceCategory,
        classification,
        sampleCount,
        retryCount: attemptNumber - 1,
        timestamp: new Date().toISOString(),
      };
    };

    const finishSuccess = (reading: GpsLocationReading) => {
      if (finished || requestSeq !== activeRequestSequence) return;
      cleanup();
      const finalReading: GpsLocationReading = {
        ...reading,
        durationMs: Date.now() - startTime,
        retryCount: attemptNumber - 1,
      };
      cachedReading = {
        reading: finalReading,
        acquiredAt: Date.now(),
      };
      recordDiagnosticFromReading(finalReading, 'SUCCESS', 'NONE');
      resolve(finalReading);
    };

    const finishError = (err: GpsAcquisitionError, status: GpsDiagnosticSummary['gpsAcquisitionStatus']) => {
      if (finished || requestSeq !== activeRequestSequence) return;
      cleanup();
      recordDiagnosticFromReading(bestReading, status, err.code);
      reject(err);
    };

    const deadlineTimer = setTimeout(() => {
      if (finished || requestSeq !== activeRequestSequence) return;
      if (bestReading) {
        finishSuccess(bestReading);
        return;
      }
      if (staleCount > 0) {
        finishError(
          new GpsAcquisitionError({
            code: 'STALE_READING',
            message: 'Location reading was stale. Please retry to obtain a fresh GPS fix.',
            durationMs: Date.now() - startTime,
            sampleCount,
            deviceCategory,
          }),
          'STALE'
        );
        return;
      }
      finishError(
        new GpsAcquisitionError({
          code: 'TIMEOUT',
          message: 'Unable to obtain your location. Please retry with location services enabled.',
          durationMs: Date.now() - startTime,
          sampleCount,
          deviceCategory,
        }),
        'TIMEOUT'
      );
    }, timeoutMs);

    const evaluateReadingBoundary = (reading: GpsLocationReading): GeofenceClassification | null => {
      const ctx = options.geofenceContext;
      if (ctx && isValidGpsCoordinate(ctx.centerLat, ctx.centerLng)) {
        const dist = calculateHaversineMeters(
          reading.latitude,
          reading.longitude,
          ctx.centerLat,
          ctx.centerLng
        );
        return evaluateGeofenceBoundary(dist, ctx.radiusMeters, reading.accuracy, 'Office', ctx.maxAccuracyMeters ?? options.maxAccuracyMeters).classification;
      }
      return null;
    };

    const isReadingGoodEnoughToFinishEarly = (reading: GpsLocationReading): boolean => {
      const classification = evaluateReadingBoundary(reading);
      if (classification !== null) {
        if (classification === 'INSIDE' && reading.accuracy <= desiredAccuracyMeters) {
          return true;
        }
        if (classification === 'OUTSIDE' && reading.accuracy <= desiredAccuracyMeters) {
          return true;
        }
        return reading.accuracy <= 12;
      }

      return reading.accuracy <= desiredAccuracyMeters;
    };

    const handlePosition = (pos: GeolocationPosition) => {
      if (finished || requestSeq !== activeRequestSequence) return;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = typeof pos.coords.accuracy === 'number' && pos.coords.accuracy > 0 ? pos.coords.accuracy : 999;
      const now = Date.now();
      const { normalizedTimestampMs, ageMs } = calculateLocationAgeMs(pos.timestamp, now);

      if (ageMs > maxAcceptableAgeMs) {
        staleCount++;
        return; // Discard stale reading and wait for fresh hardware fix
      }

      if (!isValidGpsCoordinate(lat, lng)) {
        return;
      }

      sampleCount++;
      const currentReading: GpsLocationReading = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy: Math.round(acc * 10) / 10,
        timestamp: normalizedTimestampMs,
        readingAgeMs: ageMs,
        sampleCount,
        durationMs: now - startTime,
        retryCount: attemptNumber - 1,
        deviceCategory,
        browserDeviceCategory: deviceCategory,
      };

      // Prevent an older, less accurate callback from overwriting a newer or sharper reading
      if (
        !bestReading ||
        currentReading.accuracy < bestReading.accuracy ||
        (currentReading.accuracy === bestReading.accuracy && currentReading.timestamp >= bestReading.timestamp)
      ) {
        bestReading = currentReading;
      } else {
        bestReading = {
          ...bestReading,
          sampleCount,
        };
      }

      const activeBest: GpsLocationReading = bestReading;

      if (isReadingGoodEnoughToFinishEarly(activeBest)) {
        finishSuccess(activeBest);
        return;
      }

      // Fast-settle for indoor employees: once a reading is already conclusively INSIDE the office
      // boundary under the conservative rule (D + A <= R — the whole accuracy circle lies inside the
      // geofence), wait briefly for a sharper satellite tick and then resolve.
      // Previously this required accuracy <= 95m, so typical indoor phone fixes of ~100-150m that were
      // already conclusively INSIDE waited for the full acquisition timeout (12s) before resolving.
      // Production evidence (29 Oct): successful punches reported ±99m and ±102m accuracy.
      if (settleTimer === null) {
        const classification = evaluateReadingBoundary(activeBest);
        if (classification === 'INSIDE') {
          const settleWindowMs = activeBest.accuracy <= acceptableAccuracyMeters ? 120 : 250;
          settleTimer = setTimeout(() => {
            if (!finished && requestSeq === activeRequestSequence && bestReading) {
              finishSuccess(bestReading);
            }
          }, settleWindowMs);
        }
      }

      options.onProgress?.({
        phase: 'IMPROVING_ACCURACY',
        message: `Getting Location (±${Math.round(activeBest.accuracy)}m)...`,
        currentAccuracyMeters: Math.round(currentReading.accuracy),
        bestAccuracyMeters: Math.round(activeBest.accuracy),
        sampleCount,
        attempt: attemptNumber,
        maxAttempts,
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      if (finished || requestSeq !== activeRequestSequence) return;

      // Permission denied is fatal — never mask or retry automatically
      if (error.code === 1 /* PERMISSION_DENIED */) {
        finishError(
          new GpsAcquisitionError({
            code: 'PERMISSION_DENIED',
            message: 'Please allow precise location access for BUSINZ HRMS.',
            durationMs: Date.now() - startTime,
            sampleCount,
            deviceCategory,
          }),
          'PERMISSION_DENIED'
        );
        return;
      }

      // If we already collected a valid reading before a subsequent error event, return the best reading
      if (bestReading) {
        finishSuccess(bestReading);
        return;
      }

      const elapsed = Date.now() - startTime;
      // If POSITION_UNAVAILABLE fires early while mobile GNSS is still warming up and we have time left,
      // try a single fallback getCurrentPosition within the remaining window before giving up.
      if (
        error.code === 2 /* POSITION_UNAVAILABLE */ &&
        elapsed < timeoutMs - 2500 &&
        typeof navigator.geolocation.getCurrentPosition === 'function'
      ) {
        try {
          navigator.geolocation.getCurrentPosition(
            handlePosition,
            (fallbackErr) => {
              if (finished) return;
              if (bestReading) {
                finishSuccess(bestReading);
                return;
              }
              const isPerm = fallbackErr.code === 1;
              finishError(
                new GpsAcquisitionError({
                  code: isPerm ? 'PERMISSION_DENIED' : 'POSITION_UNAVAILABLE',
                  message: isPerm
                    ? 'Please allow precise location access for BUSINZ HRMS.'
                    : 'Location services appear disabled or unavailable. Please enable GPS/location services and retry.',
                  durationMs: Date.now() - startTime,
                  sampleCount,
                  deviceCategory,
                }),
                isPerm ? 'PERMISSION_DENIED' : 'POSITION_UNAVAILABLE'
              );
            },
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: Math.max(2000, timeoutMs - elapsed),
            }
          );
          return;
        } catch {
          // Fall through to standard error finish
        }
      }

      const code: GpsErrorCode = error.code === 3 ? 'TIMEOUT' : 'POSITION_UNAVAILABLE';
      finishError(
        new GpsAcquisitionError({
          code,
          message:
            code === 'TIMEOUT'
              ? 'Unable to obtain your location. Please retry with location services enabled.'
              : 'Location services appear disabled or unavailable. Please enable GPS/location services and retry.',
          durationMs: Date.now() - startTime,
          sampleCount,
          deviceCategory,
        }),
        code === 'TIMEOUT' ? 'TIMEOUT' : 'POSITION_UNAVAILABLE'
      );
    };

    options.onProgress?.({
      phase: attemptNumber > 1 ? 'RETRYING' : 'ACQUIRING',
      message: 'Getting Location',
      bestAccuracyMeters: null,
      sampleCount: 0,
      attempt: attemptNumber,
      maxAttempts,
    });

    try {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      });
    } catch {
      navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      });
    }
  });

  activeAcquisitionPromise = promise;
  return promise;
}

/**
 * Acquires high-accuracy GPS with bounded retry logic for transient timeouts or uncertain boundary accuracy.
 *
 * - Never retries PERMISSION_DENIED.
 * - If a reading is classified as UNCERTAIN (e.g., coarse indoor accuracy near the boundary),
 *   automatically requests a fresh location fix up to `maxRetries` times.
 */
export async function acquireGpsWithBoundedRetry(
  options: AcquireGpsOptions & {
    maxRetries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<GpsLocationReading> {
  const maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 3));
  const maxAttempts = maxRetries + 1;
  const retryDelayMs = options.retryDelayMs ?? 250;
  let lastError: unknown = null;
  let bestOverallReading: GpsLocationReading | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const reading = await acquireHighAccuracyGps({
        ...options,
        forceFresh: true,
        attemptNumber: attempt,
        maxAttempts,
      });

      if (!bestOverallReading || reading.accuracy < bestOverallReading.accuracy) {
        bestOverallReading = reading;
      }

      // If geofenceContext is provided, check whether the reading is UNCERTAIN and could benefit from a retry
      if (
        options.geofenceContext &&
        isValidGpsCoordinate(options.geofenceContext.centerLat, options.geofenceContext.centerLng)
      ) {
        const dist = calculateHaversineMeters(
          reading.latitude,
          reading.longitude,
          options.geofenceContext.centerLat,
          options.geofenceContext.centerLng
        );
        const evaluation = evaluateGeofenceBoundary(
          dist,
          options.geofenceContext.radiusMeters,
          reading.accuracy
        );

        // Only spend a second full acquisition window when the first window produced too few samples
        // to be meaningful. If the device already streamed several fixes for the whole window and the
        // position is still UNCERTAIN, an immediate second window almost never improves indoor accuracy
        // and only doubles the employee's wait (previously 12s + 12s).
        if (evaluation.classification === 'UNCERTAIN' && attempt < maxAttempts && reading.sampleCount < 3) {
          options.onProgress?.({
            phase: 'RETRYING',
            message: 'Getting Location',
            currentAccuracyMeters: Math.round(reading.accuracy),
            bestAccuracyMeters: Math.round(reading.accuracy),
            sampleCount: reading.sampleCount,
            attempt: attempt + 1,
            maxAttempts,
          });
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
      }

      return bestOverallReading;
    } catch (err: any) {
      lastError = err;
      // Never retry permission denied
      if (err instanceof GpsAcquisitionError && err.code === 'PERMISSION_DENIED') {
        throw err;
      }
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('allow precise location')) {
        throw err;
      }

      if (attempt < maxAttempts) {
        options.onProgress?.({
          phase: 'RETRYING',
          message: 'Getting Location',
          bestAccuracyMeters: null,
          sampleCount: 0,
          attempt: attempt + 1,
          maxAttempts,
        });
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
    }
  }

  if (bestOverallReading) {
    return bestOverallReading;
  }

  throw lastError instanceof Error
    ? lastError
    : new GpsAcquisitionError({
        code: 'TIMEOUT',
        message: 'Unable to obtain your location. Please retry with location services enabled.',
        durationMs: options.timeoutMs ?? 12000,
      });
}


export interface MobileLocationInstructionSet {
  title: string;
  summary: string;
  androidSteps: string[];
  iphoneSteps: string[];
}

/**
 * Returns clear Android Chrome and iPhone Safari step-by-step instructions for GPS permission,
 * disabled location services, GPS timeout, or disabled Precise Location.
 */
export function getMobileLocationInstructions(
  errorCode: GpsErrorCode = 'PERMISSION_DENIED',
  _deviceCategory?: string
): MobileLocationInstructionSet {
  if (errorCode === 'LOW_GPS_ACCURACY' || errorCode === 'GEOFENCE_UNCERTAIN') {
    return {
      title: 'Precise Location Required',
      summary: 'Your browser returned an approximate location with low accuracy. Turn on Precise Location and retry.',
      androidSteps: [
        'Tap the Site Settings / Lock icon next to hrms.businz.com in Chrome.',
        'Tap Permissions → Location → Allow.',
        'Open Android Settings → Apps → Chrome → Permissions → Location → Select "Allow only while using the app" and turn ON "Use precise location".',
        'Return here and tap "Retry Location".'
      ],
      iphoneSteps: [
        'Open iPhone Settings → Privacy & Security → Location Services (ensure ON).',
        'Scroll down to Safari Websites (or Chrome) → Select "While Using the App".',
        'Toggle ON "Precise Location".',
        'Return to Safari/Chrome and tap "Retry Location".'
      ]
    };
  }

  if (errorCode === 'POSITION_UNAVAILABLE' || errorCode === 'TIMEOUT' || errorCode === 'STALE_READING') {
    return {
      title: 'GPS Signal Unavailable or Timed Out',
      summary: 'Your device could not acquire a fresh satellite/Wi-Fi GPS lock in time.',
      androidSteps: [
        'Swipe down your quick settings panel and ensure "Location" is turned ON.',
        'Open Android Settings → Location → Location Services → Turn ON "Google Location Accuracy".',
        'Move near a window or open area and tap "Retry Location".'
      ],
      iphoneSteps: [
        'Open iPhone Settings → Privacy & Security → Location Services and ensure it is turned ON.',
        'Ensure Wi-Fi is turned ON (improves indoor GPS triangulation) and Airplane Mode is OFF.',
        'Tap "Retry Location" below for a fresh GPS reading.'
      ]
    };
  }

  return {
    title: 'Allow Precise Location Access for BUSINZ HRMS',
    summary: 'Browser or system location permission is currently blocked or set to approximate location.',
    androidSteps: [
      'In Android Chrome, tap the tune/lock icon on the left side of the address bar.',
      'Tap "Permissions" → "Location" → Select "Allow" (or tap Reset permission).',
      'In Android Settings → Apps → Chrome → Permissions → Location, enable "Use precise location".',
      'Tap "Retry Location" below.'
    ],
    iphoneSteps: [
      'Open iPhone Settings → Privacy & Security → Location Services (turn ON).',
      'Tap "Safari Websites" → Select "While Using the App" and turn ON "Precise Location".',
      'In Safari, tap the "aA" or page settings icon in the address bar → Website Settings → Location → Select "Allow".',
      'Tap "Retry Location" below.'
    ]
  };
}

let activeFreshRequestPromise: Promise<GpsLocationReading> | null = null;

/**
 * Returns the cached GPS reading only if its age, accuracy, and coordinate integrity satisfy the policy.
 */
export function getCachedFreshGpsReading(
  maxAgeMs: number = 45000,
  maxAccuracyMeters?: number,
  geofenceContext?: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
    maxAccuracyMeters?: number;
  }
): GpsLocationReading | null {
  if (!cachedReading) return null;
  const now = Date.now();
  const elapsedSinceAcquire = Math.max(0, now - cachedReading.acquiredAt);
  const totalAgeMs = Math.max(elapsedSinceAcquire, now - cachedReading.reading.timestamp);
  if (totalAgeMs > maxAgeMs) return null;
  const reading = cachedReading.reading;
  if (!isValidGpsCoordinate(reading.latitude, reading.longitude)) return null;
  const effectiveMaxAcc =
    maxAccuracyMeters ??
    geofenceContext?.maxAccuracyMeters ??
    ((geofenceContext?.radiusMeters ?? 0) >= 400 ? 2500 : 225);
  if (reading.accuracy > effectiveMaxAcc) return null;

  if (geofenceContext && isValidGpsCoordinate(geofenceContext.centerLat, geofenceContext.centerLng)) {
    const dist = calculateHaversineMeters(
      reading.latitude,
      reading.longitude,
      geofenceContext.centerLat,
      geofenceContext.centerLng
    );
    const evalRes = evaluateGeofenceBoundary(
      dist,
      geofenceContext.radiusMeters,
      reading.accuracy,
      'Office',
      geofenceContext.maxAccuracyMeters ?? maxAccuracyMeters
    );
    if (evalRes.classification !== 'INSIDE') {
      return null;
    }
  }

  return {
    ...reading,
    readingAgeMs: totalAgeMs,
    durationMs: 0
  };
}

/**
 * Two-Stage GPS Acquisition Strategy (Stage A: Fast 8s acquisition -> Stage B: Controlled 12s single retry).
 *
 * Stage A — Fast acquisition:
 * - Requests a fresh GPS reading (enableHighAccuracy: true, maximumAge: 0) with configurable timeout (default 8000ms).
 * - Immediately resolves if accuracy and freshness satisfy the configured security policy.
 *
 * Stage B — Controlled retry:
 * - If Stage A times out or returns an uncertain fix, attempts ONE controlled retry (default 12000ms).
 * - Cleans up location watchers and pending operations, prevents duplicate requests across React re-renders,
 *   never reuses stale coordinates, and prevents late responses from overwriting newer state.
 */
export async function requestFreshGpsPosition(
  options: AcquireGpsOptions & {
    maxRetries?: number;
    stageATimeoutMs?: number;
    stageBTimeoutMs?: number;
    maxAccuracyMeters?: number;
    reuseRecentFix?: boolean;
    maxRecentFixAgeMs?: number;
    deduplicateInFlight?: boolean;
  } = {}
): Promise<GpsLocationReading> {
  // Reuse a recent verified GPS fix if requested and its age, accuracy, and geofence integrity satisfy policy
  if (options.reuseRecentFix) {
    const maxRecentAge = options.maxRecentFixAgeMs ?? 45000;
    const maxAcc = options.maxAccuracyMeters ?? (options.geofenceContext as any)?.maxAccuracyMeters;
    const recent = getCachedFreshGpsReading(maxRecentAge, maxAcc, options.geofenceContext);
    if (recent) {
      return recent;
    }
  }

  // Deduplicate overlapping requests within the same attendance attempt
  if (options.deduplicateInFlight && activeFreshRequestPromise) {
    return activeFreshRequestPromise;
  }

  cancelActiveGpsAcquisition();
  if (!options.reuseRecentFix) {
    clearCachedGpsReading();
  }

  const runAcquisition = async (): Promise<GpsLocationReading> => {
    const stageATimeoutMs = Math.max(
      250,
      Math.min(options.stageATimeoutMs ?? options.timeoutMs ?? 8000, 20000)
    );
    const stageBTimeoutMs = Math.max(
      250,
      Math.min(options.stageBTimeoutMs ?? options.timeoutMs ?? 12000, 30000)
    );
    const allowStageBRetry = (options.maxRetries ?? 1) >= 1;
    const maxAttempts = allowStageBRetry ? 2 : 1;
    const desiredAccuracy = options.desiredAccuracyMeters ?? 35;
    const maxStaleAgeMs = options.maxStaleAgeMs ?? options.maxAcceptableAgeMs ?? 60000;
    const maxAccuracyCap =
      options.maxAccuracyMeters ?? (options.geofenceContext as any)?.maxAccuracyMeters;
    const deviceCategory = detectBrowserDeviceCategory();
    const startTime = Date.now();
    const stageSeq = activeRequestSequence + 1;

    let stageAReading: GpsLocationReading | null = null;

    // Stage A — Fast Acquisition (initial 8s configurable window)
    if (
      typeof navigator !== 'undefined' &&
      navigator.geolocation &&
      typeof navigator.geolocation.getCurrentPosition === 'function'
    ) {
      try {
        options.onProgress?.({
          phase: 'ACQUIRING',
          message: 'Getting GPS Location...',
          bestAccuracyMeters: null,
          sampleCount: 0,
          attempt: 1,
          maxAttempts
        });

        const directFix = await new Promise<GeolocationPosition>((resolve, reject) => {
          let settled = false;
          let indoorFallbackTimer: ReturnType<typeof setTimeout> | null = null;
          const clearStageATimers = () => {
            clearTimeout(timer);
            if (indoorFallbackTimer !== null) {
              clearTimeout(indoorFallbackTimer);
              indoorFallbackTimer = null;
            }
          };
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            clearStageATimers();
            reject({ code: 3, message: 'Stage A GPS acquisition timed out' });
          }, stageATimeoutMs + 100);

          // If hardware satellite GNSS stalls indoors under a roof for >2.5s,
          // query Wi-Fi/5G fused location in parallel, and accept it if its position satisfies the geofence policy.
          if (stageATimeoutMs >= 4000) {
            indoorFallbackTimer = setTimeout(() => {
              if (settled || activeRequestSequence >= stageSeq) return;
              try {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    if (settled) return;
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const acc =
                      typeof pos.coords.accuracy === 'number' && pos.coords.accuracy > 0
                        ? pos.coords.accuracy
                        : 999;
                    const { ageMs } = calculateLocationAgeMs(pos.timestamp, Date.now());
                    if (!isValidGpsCoordinate(lat, lng) || ageMs > maxStaleAgeMs) {
                      return; // Do not preempt primary high-accuracy request
                    }
                    if (
                      options.geofenceContext &&
                      isValidGpsCoordinate(options.geofenceContext.centerLat, options.geofenceContext.centerLng)
                    ) {
                      const dist = calculateHaversineMeters(
                        lat,
                        lng,
                        options.geofenceContext.centerLat,
                        options.geofenceContext.centerLng
                      );
                      const evalRes = evaluateGeofenceBoundary(
                        dist,
                        options.geofenceContext.radiusMeters,
                        acc,
                        'Office',
                        maxAccuracyCap
                      );
                      if (evalRes.classification !== 'INSIDE') {
                        return; // Keep waiting for primary high-accuracy GNSS callback
                      }
                    } else if (acc > (maxAccuracyCap ?? 120)) {
                      return; // Keep waiting for primary high-accuracy GNSS callback
                    }
                    settled = true;
                    clearStageATimers();
                    resolve(pos);
                  },
                  () => {
                    // Let primary high-accuracy request or deadline timer decide
                  },
                  {
                    enableHighAccuracy: false,
                    maximumAge: 15000,
                    timeout: Math.max(1500, stageATimeoutMs - 2500)
                  }
                );
              } catch {
                // Ignore
              }
            }, 2500);
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (settled) return;
              settled = true;
              clearStageATimers();
              resolve(pos);
            },
            (err) => {
              if (settled) return;
              settled = true;
              clearStageATimers();
              reject(err);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: stageATimeoutMs
            }
          );
        });

      // Ignore late response if a newer GPS request has started
      if (activeRequestSequence >= stageSeq) {
        throw new GpsAcquisitionError({
          code: 'TIMEOUT',
          message: 'Obsolete GPS response ignored.',
          durationMs: Date.now() - startTime,
          sampleCount: 0,
          deviceCategory
        });
      }

      const lat = directFix.coords.latitude;
      const lng = directFix.coords.longitude;
      const acc =
        typeof directFix.coords.accuracy === 'number' && directFix.coords.accuracy > 0
          ? directFix.coords.accuracy
          : 999;
      const now = Date.now();
      const { normalizedTimestampMs, ageMs } = calculateLocationAgeMs(directFix.timestamp, now);

      if (isValidGpsCoordinate(lat, lng) && ageMs <= maxStaleAgeMs) {
        const reading: GpsLocationReading = {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          accuracy: Math.round(acc * 10) / 10,
          timestamp: normalizedTimestampMs,
          readingAgeMs: ageMs,
          sampleCount: 1,
          durationMs: now - startTime,
          retryCount: 0,
          deviceCategory,
          browserDeviceCategory: deviceCategory
        };
        stageAReading = reading;

        // Immediately resolve if accuracy and freshness satisfy the configured security policy
        if (
          options.geofenceContext &&
          isValidGpsCoordinate(options.geofenceContext.centerLat, options.geofenceContext.centerLng)
        ) {
          const dist = calculateHaversineMeters(
            reading.latitude,
            reading.longitude,
            options.geofenceContext.centerLat,
            options.geofenceContext.centerLng
          );
          const evalRes = evaluateGeofenceBoundary(
            dist,
            options.geofenceContext.radiusMeters,
            reading.accuracy,
            'Office',
            maxAccuracyCap
          );
          if (
            evalRes.classification === 'INSIDE' ||
            (evalRes.classification === 'OUTSIDE' && reading.accuracy <= 100) ||
            (reading.accuracy <= desiredAccuracy && evalRes.errorCode !== 'LOW_GPS_ACCURACY')
          ) {
            cachedReading = { reading, acquiredAt: now };
            return reading;
          }
        } else if (
          reading.accuracy <= desiredAccuracy &&
          (maxAccuracyCap === undefined || reading.accuracy <= maxAccuracyCap)
        ) {
          cachedReading = { reading, acquiredAt: now };
          return reading;
        }
      }
    } catch (err: any) {
      if (err && err.code === 1 /* PERMISSION_DENIED */) {
        throw new GpsAcquisitionError({
          code: 'PERMISSION_DENIED',
          message: 'Please allow precise location access for BUSINZ HRMS.',
          durationMs: Date.now() - startTime,
          sampleCount: 0,
          deviceCategory
        });
      }
      if (!allowStageBRetry) {
        throw new GpsAcquisitionError({
          code: err?.code === 2 ? 'POSITION_UNAVAILABLE' : 'TIMEOUT',
          message:
            err?.code === 2
              ? 'Location services appear disabled or unavailable. Please enable GPS/location services and retry.'
              : 'Unable to obtain your location. Please retry with location services enabled.',
          durationMs: Date.now() - startTime,
          sampleCount: 0,
          deviceCategory
        });
      }
    }
  }

  if (!allowStageBRetry && stageAReading) {
    return stageAReading;
  }

  // Stage B — Controlled Single Retry (12s configurable window, maxRetries: 0 so we never exceed 1 retry)
  options.onProgress?.({
    phase: 'RETRYING',
    message: stageAReading ? 'Improving GPS Accuracy...' : 'Getting GPS Location...',
    currentAccuracyMeters: stageAReading ? Math.round(stageAReading.accuracy) : undefined,
    bestAccuracyMeters: stageAReading ? Math.round(stageAReading.accuracy) : null,
    sampleCount: stageAReading ? 1 : 0,
    attempt: 2,
    maxAttempts: 2
  });

  try {
    const stageBReading = await acquireHighAccuracyGps({
      ...options,
      timeoutMs: stageBTimeoutMs,
      forceFresh: true,
      attemptNumber: 2,
      maxAttempts: 2
    });
    if (stageAReading && stageAReading.accuracy < stageBReading.accuracy) {
      return {
        ...stageAReading,
        durationMs: Date.now() - startTime,
        retryCount: 1,
        sampleCount: stageBReading.sampleCount + 1
      };
    }
    return {
      ...stageBReading,
      durationMs: Date.now() - startTime,
      retryCount: 1
    };
    } catch (stageBErr: any) {
      if (stageAReading && stageBErr?.code !== 'PERMISSION_DENIED') {
        return {
          ...stageAReading,
          durationMs: Date.now() - startTime,
          retryCount: 1
        };
      }
      throw stageBErr;
    }
  };

  const promise = runAcquisition().finally(() => {
    if (activeFreshRequestPromise === promise) {
      activeFreshRequestPromise = null;
    }
  });
  activeFreshRequestPromise = promise;
  return promise;
}
