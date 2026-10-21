import { z } from 'zod';
import { 
  getTodayKolkata, 
  validateDateRange, 
  PAST_DATE_ERROR_MESSAGE, 
  INVALID_DATE_RANGE_ORDER_MESSAGE,
  REQUEST_REASON_ERROR_MESSAGE,
  validateRequestReason
} from '../utils/requestValidation.js';

export const requestReasonSchema = z.string({
  required_error: REQUEST_REASON_ERROR_MESSAGE,
  invalid_type_error: REQUEST_REASON_ERROR_MESSAGE,
}).max(500, 'Reason cannot exceed 500 characters').transform(value => value.trim()).refine(
  value => validateRequestReason(value).valid,
  REQUEST_REASON_ERROR_MESSAGE
);

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
  reason: requestReasonSchema,
  daysCount: z.number().positive().max(365, 'daysCount cannot exceed 365').optional(),
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true;
    return data.endDate >= data.startDate;
  },
  {
    message: INVALID_DATE_RANGE_ORDER_MESSAGE,
    path: ['endDate'],
  }
).refine(
  (data) => {
    if (!data.startDate) return true;
    const today = getTodayKolkata();
    return data.startDate >= today;
  },
  {
    message: PAST_DATE_ERROR_MESSAGE,
    path: ['startDate'],
  }
);

export const reviewLeaveSchema = z.object({
  decision: z.enum(['Approved', 'Rejected', 'approved', 'rejected'], {
    errorMap: () => ({ message: 'decision must be either Approved or Rejected' }),
  }),
  comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
});
