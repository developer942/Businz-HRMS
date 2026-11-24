// ============================================================================
// VRM Enterprise HRM — Battery-Efficient GPS Tracking, Road Matching & Distance Engine
// ============================================================================

import {
  FieldAssignment,
  FieldTripSession,
  LocationPoint,
  FieldVisitDistanceSegment,
  GpsStatus,
  TrackingStatus,
} from '../types/tracking';

const OSRM_CACHE_STORAGE_KEY = 'vrm_osrm_road_cache_v2';
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

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
  return Math.round(((Number(meters) || 0) / 1000) * 100) / 100;
}

/**
 * Formats a KM number to string with 2 decimal places and 'KM' suffix (e.g. "4.28 KM").
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
  qualityFlag: 'high' | 'moderate' | 'low_accuracy' | 'rejected';
  reason?: string;
}

/**
 * Determines whether two consecutive GPS points have an unrecorded tracking gap between them.
 * A gap is flagged when:
 * - >= 3 minutes (180s) elapsed AND >= 200m displacement, OR
 * - >= 5 minutes (300s) elapsed AND >= 100m displacement.
 */
export function isTrackingGap(timeDeltaSeconds: number, distanceMeters: number): boolean {
  return (
    (timeDeltaSeconds >= 180 && distanceMeters >= 200) ||
    (timeDeltaSeconds >= 300 && distanceMeters >= 100)
  );
}

/**
 * Validates whether a new location point is valid or should be filtered/flagged.
 * Enforces coordinate bounds, accuracy threshold (<=100m), duplicate suppression,
 * stationary drift suppression (without stalling after long stops), and jump filter.
 */
export function isValidMovementPoint(
  prevPoint: LocationPoint | null,
  newLat: number,
  newLng: number,
  accuracyMeters: number = 15,
  timestampMs: number = Date.now()
): ClientPointValidationResult {
  // 1. Discard invalid coordinate bounds or Null Island (0, 0)
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
      qualityFlag: 'rejected',
      reason: 'Invalid coordinates',
    };
  }

  // 2. Accuracy gate: allow up to 100m in urban canyons, flag quality tier
  const acc = typeof accuracyMeters === 'number' && !isNaN(accuracyMeters) ? accuracyMeters : 15;
  if (acc > 100) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      qualityFlag: 'rejected',
      reason: `Low GPS accuracy (${Math.round(acc)}m > 100m)`,
    };
  }

  const qualityFlag: 'high' | 'moderate' | 'low_accuracy' =
    acc <= 25 ? 'high' : acc <= 50 ? 'moderate' : 'low_accuracy';

  if (!prevPoint) {
    return {
      valid: true,
      distanceMeters: 0,
      timeDeltaSeconds: 0,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      qualityFlag,
    };
  }

  const prevTimeMs = new Date(prevPoint.recordedAt).getTime();
  const timeDeltaSeconds = Math.max(0, (timestampMs - prevTimeMs) / 1000);

  // 3. Reject backward timestamps (> 5s out of order)
  if (timestampMs < prevTimeMs - 5000) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: false,
      isGap: false,
      qualityFlag: 'rejected',
      reason: 'Out-of-order timestamp',
    };
  }

  const distanceMeters = calculateHaversineMeters(
    prevPoint.latitude,
    prevPoint.longitude,
    newLat,
    newLng
  );

  // 4. Duplicate suppression
  if (distanceMeters < 1.5 && timeDeltaSeconds <= 3) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: 0,
      isStationary: true,
      isGap: false,
      qualityFlag: 'rejected',
      reason: 'Duplicate GPS fix',
    };
  }

  // Calculate effective speed
  const speedKmh = timeDeltaSeconds > 0 ? (distanceMeters / timeDeltaSeconds) * 3.6 : 0;

  // 5. Stationary jitter / drift suppression:
  // Suppress tiny oscillations (< 8m, or < 15m when accuracy is poor > 35m).
  // Flags isStationary: true so callers can update device heartbeat/lastGpsUpdate without adding fake distance.
  const minMovementMeters = acc > 35 ? Math.max(14, Math.min(25, acc * 0.35)) : 8;
  if (distanceMeters < minMovementMeters) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: Math.round(speedKmh * 10) / 10,
      isStationary: true,
      isGap: false,
      qualityFlag: 'rejected',
      reason: `Stationary GPS drift (${distanceMeters.toFixed(1)}m < ${Math.round(minMovementMeters)}m)`,
    };
  }

  // 6. Jump filter: reject impossible bursts (> 140 km/h over short intervals or > 50 km jump)
  if ((timeDeltaSeconds > 0 && timeDeltaSeconds < 120 && speedKmh > 140) || distanceMeters > 50000) {
    return {
      valid: false,
      distanceMeters: 0,
      timeDeltaSeconds,
      calculatedSpeedKmh: Math.round(speedKmh * 10) / 10,
      isStationary: false,
      isGap: false,
      qualityFlag: 'rejected',
      reason: `Unrealistic GPS jump (${Math.round(speedKmh)} km/h > 140 km/h)`,
    };
  }

  const isGap = isTrackingGap(timeDeltaSeconds, distanceMeters);

  return {
    valid: true,
    distanceMeters,
    timeDeltaSeconds,
    calculatedSpeedKmh: Math.round(speedKmh * 10) / 10,
    isStationary: false,
    isGap,
    qualityFlag,
  };
}

