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