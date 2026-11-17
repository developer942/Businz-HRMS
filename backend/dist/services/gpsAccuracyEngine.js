// ==============================================================================
// VRM Enterprise HRMS — GPS Accuracy Engine, Road Matching & Distance Classification
// ==============================================================================
const DEFAULT_OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
/**
 * Calculates Great-Circle distance between two points in meters using Haversine formula.
 */
export function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
}
export function isTrackingGap(timeDeltaSeconds, distanceMeters) {
    return ((timeDeltaSeconds >= 180 && distanceMeters >= 200) ||
        (timeDeltaSeconds >= 300 && distanceMeters >= 100));
}
/**
 * Validates an incoming GPS point against the previous accepted point.
 * Enforces coordinate bounds, accuracy gates (<=100m with quality flags),
 * duplicate suppression, stationary drift suppression, and jump detection.
 */
export function validateLocationPoint(curr, prevAccepted) {
    // 1. Basic coordinate range checks
    if (typeof curr.latitude !== 'number' ||
        typeof curr.longitude !== 'number' ||
        isNaN(curr.latitude) ||
        isNaN(curr.longitude) ||
        curr.latitude < -90 ||
        curr.latitude > 90 ||
        curr.longitude < -180 ||
        curr.longitude > 180) {
        return {
            accepted: false,
            rejectionReason: 'Invalid coordinate bounds',
            distanceFromPrevMeters: 0,
            timeDeltaSeconds: 0,
            calculatedSpeedKmh: 0,
            isStationary: false,
            isGap: false,
            gapDurationSeconds: 0,
            qualityFlag: 'rejected',
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
            qualityFlag: 'rejected',
        };
    }
    // 2. Accuracy Gate: Discard extreme low-accuracy fixes (> 100 meters), flag quality tiers
    const accuracy = typeof curr.accuracy === 'number' && !isNaN(curr.accuracy) ? curr.accuracy : 15;
    if (accuracy > 100) {
        return {
            accepted: false,
            rejectionReason: `Low GPS accuracy (${Math.round(accuracy)}m > 100m threshold)`,
            distanceFromPrevMeters: 0,
            timeDeltaSeconds: 0,
            calculatedSpeedKmh: 0,
            isStationary: false,
            isGap: false,
            gapDurationSeconds: 0,
            qualityFlag: 'rejected',
        };
    }
    const qualityFlag = accuracy <= 25 ? 'high' : accuracy <= 50 ? 'moderate' : 'low_accuracy';
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
            qualityFlag,
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
            qualityFlag: 'rejected',
        };
    }
    const distanceMeters = calculateHaversineMeters(prevAccepted.latitude, prevAccepted.longitude, curr.latitude, curr.longitude);
    // 4. Duplicate Point Filter
    if (distanceMeters < 1.5 && timeDeltaSeconds <= 3) {
        return {
            accepted: false,
            rejectionReason: 'Duplicate GPS fix',
            distanceFromPrevMeters: 0,
            timeDeltaSeconds,
            calculatedSpeedKmh: 0,
            isStationary: true,
            isGap: false,
            gapDurationSeconds: 0,
            qualityFlag: 'rejected',
        };
    }
    // 5. Stationary Drift Suppression
    // Suppress jitter < 8m (or < 14m when accuracy > 35m), without blocking movement after long stops
    const declaredSpeed = curr.speed ?? 0;
    const effectiveSpeedKmh = timeDeltaSeconds > 0 ? (distanceMeters / timeDeltaSeconds) * 3.6 : declaredSpeed;
    const minMovementMeters = accuracy > 35 ? Math.max(14, Math.min(25, accuracy * 0.35)) : 8;
    if (distanceMeters < minMovementMeters) {
        return {
            accepted: false,
            rejectionReason: `Stationary GPS drift (${distanceMeters.toFixed(1)}m < ${Math.round(minMovementMeters)}m)`,
            distanceFromPrevMeters: 0,
            timeDeltaSeconds,
            calculatedSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
            isStationary: true,
            isGap: false,
            gapDurationSeconds: 0,
            qualityFlag: 'rejected',
        };
    }
    // 6. Jump & Impossible Speed Filter (> 140 km/h over short intervals or > 50 km jump)
    if ((timeDeltaSeconds > 0 && timeDeltaSeconds < 120 && effectiveSpeedKmh > 140) || distanceMeters > 50000) {
        return {
            accepted: false,
            rejectionReason: `Impossible GPS jump (${Math.round(effectiveSpeedKmh)} km/h > 140 km/h)`,
            distanceFromPrevMeters: distanceMeters,
            timeDeltaSeconds,
            calculatedSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
            isStationary: false,
            isGap: false,
            gapDurationSeconds: 0,
            qualityFlag: 'rejected',
        };
    }
    // 7. Background Gap Detection
    const isGap = isTrackingGap(timeDeltaSeconds, distanceMeters);
    return {
        accepted: true,
        distanceFromPrevMeters: distanceMeters,
        timeDeltaSeconds,
        calculatedSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
        isStationary: false,
        isGap,
        gapDurationSeconds: isGap ? Math.round(timeDeltaSeconds) : 0,
        qualityFlag,
    };
}
/**
 * Conservatively estimates road-network distance between two points when needed.
 * NOTE: Never used to inflate unrecorded GPS gaps into verified KM!
 */
