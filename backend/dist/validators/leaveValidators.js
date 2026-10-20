import { z } from 'zod';
import { getTodayKolkata, PAST_DATE_ERROR_MESSAGE, INVALID_DATE_RANGE_ORDER_MESSAGE } from '../utils/requestValidation.js';
export const createLeaveSchema = z.object({
    employeeId: z.string().max(50).optional(),
    leaveType: z.enum([
        'Casual',
        'Casual Leave',
        'Sick',
        'Sick Leave',
        'Earned',
        'Earned Leave',
        'Paid Leave',
        'Emergency',
        'Emergency Leave',
        'Maternity',
        'Paternity',
        'Unpaid',
        'Unpaid Leave',
        'Work From Home',
    ]).default('Casual'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in format YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in format YYYY-MM-DD'),
    reason: z.string().max(500, 'Reason cannot exceed 500 characters').optional().default('Personal Leave'),
    daysCount: z.number().positive().max(365, 'daysCount cannot exceed 365').optional(),
}).refine((data) => {
    if (!data.startDate || !data.endDate)
        return true;
    return data.endDate >= data.startDate;
}, {
    message: INVALID_DATE_RANGE_ORDER_MESSAGE,
    path: ['endDate'],
}).refine((data) => {
    if (!data.startDate)
        return true;
    const today = getTodayKolkata();
    return data.startDate >= today;
}, {
    message: PAST_DATE_ERROR_MESSAGE,
    path: ['startDate'],
});
export const reviewLeaveSchema = z.object({
    decision: z.enum(['Approved', 'Rejected', 'approved', 'rejected'], {
        errorMap: () => ({ message: 'decision must be either Approved or Rejected' }),
    }),
    comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
});
//# sourceMappingURL=leaveValidators.js.map