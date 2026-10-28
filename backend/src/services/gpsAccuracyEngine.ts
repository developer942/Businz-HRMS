// ==============================================================================
// VRM Enterprise HRMS — GPS Accuracy Engine & Distance Classification
// ==============================================================================

import { LocationPoint, FieldVisitDistanceSegment, FieldVisitStop } from '../types/tracking.js';

export interface PointValidationResult {
  accepted: boolean;
  rejectionReason?: string;
  distanceFromPrevMeters: number;
  timeDeltaSeconds: number;
  calculatedSpeedKmh: number;
  isStationary: boolean;
  isGap: boolean;
  gapDurationSeconds: number;
}

/**
 * Calculates Great-Circle distance between two points in meters using Haversine formula.
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
 * Validates an incoming GPS point against the previous accepted point.
 * Enforces accuracy gates, duplicate suppression, stationary drift suppression, and jump detection.
 */
export function validateLocationPoint(
  curr: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    recordedAt?: string;
  },
  prevAccepted: LocationPoint | null
): PointValidationResult {
  // 1. Basic coordinate range checks
  if (
    typeof curr.latitude !== 'number' ||
    typeof curr.longitude !== 'number' ||
    isNaN(curr.latitude) ||
    isNaN(curr.longitude) ||
    curr.latitude < -90 ||
    curr.latitude > 90 ||
    curr.longitude < -180 ||
    curr.longitude > 180
  ) {
    return {
      accepted: false,
      rejectionReason: 'Invalid coordinate bounds',
      distanceFromPrevMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // Null Island check (0.0, 0.0)
  if (Math.abs(curr.latitude) < 0.0001 && Math.abs(curr.longitude) < 0.0001) {
    return {
      accepted: false,
      rejectionReason: 'Null Island (0,0) coordinate rejected',
      distanceFromPrevMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // 2. Accuracy Gate: Discard low-accuracy fixes (> 45 meters)
  const accuracy = curr.accuracy ?? 15;
  if (accuracy > 45) {
    return {
      accepted: false,
      rejectionReason: `Low GPS accuracy (${Math.round(accuracy)}m > 45m threshold)`,
      distanceFromPrevMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // If this is the first point of the trip
  if (!prevAccepted) {
    return {
      accepted: true,
      distanceFromPrevMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // 3. Time delta check
  const currTime = curr.recordedAt ? new Date(curr.recordedAt).getTime() : Date.now();
  const prevTime = new Date(prevAccepted.recordedAt).getTime();
  const timeDeltaSeconds = Math.max(0, (currTime - prevTime) / 1000);

  // Reject out-of-order timestamps
  if (currTime < prevTime - 5000) {
    return {
      accepted: false,
      rejectionReason: 'Out-of-order timestamp',
      distanceFromPrevMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  const distanceMeters = calculateHaversineMeters(
    prevAccepted.latitude,
    prevAccepted.longitude,
    curr.latitude,
    curr.longitude
  );

  // 4. Duplicate Point Filter
  if (distanceMeters < 1 && timeDeltaSeconds <= 3) {
    return {
      accepted: false,
      rejectionReason: 'Duplicate GPS fix',
      distanceFromPrevMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: true,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // 5. Stationary Drift Suppression
  // If movement is under 12 meters and speed is low (< 2.5 km/h), suppress drift accumulation
  const declaredSpeed = curr.speed ?? 0;
  const effectiveSpeedKmh = timeDeltaSeconds > 0 ? (distanceMeters / timeDeltaSeconds) * 3.6 : declaredSpeed;

  if (distanceMeters < 12 && effectiveSpeedKmh < 3.0) {
    return {
      accepted: false,
      rejectionReason: `Stationary GPS drift (${distanceMeters.toFixed(1)}m < 12m)`,
      distanceFromPrevMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: effectiveSpeedKmh,
      isStationary: true,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // 6. Jump & Impossible Speed Filter (> 130 km/h)
  if (timeDeltaSeconds > 0 && effectiveSpeedKmh > 130) {
    return {
      accepted: false,
      rejectionReason: `Impossible GPS jump (${Math.round(effectiveSpeedKmh)} km/h > 130 km/h)`,
      distanceFromPrevMeters: distanceMeters,
      timeDeltaSeconds,
      calculatedSpeedKmh: effectiveSpeedKmh,
      isStationary: false,
      isGap: false,
      gapDurationSeconds: 0,
    };
  }

  // 7. Background Gap Detection (Missing updates > 3 minutes and distance > 200m)
  const isGap = timeDeltaSeconds >= 180 && distanceMeters >= 200;

  return {
    accepted: true,
    distanceFromPrevMeters: distanceMeters,
    timeDeltaSeconds,
    calculatedSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
    isStationary: false,
    isGap,
    gapDurationSeconds: isGap ? Math.round(timeDeltaSeconds) : 0,
  };
}

/**
 * Calculates road-matched or road-network estimate for distance between two points.
 * When straight line distance is known, typical urban road tortuosity factor in Indian cities is ~1.28 - 1.35.
 */
export function estimateRoadDistanceMeters(haversineMeters: number): number {
  if (haversineMeters <= 50) return haversineMeters;
  if (haversineMeters <= 500) return Math.round(haversineMeters * 1.18);
  if (haversineMeters <= 2000) return Math.round(haversineMeters * 1.25);
  return Math.round(haversineMeters * 1.32);
}

/**
 * Converts meters to kilometers with 2 decimal places.
 */
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

/**
 * Formats kilometers as string with 2 decimal places and 'KM' suffix (e.g. "12.45 KM").
 */
export function formatKmDisplay(km: number): string {
  return `${(Number(km) || 0).toFixed(2)} KM`;
}