export function estimateRoadDistanceMeters(haversineMeters) {
    if (haversineMeters <= 50)
        return haversineMeters;
    if (haversineMeters <= 500)
        return Math.round(haversineMeters * 1.15);
    if (haversineMeters <= 2000)
        return Math.round(haversineMeters * 1.2);
    return Math.round(haversineMeters * 1.25);
}
/**
 * Converts meters to kilometers with 2 decimal places.
 */
export function metersToKm(meters) {
    return Math.round(((Number(meters) || 0) / 1000) * 100) / 100;
}
/**
 * Formats kilometers as string with 2 decimal places and 'KM' suffix (e.g. "12.45 KM").
 */
export function formatKmDisplay(km) {
    return `${(Number(km) || 0).toFixed(2)} KM`;
}
/**
 * Server-side OSRM road matching helper for contiguous recorded GPS traces.
 * Never matches across unrecorded GPS gaps.
 */
export async function matchContiguousTraceOnServer(cluster, osrmBaseUrl = DEFAULT_OSRM_BASE_URL) {
    if (!cluster || cluster.length < 2)
        return null;
    let straightMeters = 0;
    for (let i = 1; i < cluster.length; i++) {
        straightMeters += calculateHaversineMeters(cluster[i - 1].latitude, cluster[i - 1].longitude, cluster[i].latitude, cluster[i].longitude);
    }
    if (straightMeters < 8) {
        return {
            coordinates: cluster.map((p) => [p.latitude, p.longitude]),
            distanceMeters: Math.round(straightMeters * 10) / 10,
        };
    }
    const sampled = cluster.length <= 80
        ? cluster
        : cluster.filter((_, idx) => idx === 0 || idx === cluster.length - 1 || idx % Math.ceil(cluster.length / 75) === 0);
    const coordsParam = sampled.map((p) => `${p.longitude},${p.latitude}`).join(';');
    try {
        if (sampled.length >= 3) {
            const timestamps = [];
            let monotonic = true;
            for (let i = 0; i < sampled.length; i++) {
                const ts = Math.floor(new Date(sampled[i].recordedAt).getTime() / 1000);
                if (i > 0 && ts <= timestamps[i - 1]) {
                    timestamps.push(timestamps[i - 1] + 1);
                }
                else if (isNaN(ts)) {
                    monotonic = false;
                    break;
                }
                else {
                    timestamps.push(ts);
                }
            }
            const radiuses = sampled
                .map((p) => Math.max(10, Math.min(50, Math.round(p.accuracy || 15))))
                .join(';');
            const matchUrl = `${osrmBaseUrl}/match/v1/driving/${coordsParam}?overview=full&geometries=geojson&tidy=true&radiuses=${radiuses}${monotonic ? `&timestamps=${timestamps.join(';')}` : ''}`;
            const res = await fetch(matchUrl);
            if (res.ok) {
                const data = await res.json();
                if (data?.code === 'Ok' && Array.isArray(data.matchings) && data.matchings.length > 0) {
                    const allCoords = [];
                    let totalMatchedMeters = 0;
                    for (const m of data.matchings) {
                        totalMatchedMeters += Number(m.distance) || 0;
                        const geoCoords = (m.geometry?.coordinates || []).map((c) => [c[1], c[0]]);
                        for (const pt of geoCoords) {
                            if (allCoords.length === 0 ||
                                allCoords[allCoords.length - 1][0] !== pt[0] ||
                                allCoords[allCoords.length - 1][1] !== pt[1]) {
                                allCoords.push(pt);
                            }
                        }
                    }
                    if (allCoords.length >= 2 && totalMatchedMeters <= straightMeters * 2.5 + 120) {
                        return {
                            coordinates: allCoords,
                            distanceMeters: Math.round(totalMatchedMeters * 10) / 10,
                        };
                    }
                }
            }
        }
        const routeUrl = `${osrmBaseUrl}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&continue_straight=default`;
        const routeRes = await fetch(routeUrl);
        if (routeRes.ok) {
            const routeData = await routeRes.json();
            const route = routeData?.routes?.[0];
            if (routeData?.code === 'Ok' && route?.geometry?.coordinates?.length >= 2) {
                const matchedDist = Number(route.distance) || straightMeters;
                if (matchedDist <= straightMeters * 2.4 + 100) {
                    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
                    return {
                        coordinates: coords,
                        distanceMeters: Math.round(matchedDist * 10) / 10,
                    };
                }
            }
        }
    }
    catch {
        // Ignore external OSRM failure and fall back to recorded points
    }
    return null;
}
/**
 * Pure route metrics calculator for backend verification and trip audit.
 */
