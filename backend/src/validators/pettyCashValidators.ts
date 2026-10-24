import { z } from 'zod';

// Decimal money validator: positive number, max 2 decimal places, no NaN, no Infinity
const moneySchema = z.number()
  .positive({ message: 'Amount must be greater than zero' })
  .max(10_000_000, { message: 'Amount exceeds maximum allowable threshold (10,000,000)' })
  .refine(val => {
    // Check max 2 decimal places
    const str = val.toString();
    const parts = str.split('.');
    return parts.length < 2 || parts[1].length <= 2;
  }, { message: 'Amount cannot have more than 2 decimal places' });

// Date validator: YYYY-MM-DD format, not in the future
const notFutureDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be formatted as YYYY-MM-DD' })
  .refine(dateStr => {
    const parsed = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) return false;
    const now = new Date();
    // Allow today (up to end of today UTC+5:30)
    const today = new Date(now.toISOString().split('T')[0] + 'T23:59:59Z');
    return parsed <= today;
  }, { message: 'Date cannot be in the future' });

// Text reason validator: non-empty, min 3 chars, not whitespace only
const meaningfulTextSchema = z.string()
  .trim()
  .min(3, { message: 'Description/reason must contain at least 3 non-whitespace characters' })
  .max(1000, { message: 'Description/reason cannot exceed 1000 characters' });

// 1. Assign Custodian
export const assignCustodianSchema = z.object({
  employeeId: z.string().trim().min(1, { message: 'Employee ID is required' }),
  employeeName: z.string().trim().min(1, { message: 'Employee Name is required' }),
  employeeCode: z.string().trim().min(1, { message: 'Employee Code is required' }),
  lowBalanceThreshold: z.number().nonnegative().optional().default(1000),
  assignmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// 2. Reassign Custodian (with mandatory reconciliation)
export const reassignCustodianSchema = z.object({
  previousAccountId: z.string().uuid({ message: 'Valid previous account ID is required' }),
  newEmployeeId: z.string().trim().min(1, { message: 'New Employee ID is required' }),
  newEmployeeName: z.string().trim().min(1, { message: 'New Employee Name is required' }),
  newEmployeeCode: z.string().trim().min(1, { message: 'New Employee Code is required' }),
  reconciliationNotes: meaningfulTextSchema,
  physicalCashCounted: z.number().nonnegative({ message: 'Physical cash counted must be zero or positive' }),
  transferRemainingBalance: z.boolean().default(false),
});

// 3. Request Petty Cash
export const requestPettyCashSchema = z.object({
  requestedAmount: moneySchema,
  purpose: meaningfulTextSchema,
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supportingDocumentUrl: z.string().url().optional().or(z.string().length(0)),
});

// 4. CEO Approval / Rejection
export const ceoApprovalSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], { message: 'Action must be either APPROVE or REJECT' }),
  approvedAmount: moneySchema.optional(),
  remarks: z.string().trim().max(1000).optional(),
}).refine(data => {
  if (data.action === 'APPROVE' && !data.approvedAmount) {
    return false;
  }
  return true;
}, { message: 'Approved amount is required when approving a request', path: ['approvedAmount'] });

// 5. Accounts Cash Disbursement
export const accountsDisbursementSchema = z.object({
  requestId: z.string().min(1, { message: 'Valid Request ID is required' }),
  disbursedAmount: moneySchema,
  paymentMode: z.enum(['Cash', 'Bank Transfer', 'UPI'], { message: 'Payment mode must be Cash, Bank Transfer, or UPI' }),
  paymentDate: notFutureDateSchema,
  paymentReference: z.string().trim().min(2, { message: 'Payment reference or voucher number is required' }).max(100),
  remarks: z.string().trim().max(1000).optional(),
  paymentProofUrl: z.string().optional(),
});

// 6. Custodian Receipt Confirmation
export const custodianReceiptConfirmationSchema = z.object({
  disbursementId: z.string().min(1, { message: 'Valid Disbursement ID is required' }),
  action: z.enum(['CONFIRM', 'DISPUTE'], { message: 'Action must be CONFIRM or DISPUTE' }),
  amountReceived: moneySchema.optional(),
  discrepancyReason: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().min(10, { message: 'Idempotency key required' }).max(128),
}).refine(data => {
  if (data.action === 'DISPUTE' && (!data.discrepancyReason || data.discrepancyReason.length < 5)) {
    return false;
  }
  return true;
}, { message: 'Discrepancy reason is required when disputing cash receipt', path: ['discrepancyReason'] });

// 7. Add Daily Expense
export const addDailyExpenseSchema = z.object({
  categoryId: z.string().min(1, { message: 'Valid Category ID is required' }),
  categoryName: z.string().trim().min(1, { message: 'Category Name is required' }),
  amount: moneySchema,
  expenseDate: notFutureDateSchema,
  reason: meaningfulTextSchema,
  paymentMode: z.enum(['Cash', 'UPI', 'Card', 'Other']).default('Cash'),
  billAttachmentUrl: z.string().optional(),
  idempotencyKey: z.string().trim().min(10).optional(),
});

// 8. Reverse Expense
export const reverseExpenseSchema = z.object({
  expenseId: z.string().min(1, { message: 'Valid Expense ID is required' }),
  reversalReason: meaningfulTextSchema,
});

// 9. Flag Expense
export const flagExpenseSchema = z.object({
  expenseId: z.string().min(1, { message: 'Valid Expense ID is required' }),
  flagReason: meaningfulTextSchema,
});

// 10. Category Management
export const categorySchema = z.object({
  name: meaningfulTextSchema,
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