/**
 * Conservatively estimates road distance when only straight-line distance is known.
 * NOTE: Never used to inflate unrecorded GPS gaps into verified KM.
 */
export function estimateRoadDistanceMeters(haversineMeters: number): number {
  if (haversineMeters <= 50) return haversineMeters;
  if (haversineMeters <= 500) return Math.round(haversineMeters * 1.15);
  if (haversineMeters <= 2000) return Math.round(haversineMeters * 1.2);
  return Math.round(haversineMeters * 1.25);
}

export interface RouteMetricsSummary {
  recordedDistanceMeters: number;
  roadMatchedDistanceMeters: number;
  verifiedDistanceMeters: number;
  estimatedDistanceMeters: number;
  unverifiedDistanceMeters: number;
  totalKm: number;
  verifiedKm: number;
  estimatedKm: number;
  unverifiedGapKm: number;
  missingIntervalsCount: number;
  missingDurationSeconds: number;
  gpsDataQuality: 'Verified' | 'Partial (Gaps Detected)' | 'Insufficient GPS Data';
  segments: FieldVisitDistanceSegment[];
}

/**
 * Calculates the cumulative travel distance across sequential GPS points.
 * STRICT RULE:
 * - Verified Travel KM (`totalKm` / `verifiedKm`) ONLY sums continuous recorded or road-matched segments.
 * - Unrecorded GPS gaps (`unverified_gap`) are tracked separately in `unverifiedDistanceMeters`
 *   and are NEVER added into `totalKm` or `roadMatchedDistanceMeters`.
 */
