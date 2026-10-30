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
 * Rules:
 * - D = calculated distance between office center and employee location
 * - R = configured geofence radius in meters
 * - A = device-reported GPS accuracy radius in meters
 * - maxAccuracyMeters = optional configurable accuracy threshold
 *
 * Classification:
 * - If maxAccuracyMeters is explicitly configured and A > maxAccuracyMeters -> UNCERTAIN (LOW_GPS_ACCURACY)
 * - Clearly inside:  D + A <= R
 * - Clearly outside: D - A > R
 * - Uncertain:       Neither condition satisfied
 */
export function evaluateGeofenceBoundary(distanceMeters, radiusMeters, accuracyMeters = 15, officeName = 'Office', maxAccuracyMeters) {
    const D = Math.round(distanceMeters * 10) / 10;
    const R = Math.round(radiusMeters);
    const A = Math.max(0, Math.round((accuracyMeters ?? 15) * 10) / 10);
    // Use configured accuracy threshold; for wide geofences (e.g. 500m), default to 150m max accuracy
    // so coarse cell-tower fixes (e.g. ±250m) are never accepted simply because D + A <= R.
    const effectiveMaxAccuracy = maxAccuracyMeters !== undefined && Number.isFinite(maxAccuracyMeters) && maxAccuracyMeters > 0
        ? maxAccuracyMeters
        : R >= 400
            ? 150
            : undefined;
    if (effectiveMaxAccuracy !== undefined && A > effectiveMaxAccuracy) {
        const userMessage = `Your location accuracy is currently ${Math.round(A)} metres (required: ≤${Math.round(effectiveMaxAccuracy)}m). Please enable Precise Location and retry.`;
        return {
            classification: 'UNCERTAIN',
            distanceMeters: D,
            radiusMeters: R,
            accuracyMeters: A,
            maxAllowedAccuracyMeters: effectiveMaxAccuracy,
            isInside: false,
            canPunch: false,
            reason: `${userMessage} Estimated distance from ${officeName} is ${D}m with ±${A}m GPS accuracy (configured ${R}m boundary).`,
            userMessage,
            errorCode: 'LOW_GPS_ACCURACY',
            canRequestCorrection: true,
            officeName,
        };
    }
    // Clearly inside: D + A <= R
    if (D + A <= R) {
        const msg = `Within approved office geofence (${Math.round(D)}m from ${officeName}, allowed: ${R}m, GPS accuracy: ±${Math.round(A)}m).`;
        return {
            classification: 'INSIDE',
            distanceMeters: D,
            radiusMeters: R,
            accuracyMeters: A,
            maxAllowedAccuracyMeters: maxAccuracyMeters,
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
            maxAllowedAccuracyMeters: maxAccuracyMeters,
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
        maxAllowedAccuracyMeters: maxAccuracyMeters,
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
 * Normalizes a timestamp (ISO string, Date, epoch ms, or epoch seconds) into Unix epoch milliseconds.
 */
export function normalizeLocationTimestampMs(rawTimestamp, referenceNowMs = Date.now()) {
    if (rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === '') {
        return null;
    }
    if (rawTimestamp instanceof Date) {
        const ms = rawTimestamp.getTime();
        return Number.isFinite(ms) && ms > 0 ? Math.min(ms, referenceNowMs) : null;
    }
    if (typeof rawTimestamp === 'number') {
        if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0)
            return null;
        if (rawTimestamp >= 1e12)
            return Math.min(Math.round(rawTimestamp), referenceNowMs);
        if (rawTimestamp >= 1e9 && rawTimestamp < 1e12)
            return Math.min(Math.round(rawTimestamp * 1000), referenceNowMs);
        return referenceNowMs;
    }
    if (typeof rawTimestamp === 'string') {
        const trimmed = rawTimestamp.trim();
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric) && numeric > 0) {
            return normalizeLocationTimestampMs(numeric, referenceNowMs);
        }
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.min(parsed, referenceNowMs);
        }
    }
    return null;
}
/**
 * Comprehensive Geofence verification for attendance punch.
 * Checks coordinate validity, staleness, GPS accuracy threshold, distance, and boundary classification.
 */
export function verifyPunchGeofence(opts) {
    const { userLat, userLng, officeLat, officeLng, radiusMeters, accuracyMeters = 15, maxAccuracyMeters, locationTimestamp, officeName = 'Office', maxStaleSeconds = 120, fieldDutyAuthorized = false, } = opts;
    // 1. Verify user coordinates
    if (!isValidCoordinate(userLat, userLng)) {
        return {
            valid: false,
            error: 'Invalid or missing device GPS coordinates. Please ensure location services are active.',
            statusCode: 422,
        };
    }
    // 2. Verify freshness of location reading if timestamp is provided
    if (locationTimestamp !== undefined && locationTimestamp !== null) {
        const now = Date.now();
        const readingTime = normalizeLocationTimestampMs(locationTimestamp, now);
        if (readingTime !== null) {
            const ageSeconds = Math.max(0, (now - readingTime) / 1000);
            if (ageSeconds > maxStaleSeconds) {
                return {
                    valid: false,
                    error: 'Location reading was stale. Please retry to obtain a fresh GPS fix.',
                    statusCode: 422,
                };
            }
        }
    }
    // 3. If authorized Field Duty without fixed office boundary, still enforce GPS accuracy threshold
    if (fieldDutyAuthorized) {
        const allowedFieldAccuracy = maxAccuracyMeters ?? 150;
        const A = Math.max(0, Math.round((accuracyMeters ?? 15) * 10) / 10);
        if (A > allowedFieldAccuracy) {
            const evaluation = {
                classification: 'UNCERTAIN',
                distanceMeters: 0,
                radiusMeters,
                accuracyMeters: A,
                maxAllowedAccuracyMeters: allowedFieldAccuracy,
                isInside: false,
                canPunch: false,
                reason: `Field duty GPS accuracy ±${A}m exceeds allowed threshold (±${allowedFieldAccuracy}m).`,
                userMessage: `Your location accuracy is currently ${Math.round(A)} metres. Please retry.`,
                errorCode: 'LOW_GPS_ACCURACY',
                canRequestCorrection: true,
                officeName: 'Authorized Field Duty',
            };
            return {
                valid: false,
                evaluation,
                error: evaluation.reason,
                statusCode: 422,
            };
        }
        const evaluation = {
            classification: 'INSIDE',
            distanceMeters: isValidCoordinate(officeLat, officeLng)
                ? calculateHaversineMeters(userLat, userLng, officeLat, officeLng)
                : 0,
            radiusMeters,
            accuracyMeters: A,
            maxAllowedAccuracyMeters: allowedFieldAccuracy,
            isInside: true,
            canPunch: true,
            reason: `Authorized Field Duty location verified (GPS accuracy: ±${Math.round(A)}m).`,
            userMessage: `Authorized Field Duty location verified (GPS accuracy: ±${Math.round(A)}m).`,
            errorCode: 'NONE',
            canRequestCorrection: false,
            officeName: 'Authorized Field Duty',
        };
        return {
            valid: true,
            evaluation,
        };
    }
    // 4. Verify office coordinates
    if (!isValidCoordinate(officeLat, officeLng)) {
        return {
            valid: false,
            error: 'Office geofence has not been configured correctly. Please contact HR.',
            statusCode: 500,
        };
    }
    // 5. Calculate geodesic distance on server
    const distance = calculateHaversineMeters(userLat, userLng, officeLat, officeLng);
    // 6. Evaluate boundary classification
    const evaluation = evaluateGeofenceBoundary(distance, radiusMeters, accuracyMeters, officeName, maxAccuracyMeters);
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