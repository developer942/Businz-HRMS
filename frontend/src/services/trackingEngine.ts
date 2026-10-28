// ============================================================================
// VRM Enterprise HRM — Battery-Efficient GPS Tracking & Distance Engine
// ============================================================================

import { FieldAssignment, LocationPoint, FieldVisitDistanceSegment } from '../types/tracking';

/**
 * Calculates Great-Circle distance in meters between two GPS coordinates using the Haversine formula.
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
 * Converts meters to kilometers rounded to 2 decimal places.
 */
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

/**
 * Formats a KM number to string with 2 decimal places and 'KM' suffix (e.g. "46.28 KM").
 */
export function formatKm(km: number): string {
  return `${(Number(km) || 0).toFixed(2)} KM`;
}

export interface ClientPointValidationResult {
  valid: boolean;
  distanceMeters: number;
  timeDeltaSeconds: number;
  calculatedSpeedKmh: number;
  isStationary: boolean;
  isGap: boolean;
  reason?: string;
}

/**
 * Validates whether a new location point is valid or should be filtered/flagged.
 * Enforces accuracy threshold (<=45m), duplicate check, stationary drift suppression, and jump filter.
 */
export function isValidMovementPoint(
  prevPoint: LocationPoint | null,
  newLat: number,
  newLng: number,
  accuracyMeters: number = 15,
  timestampMs: number = Date.now()
): ClientPointValidationResult {
  // Discard invalid bounds
  if (
    typeof newLat !== 'number' ||
    typeof newLng !== 'number' ||
    isNaN(newLat) ||
    isNaN(newLng) ||
    newLat < -90 ||
    newLat > 90 ||
    newLng < -180 ||
    newLng > 180 ||
    (Math.abs(newLat) < 0.0001 && Math.abs(newLng) < 0.0001)
  ) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      reason: 'Invalid coordinates'
    };
  }

  // Discard overly inaccurate readings (> 45m)
  if (accuracyMeters > 45) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      reason: `Low GPS accuracy (${Math.round(accuracyMeters)}m > 45m)`
    };
  }

  if (!prevPoint) {
    return {
      valid: true,
      distanceMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false
    };
  }

  const prevTimeMs = new Date(prevPoint.recordedAt).getTime();
  const timeDeltaSeconds = Math.max(0, (timestampMs - prevTimeMs) / 1000);

  // Reject backward timestamps
  if (timestampMs < prevTimeMs - 5000) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      reason: 'Out-of-order timestamp'
    };
  }

  const distanceMeters = calculateHaversineMeters(
    prevPoint.latitude,
    prevPoint.longitude,
    newLat,
    newLng
  );

  // Duplicate suppression
  if (distanceMeters < 1 && timeDeltaSeconds <= 3) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: true,
      isGap: false,
      reason: 'Duplicate GPS fix'
    };
  }

  // Calculate speed
  const speedKmh = timeDeltaSeconds > 0 ? (distanceMeters / timeDeltaSeconds) * 3.6 : 0;

  // Stationary drift suppression (< 12 meters and speed < 3 km/h)
  if (distanceMeters < 12 && speedKmh < 3.0) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: speedKmh,
      isStationary: true,
      isGap: false,
      reason: 'Stationary GPS drift (<12m)'
    };
  }

  // Jump filter: reject speeds higher than 130 km/h
  if (timeDeltaSeconds > 0 && speedKmh > 130) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: speedKmh,
      isStationary: false,
      isGap: false,
      reason: `Unrealistic GPS jump (${Math.round(speedKmh)} km/h > 130 km/h)`
    };
  }

  const isGap = timeDeltaSeconds >= 180 && distanceMeters >= 200;

  return {
    valid: true,
    distanceMeters,
    timeDeltaSeconds,
    calculatedSpeedKmh: Math.round(speedKmh * 10) / 10,
    isStationary: false,
    isGap
  };
}

/**
 * Calculates road network estimate for distance between two points based on urban road tortuosity.
 */
export function estimateRoadDistanceMeters(haversineMeters: number): number {
  if (haversineMeters <= 50) return haversineMeters;
  if (haversineMeters <= 500) return Math.round(haversineMeters * 1.18);
  if (haversineMeters <= 2000) return Math.round(haversineMeters * 1.25);
  return Math.round(haversineMeters * 1.32);
}

