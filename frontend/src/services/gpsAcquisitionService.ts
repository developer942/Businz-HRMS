// ==============================================================================
// VRM Enterprise HRMS — High-Accuracy GPS Acquisition & Geofence Service
// Multi-sampling GPS acquisition, stale reading rejection, and Phase 5 evaluation
// ==============================================================================

export type GeofenceClassification = 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN';

export interface GpsLocationReading {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters (radius of 68% confidence)
  timestamp: number; // epoch ms
  sampleCount: number;
}

export interface GeofenceEvaluation {
  classification: GeofenceClassification;
  distanceMeters: number;
  radiusMeters: number;
  accuracyMeters: number;
  isInside: boolean;
  canPunch: boolean;
  message: string;
  officeName: string;
}

/**
 * Calculates Great-Circle geodesic distance between two points in meters using Haversine formula.
 * Earth mean radius = 6,371,000 meters.
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
 * Evaluates whether an employee is inside, outside, or uncertain relative to geofence.
 *
 * Mathematical Classification (Phase 5):
 * - D = calculated distance between office center and employee location
 * - R = configured geofence radius in meters
 * - A = device-reported GPS accuracy radius in meters
 *
 * Rules:
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
      message: `Within approved office geofence (${D}m from ${officeName}, allowed: ${R}m, GPS accuracy: ±${A}m).`,
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
      message: `Outside Office Geofence! You are ${D}m away from ${officeName} (Allowed radius: ${R}m). Attendance cannot be punched outside the designated office boundary.`,
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
    message: `GPS accuracy insufficient to confirm boundary. Your estimated distance is ${D}m with ±${A}m uncertainty (Allowed radius: ${R}m). Please move to an open area with a clear sky view and retry.`,
    officeName,
  };
}

let cachedReading: { reading: GpsLocationReading; acquiredAt: number } | null = null;

/**
 * Pre-warms GPS hardware silently in the background when Attendance opens.
 * Obtains an initial satellite fix so subsequent punch requests resolve in milliseconds.
 */
export function prewarmGps(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 999;
        const ts = pos.timestamp || Date.now();
        if (!isNaN(lat) && !isNaN(lng) && acc <= 50) {
          cachedReading = {
            reading: {
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lng.toFixed(6)),
              accuracy: Math.round(acc * 10) / 10,
              timestamp: ts,
              sampleCount: 1,
            },
            acquiredAt: Date.now(),
          };
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 4000 }
    );
  } catch {
    // Silent ignore in prewarm
  }
}

/**
 * Acquires a high-accuracy GPS position using the HTML5 Geolocation API.
 * Uses multi-sampling with watchPosition / getCurrentPosition to discard coarse initial fixes
 * and lock onto the best satellite accuracy reading within bounded timeout (Phase 5).
 *
 * Rejection rules:
 * - Reject stale positions (> 15s old)
 * - Reject Null Island (0,0) or NaN coordinates
 * - Enforce enableHighAccuracy: true, maximumAge: 0
 */
export async function acquireHighAccuracyGps(
  options: {
    timeoutMs?: number;
    desiredAccuracyMeters?: number;
    maxSamples?: number;
    forceFresh?: boolean;
  } = {}
): Promise<GpsLocationReading> {
  const timeoutMs = options.timeoutMs ?? 4500;
  const desiredAccuracyMeters = options.desiredAccuracyMeters ?? 20;
  const maxSamples = options.maxSamples ?? 3;
  const forceFresh = options.forceFresh ?? false;

  // If a warm, high-accuracy GPS fix was acquired within last 15 seconds, return immediately
  if (!forceFresh && cachedReading) {
    const age = Date.now() - cachedReading.acquiredAt;
    if (age < 15000 && cachedReading.reading.accuracy <= desiredAccuracyMeters) {
      return cachedReading.reading;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser or device.');
  }

  return new Promise<GpsLocationReading>((resolve, reject) => {
    let bestReading: GpsLocationReading | null = null;
    let sampleCount = 0;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      clearTimeout(timer);
    };

    const finishSuccess = (reading: GpsLocationReading) => {
      if (finished) return;
      cleanup();
      cachedReading = {
        reading,
        acquiredAt: Date.now(),
      };
      resolve(reading);
    };

    const finishError = (err: Error) => {
      if (finished) return;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      if (bestReading) {
        finishSuccess(bestReading);
      } else {
        finishError(new Error('GPS location request timed out. Please ensure GPS is active and retry in an open area.'));
      }
    }, timeoutMs);

    const handlePosition = (pos: GeolocationPosition) => {
      if (finished) return;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy || 999;
      const ts = pos.timestamp || Date.now();

      // Check staleness: discard reading if older than 15 seconds
      const ageMs = Date.now() - ts;
      if (ageMs > 15000) {
        return; // ignore stale cached reading
      }

      // Check bounds & Null Island
      if (
        isNaN(lat) ||
        isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180 ||
        (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
      ) {
        return;
      }

      sampleCount++;
      const currentReading: GpsLocationReading = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy: Math.round(acc * 10) / 10,
        timestamp: ts,
        sampleCount,
      };

      if (!bestReading || currentReading.accuracy < bestReading.accuracy) {
        bestReading = currentReading;
      }

      // If we achieved desired accuracy (<= desiredAccuracyMeters) or reached max samples
      if (bestReading.accuracy <= desiredAccuracyMeters || sampleCount >= maxSamples) {
        finishSuccess(bestReading);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      if (finished) return;

      // If we already have a reading, return the best we have
      if (bestReading) {
        finishSuccess(bestReading);
        return;
      }

      let errorMsg = 'Failed to retrieve GPS location.';
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = 'Location permission is disabled. Please enable location access in browser settings.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = 'Device GPS / Location is turned OFF. Please turn ON location on your phone or PC.';
      } else if (error.code === error.TIMEOUT) {
        errorMsg = 'GPS location request timed out. Please move to an open area and retry.';
      }
      finishError(new Error(errorMsg));
    };

    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: timeoutMs,
        }
      );
    } catch {
      // Fallback to single getCurrentPosition if watchPosition fails
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: timeoutMs,
        }
      );
    }
  });
}
