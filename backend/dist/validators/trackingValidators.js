import { z } from 'zod';
import { getTodayKolkata, PAST_DATE_ERROR_MESSAGE, INVALID_DATE_RANGE_ORDER_MESSAGE } from '../utils/requestValidation.js';
export const baseAssignmentSchema = z.object({
    employeeId: z.string().min(1, 'employeeId is required'),
    customerSiteName: z.string().min(1, 'customerSiteName is required'),
    dutyType: z.enum(['Site Visit', 'Customer Visit', 'Vendor Visit', 'Travel', 'Field Work', 'Other']).optional(),
    scheduleType: z.enum(['One Day', 'Date Range', 'Weekly', 'Monthly', 'Custom Dates']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    siteAddress: z.string().optional().default('Site Location'),
    purpose: z.string().optional(),
    trackingRequired: z.boolean().optional(),
    travelKmRequired: z.boolean().optional(),
    attendanceType: z.enum(['Site Geofence', 'Flexible Field Check-in']).optional(),
    siteLat: z.number().min(-90).max(90).optional().default(13.0827),
    siteLng: z.number().min(-180).max(180).optional().default(80.2707),
    allowedRadiusMeters: z.number().positive().optional().default(200),
    geofenceRadiusMeters: z.number().positive().optional(),
    scheduledDate: z.string().optional(),
    notes: z.string().optional(),
});
export const createAssignmentSchema = baseAssignmentSchema.refine((data) => {
    const sDate = data.startDate || data.scheduledDate;
    if (!sDate)
        return true;
    const today = getTodayKolkata();
    return sDate >= today;
}, {
    message: PAST_DATE_ERROR_MESSAGE,
    path: ['startDate'],
}).refine((data) => {
    const sDate = data.startDate || data.scheduledDate;
    const eDate = data.endDate;
    if (!sDate || !eDate)
        return true;
    return eDate >= sDate;
}, {
    message: INVALID_DATE_RANGE_ORDER_MESSAGE,
    path: ['endDate'],
});
export const updateAssignmentSchema = baseAssignmentSchema.partial().extend({
    status: z.enum(['Scheduled', 'Active', 'Completed', 'Cancelled', 'Assigned', 'In Progress']).optional(),
});
export const startTripSchema = z.object({
    assignmentId: z.string().min(1, 'assignmentId is required'),
    employeeId: z.string().optional(),
    startLat: z.number().min(-90).max(90),
    startLng: z.number().min(-180).max(180),
    startAddress: z.string().optional().default('Starting Point'),
});
export const endTripSchema = z.object({
    endLat: z.number().min(-90).max(90),
    endLng: z.number().min(-180).max(180),
    endAddress: z.string().optional().default('Destination'),
    totalKm: z.number().min(0).optional(),
});
export const locationPointSchema = z.object({
    tripId: z.string().min(1, 'tripId is required'),
    assignmentId: z.string().optional(),
    employeeId: z.string().optional(),
    recordedAt: z.string().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timestamp: z.string().optional(),
    accuracy: z.number().optional(),
    speed: z.number().min(0).optional().default(0),
    batteryLevel: z.number().min(0).max(100).optional().default(100),
    syncedOffline: z.boolean().optional(),
});
export const locationPointsSchema = z.union([
    locationPointSchema,
    z.array(locationPointSchema).min(1, 'At least one point is required'),
]);
//# sourceMappingURL=trackingValidators.js.map