export function calculateSequentialRouteMetrics(
  points: LocationPoint[],
  existingSegments?: FieldVisitDistanceSegment[],
  tripEndTime?: string
): RouteMetricsSummary {
  const validPoints = (points || [])
    .filter(
      (p) =>
        p &&
        !p.isRejected &&
        typeof p.latitude === 'number' &&
        typeof p.longitude === 'number' &&
        !isNaN(p.latitude) &&
        !isNaN(p.longitude)
    )
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  if (validPoints.length < 2) {
    let missingIntervalsCount = 0;
    let missingDurationSeconds = 0;
    if (validPoints.length === 1 && tripEndTime) {
      const lastMs = new Date(validPoints[0].recordedAt).getTime();
      const endMs = new Date(tripEndTime).getTime();
      const trailingSec = Math.max(0, Math.round((endMs - lastMs) / 1000));
      if (trailingSec >= 300) {
        missingIntervalsCount = 1;
        missingDurationSeconds = trailingSec;
      }
    }
    return {
      recordedDistanceMeters: 0,
      roadMatchedDistanceMeters: 0,
      verifiedDistanceMeters: 0,
      estimatedDistanceMeters: 0,
      unverifiedDistanceMeters: 0,
      totalKm: 0,
      verifiedKm: 0,
      estimatedKm: 0,
      unverifiedGapKm: 0,
      missingIntervalsCount,
      missingDurationSeconds,
      gpsDataQuality: 'Insufficient GPS Data',
      segments: [],
    };
  }

  let recordedMeters = 0;
  let roadMatchedMeters = 0;
  let estimatedMeters = 0;
  let unverifiedMeters = 0;
  let missingIntervalsCount = 0;
  let missingDurationSeconds = 0;
  const segments: FieldVisitDistanceSegment[] = [];

  for (let i = 1; i < validPoints.length; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];

    const dist = calculateHaversineMeters(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
    const prevTime = new Date(prev.recordedAt).getTime();
    const currTime = new Date(curr.recordedAt).getTime();
    const timeDelta = Math.max(0, (currTime - prevTime) / 1000);

    // Ignore extreme impossible jumps > 50km
    if (dist > 50000) continue;

    const segId = `seg-${i}`;
    const isGap = isTrackingGap(timeDelta, dist);

    if (isGap) {
      // Missing GPS / backgrounded gap — NEVER count as verified road travel!
      unverifiedMeters += dist;
      missingIntervalsCount += 1;
      missingDurationSeconds += Math.round(timeDelta);

      segments.push({
        id: segId,
        tripId: curr.tripId,
        segmentType: 'unverified_gap',
        startLat: prev.latitude,
        startLng: prev.longitude,
        endLat: curr.latitude,
        endLng: curr.longitude,
        startTime: prev.recordedAt,
        endTime: curr.recordedAt,
        distanceMeters: dist,
        durationSeconds: Math.round(timeDelta),
        coordinates: [
          [prev.latitude, prev.longitude],
          [curr.latitude, curr.longitude],
        ],
        createdAt: curr.recordedAt,
      });
    } else {
      // Continuous verified recorded segment
      recordedMeters += dist;

      // Preserve existing road-matched geometry/distance for this exact segment if already matched
      const priorSeg = existingSegments?.find(
        (s) =>
          (s.id === segId ||
            (Math.abs(s.startLat - prev.latitude) < 0.00005 &&
              Math.abs(s.endLat - curr.latitude) < 0.00005)) &&
          s.segmentType === 'road_matched' &&
          Array.isArray(s.coordinates) &&
          s.coordinates.length >= 2
      );

      const segDist = priorSeg ? priorSeg.distanceMeters : dist;
      roadMatchedMeters += segDist;

      segments.push({
        id: segId,
        tripId: curr.tripId,
        segmentType: priorSeg ? 'road_matched' : 'recorded',
        startLat: prev.latitude,
        startLng: prev.longitude,
        endLat: curr.latitude,
        endLng: curr.longitude,
        startTime: prev.recordedAt,
        endTime: curr.recordedAt,
        distanceMeters: segDist,
        durationSeconds: Math.round(timeDelta),
        coordinates: priorSeg?.coordinates || [
          [prev.latitude, prev.longitude],
          [curr.latitude, curr.longitude],
        ],
        createdAt: curr.recordedAt,
      });
    }
  }

  // Also check if GPS updates stopped early before tripEndTime (>= 5 minutes gap at end of trip)
  if (tripEndTime && validPoints.length > 0) {
    const lastPt = validPoints[validPoints.length - 1];
    const lastMs = new Date(lastPt.recordedAt).getTime();
    const endMs = new Date(tripEndTime).getTime();
    const trailingGapSec = Math.round((endMs - lastMs) / 1000);
    if (trailingGapSec >= 300) {
      missingIntervalsCount += 1;
      missingDurationSeconds += trailingGapSec;
    }
  }

  const verifiedMeters = roadMatchedMeters > 0 ? roadMatchedMeters : recordedMeters;
  const verifiedKm = metersToKm(verifiedMeters);
  const estimatedKm = metersToKm(estimatedMeters);
  const unverifiedGapKm = metersToKm(unverifiedMeters);

  const gpsDataQuality: 'Verified' | 'Partial (Gaps Detected)' | 'Insufficient GPS Data' =
    validPoints.length < 2
      ? 'Insufficient GPS Data'
      : missingIntervalsCount > 0 || unverifiedMeters > 0
      ? 'Partial (Gaps Detected)'
      : 'Verified';

  return {
    recordedDistanceMeters: Math.round(recordedMeters * 10) / 10,
    roadMatchedDistanceMeters: Math.round(roadMatchedMeters * 10) / 10,
    verifiedDistanceMeters: Math.round(verifiedMeters * 10) / 10,
    estimatedDistanceMeters: Math.round(estimatedMeters * 10) / 10,
    unverifiedDistanceMeters: Math.round(unverifiedMeters * 10) / 10,
    totalKm: verifiedKm,
    verifiedKm,
    estimatedKm,
    unverifiedGapKm,
    missingIntervalsCount,
    missingDurationSeconds,
    gpsDataQuality,
    segments,
  };
}

