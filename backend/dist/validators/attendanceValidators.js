import { z } from 'zod';
export const punchSchema = z.object({
    employeeId: z.string().max(50).optional(),
    type: z.enum(['IN', 'OUT', 'Check-In', 'Check-Out']).default('IN'),
    // Accepted for backwards compatibility only. Attendance persistence always uses
    // the database clock; clients are not authoritative for punch timestamps.
    timestamp: z.string().optional(),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLng: z.number().min(-180).max(180).optional(),
    method: z.string().max(50).optional().default('Face Scan'),
    inGeofence: z.boolean().optional().default(true),
    accuracyMeters: z.number().min(0).max(5000).optional(),
    locationTimestamp: z.string().optional(),
    locationAddress: z.string().max(300, 'Location address cannot exceed 300 characters').optional(),
    shiftId: z.string().max(50).optional(),
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'shiftDate must be YYYY-MM-DD').optional(),
    photoUrl: z.string().max(2_500_000).optional(),
    photoBase64: z.string().max(2_500_000).optional(),
    idempotencyKey: z.string().min(16).max(100),
    gpsDurationMs: z.number().min(0).max(180_000).optional(),
    gpsReadingAgeMs: z.number().min(0).max(180_000).optional(),
    gpsSampleCount: z.number().int().min(1).max(200).optional(),
    gpsRetryCount: z.number().int().min(0).max(20).optional(),
    browserDeviceCategory: z.string().max(100).optional(),
    fieldDutyAuthorized: z.boolean().optional(),
    fieldAssignmentId: z.string().max(100).optional(),
});
export const gpsDiagnosticSchema = z.object({
    employeeCode: z.string().max(50).optional(),
    punchType: z.enum(['IN', 'OUT', 'PRECHECK']).optional().default('PRECHECK'),
    gpsRequestDurationMs: z.number().min(0).max(180_000).default(0),
    gpsAcquisitionStatus: z.enum([
        'SUCCESS',
        'PERMISSION_DENIED',
        'TIMEOUT',
        'POSITION_UNAVAILABLE',
        'LOW_ACCURACY',
        'STALE',
    ]),
    reportedAccuracyMeters: z.number().min(0).max(50_000).nullable().optional().default(null),
    locationReadingAgeMs: z.number().min(0).max(600_000).nullable().optional().default(null),
    calculatedDistanceMeters: z.number().min(0).max(20_000_000).nullable().optional().default(null),
    configuredRadiusMeters: z.number().positive().default(250),
    errorCode: z
        .enum([
        'NONE',
        'PERMISSION_DENIED',
        'POSITION_UNAVAILABLE',
        'TIMEOUT',
        'STALE_READING',
        'LOW_GPS_ACCURACY',
        'OUTSIDE_GEOFENCE',
        'GEOFENCE_UNCERTAIN',
        'INVALID_COORDINATES',
    ])
        .default('NONE'),
    browserDeviceCategory: z.string().max(100).default('Browser'),
    classification: z.enum(['INSIDE', 'OUTSIDE', 'UNCERTAIN', 'N/A']).default('N/A'),
    sampleCount: z.number().int().min(0).max(200).optional(),
    retryCount: z.number().int().min(0).max(20).optional(),
});
export const verifyFaceSchema = z.object({
    employeeId: z.string().max(50).optional(),
    facePhotoBase64: z.string().min(50, 'A fresh face capture is required').max(2_500_000),
});
export const attendanceFilterSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    employeeId: z.string().max(50).optional(),
    status: z.string().max(50).optional(),
});
//# sourceMappingURL=attendanceValidators.js.map