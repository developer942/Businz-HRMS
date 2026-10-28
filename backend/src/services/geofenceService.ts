// ==============================================================================
// VRM Enterprise HRMS — Geofence & GPS Accuracy Engine
// Strict geodesic distance calculation and uncertainty classification
// ==============================================================================

export type GeofenceClassification = 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN';

export interface GeofenceEvaluation {
  classification: GeofenceClassification;
  distanceMeters: number;
  radiusMeters: number;
  accuracyMeters: number;
  isInside: boolean;
  canPunch: boolean;
  reason: string;
  officeName?: string;
}

export interface GeofenceValidationOptions {
  userLat: number;
  userLng: number;
  officeLat: number;
  officeLng: number;
  radiusMeters: number;
  accuracyMeters?: number;
  locationTimestamp?: string | number | Date;
  officeName?: string;
  maxStaleSeconds?: number;
}

/**
 * Calculates Great-Circle geodesic distance between two coordinate points in meters using Haversine formula.
 * Earth mean radius = 6,371,000 meters (WGS84 spherical approximation).
 */
export function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
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
 * Validates coordinate numbers and bounds.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // Null Island check (0, 0)
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

/**
 * Evaluates whether an employee is inside, outside, or uncertain relative to geofence.
 *
 * Rules (Phase 5):
 * - D = calculated distance between office center and employee location
 * - R = configured geofence radius in meters
 * - A = device-reported GPS accuracy radius in meters
 *
 * Classification:
 * - Clearly inside:  D + A <= R
 * - Clearly outside: D - A > R
 * - Uncertain:       Neither condition satisfied
 */
export function evaluateGeofenceBoundary(
  distanceMeters: number,
  radiusMeters: number,
  accuracyMeters: number = 15,
  officeName: string = 'Office'
): GeofenceEvaluation {
  const D = Math.round(distanceMeters * 10) / 10;
  const R = Math.round(radiusMeters);
  const A = Math.max(0, Math.round((accuracyMeters || 15) * 10) / 10);

  // Clearly inside: D + A <= R
  if (D + A <= R) {
    return {
      classification: 'INSIDE',
      distanceMeters: D,
      radiusMeters: R,
      accuracyMeters: A,
      isInside: true,
      canPunch: true,
      reason: `Within approved office geofence (${D}m from ${officeName}, allowed: ${R}m, GPS accuracy: ±${A}m).`,
      officeName,
    };
  }

  // Clearly outside: D - A > R
  if (D - A > R) {
    return {
      classification: 'OUTSIDE',
      distanceMeters: D,
      radiusMeters: R,
      accuracyMeters: A,
      isInside: false,
      canPunch: false,
      reason: `Outside Office Geofence! You are ${D}m away from ${officeName} (Allowed radius: ${R}m). Attendance cannot be punched outside the designated office boundary.`,
      officeName,
    };
  }

  // Uncertain: Neither condition satisfied
  return {
    classification: 'UNCERTAIN',
    distanceMeters: D,
    radiusMeters: R,
    accuracyMeters: A,
    isInside: false,
    canPunch: false,
    reason: `GPS accuracy insufficient to confirm boundary. Your estimated distance from ${officeName} is ${D}m with ±${A}m GPS uncertainty (Allowed radius: ${R}m). Please move to an open area with a clear sky view and retry.`,
    officeName,
  };
}

/**
 * Comprehensive Geofence verification for attendance punch.
 * Checks coordinate validity, staleness, distance, and boundary classification.
 */
export function verifyPunchGeofence(opts: GeofenceValidationOptions): {
  valid: boolean;
  evaluation?: GeofenceEvaluation;
  error?: string;
  statusCode?: number;
} {
  const {
    userLat,
    userLng,
    officeLat,
    officeLng,
    radiusMeters,
    accuracyMeters = 15,
    locationTimestamp,
    officeName = 'Office',
    maxStaleSeconds = 90,
  } = opts;

  // 1. Verify user coordinates
  if (!isValidCoordinate(userLat, userLng)) {
    return {
      valid: false,
      error: 'Invalid or missing device GPS coordinates. Please ensure location services are active.',
      statusCode: 422,
    };
  }

  // 2. Verify office coordinates
  if (!isValidCoordinate(officeLat, officeLng)) {
    return {
      valid: false,
      error: 'Office geofence has not been configured correctly. Please contact HR.',
      statusCode: 500,
    };
  }

  // 3. Verify freshness of location reading if timestamp is provided
  if (locationTimestamp) {
    const readingTime = new Date(locationTimestamp).getTime();
    if (!isNaN(readingTime)) {
      const now = Date.now();
      const ageSeconds = (now - readingTime) / 1000;
      if (ageSeconds > maxStaleSeconds) {
        return {
          valid: false,
          error: `Stale GPS coordinates detected (${Math.round(ageSeconds)}s old). Please refresh your GPS location to acquire a current reading.`,
          statusCode: 422,
        };
      }
    }
  }

  // 4. Calculate geodesic distance on server
  const distance = calculateHaversineMeters(userLat, userLng, officeLat, officeLng);

  // 5. Evaluate boundary classification (Phase 5)
  const evaluation = evaluateGeofenceBoundary(distance, radiusMeters, accuracyMeters, officeName);

  if (!evaluation.canPunch) {
    return {
      valid: false,
      evaluation,
      error: evaluation.reason,
      statusCode: 422,
    };
  }

  return {
    valid: true,
    evaluation,
  };
}