/**
 * Normalizes a FieldTripSession so legacy or cloud-loaded trips always have
 * accurate Verified KM, Unverified Gap KM, GPS Data Quality, and preserved legacyStoredKm.
 */
export function normalizeTripSessionMetrics(trip: FieldTripSession): FieldTripSession {
  if (!trip) return trip;
  const metrics = calculateSequentialRouteMetrics(
    trip.locationPoints || [],
    trip.segments,
    trip.tripEndTime || trip.checkOutTime
  );

  // Preserve original stored KM if it differed from recalculated verified KM (e.g. legacy 5.28 KM)
  const legacyStoredKm =
    trip.legacyStoredKm !== undefined
      ? trip.legacyStoredKm
      : trip.totalKm > 0 && Math.abs(trip.totalKm - metrics.verifiedKm) >= 0.05
      ? trip.totalKm
      : undefined;

  return {
    ...trip,
    totalKm: metrics.verifiedKm,
    legacyStoredKm,
    verifiedDistanceMeters: metrics.verifiedDistanceMeters,
    estimatedDistanceMeters: metrics.estimatedDistanceMeters,
    recordedDistanceMeters: metrics.recordedDistanceMeters,
    roadMatchedDistanceMeters: metrics.roadMatchedDistanceMeters,
    unverifiedDistanceMeters: metrics.unverifiedDistanceMeters,
    gpsDataQuality: metrics.gpsDataQuality,
    missingIntervalsCount: metrics.missingIntervalsCount,
    missingDurationSeconds: metrics.missingDurationSeconds,
    segments: metrics.segments,
  };
}

// ============================================================================
// OPEN-SOURCE OSRM ROAD MAP MATCHING ENGINE (100% Free OpenStreetMap Routing)
// ============================================================================

interface CachedRoadMatch {
  coordinates: [number, number][];
  distanceMeters: number;
  matchedAt: string;
}

