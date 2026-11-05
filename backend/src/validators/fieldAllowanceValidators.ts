import { z } from 'zod';

const cleanOptional = z.string().trim().max(500).optional().nullable();
const nonNegativeMoney = z.coerce.number().finite().min(0).max(100_000_000);

export const fieldAllowanceRequestSchema = z.object({
  purpose: z.string().trim().min(3).max(200),
  customerSiteName: z.string().trim().max(200).optional().nullable(),
  destination: z.string().trim().min(2).max(200),
  startDate: z.string().date(),
  endDate: z.string().date(),
  travelMode: z.string().trim().max(100).optional().nullable(),
  description: cleanOptional,
  advanceRequired: z.boolean(),
  requestedAmount: nonNegativeMoney.default(0),
  submit: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date cannot be before start date' });
  }
  if (!data.advanceRequired && data.requestedAmount !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedAmount'], message: 'Requested amount must be 0 when no advance is required' });
  }
  if (data.advanceRequired && data.requestedAmount <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedAmount'], message: 'Enter a requested amount when advance is required' });
  }
});

export const fieldAllowanceDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED']),
  approvedAmount: nonNegativeMoney.optional(),
  remarks: cleanOptional,
}).superRefine((data, ctx) => {
  if (data.decision === 'APPROVED' && data.approvedAmount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approvedAmount'], message: 'Approved amount is required' });
  }
  if (data.decision !== 'APPROVED' && !data.remarks?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remarks'], message: 'Remarks are required for rejection or correction' });
  }
});

export const fieldAllowanceDistributionSchema = z.object({
  distributedAmount: nonNegativeMoney,
  distributionDate: z.string().date(),
  paymentMethod: z.string().trim().min(2).max(100),
  referenceNumber: z.string().trim().max(150).optional().nullable(),
  remarks: cleanOptional,
});

export const fieldAllowanceDailyReportSchema = z.object({
  expenseDate: z.string().date(),
  category: z.enum(['TRAVEL', 'FOOD', 'ROOM', 'BUS', 'FUEL', 'OTHER']),
  amount: z.coerce.number().finite().positive().max(10_000_000),
  description: z.string().trim().min(2).max(500),
  attachmentPath: z.string().trim().max(2_000_000).optional().nullable(),
});