/**
 * Calculates the total cumulative travel distance across sequential GPS points,
 * properly segregating recorded continuous segments from background signal gaps.
 */
export function calculateSequentialRouteMetrics(points: LocationPoint[]): {
  recordedDistanceMeters: number;
  roadMatchedDistanceMeters: number;
  unverifiedDistanceMeters: number;
  totalKm: number;
  segments: FieldVisitDistanceSegment[];
} {
  if (!points || points.length < 2) {
    return {
      recordedDistanceMeters: 0,
      roadMatchedDistanceMeters: 0,
      unverifiedDistanceMeters: 0,
      totalKm: 0,
      segments: []
    };
  }

  let recordedMeters = 0;
  let unverifiedMeters = 0;
  let roadMatchedMeters = 0;
  const segments: FieldVisitDistanceSegment[] = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (curr.isRejected) continue;

    const dist = calculateHaversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    const prevTime = new Date(prev.recordedAt).getTime();
    const currTime = new Date(curr.recordedAt).getTime();
    const timeDelta = Math.max(0, (currTime - prevTime) / 1000);

    // Ignore extreme jumps > 50km
    if (dist > 50000) continue;

    const isGap = timeDelta >= 180 && dist >= 200;

    if (isGap) {
      // Missing GPS / backgrounded gap
      unverifiedMeters += dist;
      const roadEst = estimateRoadDistanceMeters(dist);
      roadMatchedMeters += roadEst;

      segments.push({
        id: `seg-${i}`,
        tripId: curr.tripId,
        segmentType: 'unverified_gap',
        startLat: prev.latitude,
        startLng: prev.longitude,
        endLat: curr.latitude,
        endLng: curr.longitude,
        distanceMeters: dist,
        durationSeconds: Math.round(timeDelta),
        createdAt: curr.recordedAt
      });
    } else {
      // Continuous verified recorded points
      recordedMeters += dist;
      roadMatchedMeters += dist;

      segments.push({
        id: `seg-${i}`,
        tripId: curr.tripId,
        segmentType: 'recorded',
        startLat: prev.latitude,
        startLng: prev.longitude,
        endLat: curr.latitude,
        endLng: curr.longitude,
        distanceMeters: dist,
        durationSeconds: Math.round(timeDelta),
        createdAt: curr.recordedAt
      });
    }
  }

  const totalKm = metersToKm(roadMatchedMeters > 0 ? roadMatchedMeters : recordedMeters);

  return {
    recordedDistanceMeters: Math.round(recordedMeters),
    roadMatchedDistanceMeters: Math.round(roadMatchedMeters),
    unverifiedDistanceMeters: Math.round(unverifiedMeters),
    totalKm,
    segments
  };
}

/**
 * Backward compatible helper for total KM
 */
export function calculateSequentialRouteKm(points: LocationPoint[]): number {
  return calculateSequentialRouteMetrics(points).totalKm;
}

/**
 * Verifies if current time strictly falls within the approved duty schedule.
 */
export function isTrackingScheduleActive(assignment: FieldAssignment, now: Date = new Date()): boolean {
  if (!assignment.trackingRequired || assignment.status === 'Cancelled' || assignment.status === 'Completed') {
    return false;
  }

  const todayStr = now.toISOString().split('T')[0];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (assignment.startTime || '09:00').split(':').map(Number);
  const [endH, endM] = (assignment.endTime || '18:00').split(':').map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (assignment.scheduleType === 'One Day') {
    if (assignment.startDate !== todayStr) return false;
  } else if (assignment.scheduleType === 'Date Range') {
    if (todayStr < assignment.startDate || todayStr > assignment.endDate) return false;
  } else if (assignment.scheduleType === 'Weekly') {
    const startDayOfWeek = new Date(assignment.startDate).getDay();
    if (now.getDay() !== startDayOfWeek) return false;
    if (todayStr < assignment.startDate || todayStr > assignment.endDate) return false;
  }

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return false;
  }

  return true;
}

/**
 * Formats a 24-hour time "09:00" to "09:00 AM".
 */
export function formatTimeAmPm(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = (hours || 0) >= 12 ? 'PM' : 'AM';
  const displayHours = (hours || 0) % 12 === 0 ? 12 : (hours || 0) % 12;
  return `${String(displayHours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')} ${period}`;
}