function getRoadMatchCache(): Record<string, CachedRoadMatch> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(OSRM_CACHE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRoadMatchCache(key: string, value: CachedRoadMatch): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const cache = getRoadMatchCache();
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      delete cache[keys[0]];
    }
    cache[key] = value;
    localStorage.setItem(OSRM_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Matches a contiguous cluster of recorded GPS points (no gaps) to OpenStreetMap roads using OSRM.
 * Uses `/match/v1/driving` for >= 3 points with timestamps, falling back to `/route/v1/driving`
 * for short contiguous recorded sub-traces (e.g. 2-point street turns < 300m).
 * Never matches across unrecorded GPS gaps.
 */
export async function matchContiguousClusterToRoad(
  cluster: LocationPoint[],
  osrmBaseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<CachedRoadMatch | null> {
  if (!cluster || cluster.length < 2) return null;

  // Compute straight-line sum of the cluster
  let straightMeters = 0;
  for (let i = 1; i < cluster.length; i++) {
    straightMeters += calculateHaversineMeters(
      cluster[i - 1].latitude,
      cluster[i - 1].longitude,
      cluster[i].latitude,
      cluster[i].longitude
    );
  }

  // If total movement in cluster is < 8m, no road snapping needed
  if (straightMeters < 8) {
    return {
      coordinates: cluster.map((p) => [p.latitude, p.longitude]),
      distanceMeters: Math.round(straightMeters * 10) / 10,
      matchedAt: new Date().toISOString(),
    };
  }

  // Downsample if > 80 points in one cluster to respect OSRM URL limits
  const sampled =
    cluster.length <= 80
      ? cluster
      : cluster.filter(
          (_, idx) => idx === 0 || idx === cluster.length - 1 || idx % Math.ceil(cluster.length / 75) === 0
        );

  const cacheKey = sampled
    .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join(';');

  const cached = getRoadMatchCache()[cacheKey];
  if (cached && Array.isArray(cached.coordinates) && cached.coordinates.length >= 2) {
    return cached;
  }

  const coordsParam = sampled.map((p) => `${p.longitude},${p.latitude}`).join(';');

  try {
    // 1. Try OSRM Map Matching API (`match/v1/driving`) when >= 3 points with increasing timestamps
    if (sampled.length >= 3) {
      const timestamps: number[] = [];
      let monotonic = true;
      for (let i = 0; i < sampled.length; i++) {
        const ts = Math.floor(new Date(sampled[i].recordedAt).getTime() / 1000);
        if (i > 0 && ts <= timestamps[i - 1]) {
          timestamps.push(timestamps[i - 1] + 1);
        } else if (isNaN(ts)) {
          monotonic = false;
          break;
        } else {
          timestamps.push(ts);
        }
      }

      const radiuses = sampled
        .map((p) => Math.max(10, Math.min(50, Math.round(p.accuracy || 15))))
        .join(';');

      const matchUrl = `${osrmBaseUrl}/match/v1/driving/${coordsParam}?overview=full&geometries=geojson&tidy=true&radiuses=${radiuses}${
        monotonic ? `&timestamps=${timestamps.join(';')}` : ''
      }`;

      const res = await fetch(matchUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.code === 'Ok' && Array.isArray(data.matchings) && data.matchings.length > 0) {
          const allCoords: [number, number][] = [];
          let totalMatchedMeters = 0;

          for (const m of data.matchings) {
            totalMatchedMeters += Number(m.distance) || 0;
            const geoCoords: [number, number][] = (m.geometry?.coordinates || []).map(
              (c: [number, number]) => [c[1], c[0]]
            );
            for (const pt of geoCoords) {
              if (
                allCoords.length === 0 ||
                allCoords[allCoords.length - 1][0] !== pt[0] ||
                allCoords[allCoords.length - 1][1] !== pt[1]
              ) {
                allCoords.push(pt);
              }
            }
          }

          if (
            allCoords.length >= 2 &&
            totalMatchedMeters <= straightMeters * 2.5 + 120
          ) {
            const result: CachedRoadMatch = {
              coordinates: allCoords,
              distanceMeters: Math.round(totalMatchedMeters * 10) / 10,
              matchedAt: new Date().toISOString(),
            };
            saveRoadMatchCache(cacheKey, result);
            return result;
          }
        }
      }
    }

    // 2. Fallback to OSRM Route API (`route/v1/driving`) ONLY for contiguous recorded sub-traces
    // where every consecutive hop is < 300m and < 180s (never across missing gaps!)
    const routeUrl = `${osrmBaseUrl}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&continue_straight=default`;
    const routeRes = await fetch(routeUrl);
    if (routeRes.ok) {
      const routeData = await routeRes.json();
      const route = routeData?.routes?.[0];
      if (routeData?.code === 'Ok' && route?.geometry?.coordinates?.length >= 2) {
        const matchedDist = Number(route.distance) || straightMeters;
        // Guard against one-way loop detours inflating short segments
        if (matchedDist <= straightMeters * 2.4 + 100) {
          const coords: [number, number][] = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]]
          );
          const result: CachedRoadMatch = {
            coordinates: coords,
            distanceMeters: Math.round(matchedDist * 10) / 10,
            matchedAt: new Date().toISOString(),
          };
          saveRoadMatchCache(cacheKey, result);
          return result;
        }
      }
    }
  } catch (err) {
    // Network or OSRM unavailable — fall back gracefully to recorded points
  }

  return null;
}

/**
 * Matches all contiguous verified segments of a trip to actual OpenStreetMap roads,
 * while strictly leaving `unverified_gap` intervals untouched as missing-GPS gaps.
 */
