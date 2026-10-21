import { z } from 'zod';
import { REQUEST_REASON_ERROR_MESSAGE, validateRequestReason } from '../utils/requestValidation.js';
const requestReasonSchema = z.string({
    required_error: REQUEST_REASON_ERROR_MESSAGE,
    invalid_type_error: REQUEST_REASON_ERROR_MESSAGE,
}).max(500, 'Reason cannot exceed 500 characters').transform(value => value.trim()).refine(value => validateRequestReason(value).valid, REQUEST_REASON_ERROR_MESSAGE);
export const createShiftSchema = z.object({
    shiftName: z.string().trim().min(2, 'shiftName must be at least 2 characters').max(100, 'shiftName cannot exceed 100 characters'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'startTime must be valid 24-hour time (HH:MM or HH:MM:SS)'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'endTime must be valid 24-hour time (HH:MM or HH:MM:SS)'),
    workingHours: z.number().positive().max(24, 'workingHours cannot exceed 24').optional().default(8),
    graceMinutes: z.number().min(0).max(180, 'graceMinutes cannot exceed 180').optional().default(15),
    breakDurationMinutes: z.number().min(0).max(360, 'breakDurationMinutes cannot exceed 360').optional().default(45),
    department: z.string().max(100).optional().default('General'),
    daysOfWeek: z.array(z.string()).optional(),
});
export const assignEmployeesSchema = z.object({
    employeeIds: z.array(z.string().max(50)).min(1, 'employeeIds must contain at least one employee ID'),
});
export const createShiftRequestSchema = z.object({
    employeeId: z.string().max(50).optional(),
    employeeName: z.string().trim().min(1).max(150),
    currentShift: z.string().trim().min(1).max(100),
    requestedShift: z.string().trim().min(1).max(100),
    requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'requestedDate must be in format YYYY-MM-DD'),
    reason: requestReasonSchema,
});
export const updateShiftRequestSchema = z.object({
    reason: requestReasonSchema,
});
//# sourceMappingURL=shiftValidators.js.map