export function calculateBackendRouteMetrics(points, tripEndTime) {
    const validPoints = (points || [])
        .filter((p) => p && !p.isRejected)
        .slice()
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    if (validPoints.length < 2) {
        return {
            recordedDistanceMeters: 0,
            roadMatchedDistanceMeters: 0,
            verifiedDistanceMeters: 0,
            unverifiedDistanceMeters: 0,
            verifiedKm: 0,
            unverifiedGapKm: 0,
            missingIntervalsCount: 0,
            missingDurationSeconds: 0,
            gpsDataQuality: 'Insufficient GPS Data',
            segments: [],
        };
    }
    let recordedMeters = 0;
    let unverifiedMeters = 0;
    let missingIntervalsCount = 0;
    let missingDurationSeconds = 0;
    const segments = [];
    for (let i = 1; i < validPoints.length; i++) {
        const prev = validPoints[i - 1];
        const curr = validPoints[i];
        const dist = calculateHaversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        const timeDelta = Math.max(0, (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000);
        if (dist > 50000)
            continue;
        if (isTrackingGap(timeDelta, dist)) {
            unverifiedMeters += dist;
            missingIntervalsCount++;
            missingDurationSeconds += Math.round(timeDelta);
            segments.push({
                id: `seg-${i}`,
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
        }
        else {
            recordedMeters += dist;
            segments.push({
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
        }
    }
    if (tripEndTime && validPoints.length > 0) {
        const lastPt = validPoints[validPoints.length - 1];
        const trailingSec = Math.round((new Date(tripEndTime).getTime() - new Date(lastPt.recordedAt).getTime()) / 1000);
        if (trailingSec >= 300) {
            missingIntervalsCount++;
            missingDurationSeconds += trailingSec;
        }
    }
    const verifiedKm = metersToKm(recordedMeters);
    const unverifiedGapKm = metersToKm(unverifiedMeters);
    const gpsDataQuality = missingIntervalsCount > 0 || unverifiedMeters > 0 ? 'Partial (Gaps Detected)' : 'Verified';
    return {
        recordedDistanceMeters: Math.round(recordedMeters * 10) / 10,
        roadMatchedDistanceMeters: Math.round(recordedMeters * 10) / 10,
        verifiedDistanceMeters: Math.round(recordedMeters * 10) / 10,
        unverifiedDistanceMeters: Math.round(unverifiedMeters * 10) / 10,
        verifiedKm,
        unverifiedGapKm,
        missingIntervalsCount,
        missingDurationSeconds,
        gpsDataQuality,
        segments,
    };
}
//# sourceMappingURL=gpsAccuracyEngine.js.map