export async function matchTripSegmentsToRoads(
  points: LocationPoint[],
  tripEndTime?: string,
  osrmBaseUrl: string = DEFAULT_OSRM_BASE_URL
): Promise<RouteMetricsSummary> {
  const baseMetrics = calculateSequentialRouteMetrics(points, undefined, tripEndTime);
  const validPoints = (points || [])
    .filter((p) => p && !p.isRejected)
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  if (validPoints.length < 2) {
    return baseMetrics;
  }

  // Partition validPoints into contiguous verified clusters separated by tracking gaps
  const clusters: { points: LocationPoint[]; startSegIndex: number }[] = [];
  let currentCluster: LocationPoint[] = [validPoints[0]];
  let clusterStartSegIdx = 0;
  let segCursor = 0;

  for (let i = 1; i < validPoints.length; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    const dist = calculateHaversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    const timeDelta = Math.max(
      0,
      (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000
    );
    if (dist > 50000) continue;

    if (isTrackingGap(timeDelta, dist)) {
      if (currentCluster.length >= 2) {
        clusters.push({ points: currentCluster, startSegIndex: clusterStartSegIdx });
      }
      currentCluster = [curr];
      clusterStartSegIdx = segCursor + 1;
    } else {
      currentCluster.push(curr);
    }
    segCursor++;
  }
  if (currentCluster.length >= 2) {
    clusters.push({ points: currentCluster, startSegIndex: clusterStartSegIdx });
  }

  // Match each contiguous cluster via OSRM
  const finalSegments: FieldVisitDistanceSegment[] = [];
  let roadMatchedMeters = 0;

  // Map cluster start point timestamp+coords for quick lookup
  const clusterResults = new Map<number, CachedRoadMatch>();
  for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
    const matched = await matchContiguousClusterToRoad(clusters[cIdx].points, osrmBaseUrl);
    if (matched) {
      clusterResults.set(cIdx, matched);
    }
  }

  // Rebuild segments: each contiguous cluster becomes a road_matched segment (or keeps recorded hops),
  // and each unverified_gap remains an unverified_gap segment.
  let currentClusterIdx = 0;
  let i = 1;
  while (i < validPoints.length) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    const dist = calculateHaversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    const timeDelta = Math.max(
      0,
      (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000
    );

    if (dist > 50000) {
      i++;
      continue;
    }

    if (isTrackingGap(timeDelta, dist)) {
      finalSegments.push({
        id: `seg-gap-${i}`,
        tripId: curr.tripId,
        segmentType: 'unverified_gap',
        startLat: prev.latitude,
        startLng: prev.longitude,
        endLat: curr.latitude,
        endLng: curr.longitude,
        startTime: prev.recordedAt,
        endTime: curr.recordedAt,
        distanceMeters: dist,
        durationSeconds: Math.round(timeDelta),
        coordinates: [
          [prev.latitude, prev.longitude],
          [curr.latitude, curr.longitude],
        ],
        createdAt: curr.recordedAt,
      });
      i++;
    } else {
      // Find the cluster starting at `prev`
      const clusterObj = clusters[currentClusterIdx];
      const matched = clusterResults.get(currentClusterIdx);
      currentClusterIdx++;

      if (clusterObj && clusterObj.points.length >= 2) {
        const cPts = clusterObj.points;
        const firstPt = cPts[0];
        const lastPt = cPts[cPts.length - 1];
        const durationSec = Math.max(
          0,
          Math.round(
            (new Date(lastPt.recordedAt).getTime() - new Date(firstPt.recordedAt).getTime()) / 1000
          )
        );

        let clusterRawMeters = 0;
        for (let k = 1; k < cPts.length; k++) {
          clusterRawMeters += calculateHaversineMeters(
            cPts[k - 1].latitude,
            cPts[k - 1].longitude,
            cPts[k].latitude,
            cPts[k].longitude
          );
        }

        const segDist = matched ? matched.distanceMeters : Math.round(clusterRawMeters * 10) / 10;
        roadMatchedMeters += segDist;

        finalSegments.push({
          id: `seg-cluster-${currentClusterIdx}`,
          tripId: firstPt.tripId,
          segmentType: matched ? 'road_matched' : 'recorded',
          startLat: firstPt.latitude,
          startLng: firstPt.longitude,
          endLat: lastPt.latitude,
          endLng: lastPt.longitude,
          startTime: firstPt.recordedAt,
          endTime: lastPt.recordedAt,
          distanceMeters: segDist,
          durationSeconds: durationSec,
          coordinates: matched
            ? matched.coordinates
            : cPts.map((p) => [p.latitude, p.longitude] as [number, number]),
          createdAt: lastPt.recordedAt,
        });

        i += cPts.length - 1;
      } else {
        roadMatchedMeters += dist;
        finalSegments.push({
          id: `seg-${i}`,
          tripId: curr.tripId,
          segmentType: 'recorded',
          startLat: prev.latitude,
          startLng: prev.longitude,
          endLat: curr.latitude,
          endLng: curr.longitude,
          startTime: prev.recordedAt,
          endTime: curr.recordedAt,
          distanceMeters: dist,
          durationSeconds: Math.round(timeDelta),
          coordinates: [
            [prev.latitude, prev.longitude],
            [curr.latitude, curr.longitude],
          ],
          createdAt: curr.recordedAt,
        });
        i++;
      }
    }
  }

  const verifiedMeters = roadMatchedMeters > 0 ? roadMatchedMeters : baseMetrics.recordedDistanceMeters;
  const verifiedKm = metersToKm(verifiedMeters);

  return {
    ...baseMetrics,
    roadMatchedDistanceMeters: Math.round(roadMatchedMeters * 10) / 10,
    verifiedDistanceMeters: Math.round(verifiedMeters * 10) / 10,
    totalKm: verifiedKm,
    verifiedKm,
    segments: finalSegments,
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

/**
 * Derives accurate GPS status and tracking status based on real telemetry, elapsed time, and session state.
 * Never displays 'GPS Active' when last GPS update occurred hours ago.
 */
export function deriveAccurateGpsStatus(params: {
  tripStatus: string;
  trackingStatus?: string;
  lastGpsUpdate?: string | null;
  speedKmh?: number;
  accuracyMeters?: number;
  deviceError?: string;
}): { gpsStatus: GpsStatus; trackingStatus: TrackingStatus } {
  const normStatus = String(params.tripStatus || '').trim().toLowerCase();

  if (normStatus === 'completed') {
    return { gpsStatus: 'Completed', trackingStatus: 'Completed' };
  }
  if (normStatus === 'cancelled' || normStatus === 'stopped') {
    return { gpsStatus: 'Tracking Stopped', trackingStatus: 'Tracking Stopped' };
  }

  if (params.deviceError === 'PERMISSION_DENIED') {
    return { gpsStatus: 'Permission Denied', trackingStatus: 'Permission Denied' };
  }
  if (params.deviceError === 'POSITION_UNAVAILABLE' || params.deviceError === 'GPS_DISABLED') {
    return { gpsStatus: 'GPS Disabled', trackingStatus: 'GPS Disabled' };
  }

  if (!params.lastGpsUpdate) {
    return { gpsStatus: 'Offline', trackingStatus: 'Pending GPS Fix' };
  }

  const elapsedMs = Date.now() - new Date(params.lastGpsUpdate).getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);

  // If last update was > 45 minutes ago: Offline
  if (elapsedMinutes >= 45) {
    return { gpsStatus: 'Offline', trackingStatus: 'Offline' };
  }
  // If last update was 15 - 45 minutes ago: Stale Location
  if (elapsedMinutes >= 15) {
    return { gpsStatus: 'Stale Location', trackingStatus: 'Stationary (Stale)' };
  }
  // If last update was 5 - 15 minutes ago, or accuracy > 45m: GPS Weak
  if (elapsedMinutes >= 5 || (params.accuracyMeters && params.accuracyMeters > 45)) {
    return { gpsStatus: 'GPS Weak', trackingStatus: (params.trackingStatus as TrackingStatus) || 'Stationary' };
  }

  // Fresh fix (< 5 minutes)
  const speed = params.speedKmh ?? 0;
  if (speed > 3 || params.trackingStatus === 'Travelling') {
    return { gpsStatus: 'Travelling', trackingStatus: 'Travelling' };
  }
  if (params.trackingStatus === 'Arrived at destination') {
    return { gpsStatus: 'Active', trackingStatus: 'Arrived at destination' };
  }
  return { gpsStatus: 'Stationary', trackingStatus: 'Stationary' };
}

