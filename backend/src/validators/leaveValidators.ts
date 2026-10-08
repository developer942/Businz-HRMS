import { z } from 'zod';

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
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true;
    return new Date(data.endDate) >= new Date(data.startDate);
  },
  {
    message: 'endDate must be greater than or equal to startDate',
    path: ['endDate'],
  }
).refine(
  (data) => {
    if (!data.startDate) return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return data.startDate >= todayStr;
  },
  {
    message: 'startDate must be today or a future date. Past dates are not allowed.',
    path: ['startDate'],
  }
);

export const reviewLeaveSchema = z.object({
  decision: z.enum(['Approved', 'Rejected', 'approved', 'rejected'], {
    errorMap: () => ({ message: 'decision must be either Approved or Rejected' }),
  }),
  comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
});
