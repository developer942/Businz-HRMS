// ==============================================================================
// VRM Enterprise HRMS — Geofence & GPS Accuracy Engine
// Strict geodesic distance calculation and uncertainty classification
// ==============================================================================
/**
 * Calculates Great-Circle geodesic distance between two coordinate points in meters using Haversine formula.
 * Earth mean radius = 6,371,000 meters (WGS84 spherical approximation).
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
/**
 * Validates coordinate numbers and bounds.
 */
export function isValidCoordinate(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number')
        return false;
    if (isNaN(lat) || isNaN(lng))
        return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return false;
    // Null Island check (0, 0)
    if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
        return false;
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
export function evaluateGeofenceBoundary(distanceMeters, radiusMeters, accuracyMeters = 15, officeName = 'Office') {
    const D = Math.round(distanceMeters * 10) / 10;
    const R = Math.round(radiusMeters);
    const A = Math.max(0, Math.round((accuracyMeters ?? 15) * 10) / 10);
    // Clearly inside: D + A <= R
    if (D + A <= R) {
        const msg = `Within approved office geofence (${Math.round(D)}m from ${officeName}, allowed: ${R}m, GPS accuracy: ±${Math.round(A)}m).`;
        return {
            classification: 'INSIDE',
            distanceMeters: D,
            radiusMeters: R,
            accuracyMeters: A,
            isInside: true,
            canPunch: true,
            reason: msg,
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
            reason: `${userMessage} (${D}m away from ${officeName}, GPS accuracy ±${A}m, allowed radius ${R}m).`,
            userMessage,
            errorCode: 'OUTSIDE_GEOFENCE',
            canRequestCorrection: false,
            officeName,
        };
    }
    // Uncertain: Neither condition satisfied (conservative uncertainty-aware classification)
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
        reason: `${userMessage} Estimated distance from ${officeName} is ${D}m with ±${A}m GPS accuracy (configured ${R}m boundary).`,
        userMessage,
        errorCode: isLowAccuracy ? 'LOW_GPS_ACCURACY' : 'GEOFENCE_UNCERTAIN',
        canRequestCorrection: true,
        officeName,
    };
}
// Privacy-conscious in-memory ring buffer of recent GPS diagnostics (no raw employee lat/lng stored)
const MAX_DIAGNOSTIC_ENTRIES = 150;
const recentGpsDiagnostics = [];
export function recordGpsDiagnostic(entry) {
    const fullEntry = {
        ...entry,
        id: `GPS-DIAG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: entry.timestamp || new Date().toISOString(),
    };
    recentGpsDiagnostics.unshift(fullEntry);
    if (recentGpsDiagnostics.length > MAX_DIAGNOSTIC_ENTRIES) {
        recentGpsDiagnostics.length = MAX_DIAGNOSTIC_ENTRIES;
    }
    return fullEntry;
}
export function getRecentGpsDiagnostics(limit = 50) {
    return recentGpsDiagnostics.slice(0, Math.max(1, Math.min(limit, MAX_DIAGNOSTIC_ENTRIES)));
}
/**
 * Comprehensive Geofence verification for attendance punch.
 * Checks coordinate validity, staleness, distance, and boundary classification.
 */
export function verifyPunchGeofence(opts) {
    const { userLat, userLng, officeLat, officeLng, radiusMeters, accuracyMeters = 15, locationTimestamp, officeName = 'Office', maxStaleSeconds = 90, } = opts;
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
//# sourceMappingURL=geofenceService.js.map