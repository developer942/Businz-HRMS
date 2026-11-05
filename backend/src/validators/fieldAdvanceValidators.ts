import { z } from 'zod';

export const createFieldVisitSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  employee_code: z.string().optional().default(''),
  employee_name: z.string().min(1, 'Employee name is required'),
  department_id: z.string().optional().nullable(),
  department_name: z.string().optional().nullable(),
  purpose: z.string().min(3, 'Visit purpose must be at least 3 characters'),
  client_name: z.string().optional().default('Field Visit'),
  destination: z.string().min(1, 'Destination location is required'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid start date (YYYY-MM-DD) is required'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid end date (YYYY-MM-DD) is required'),
  funding_type: z.enum(['advance', 'personal']),
  requested_amount: z.number().min(0, 'Requested amount must be 0 or greater').default(0),
  travel_mode: z.string().optional().nullable(),
  justification: z.string().optional().nullable(),
  estimated_breakdown: z.array(z.object({
    item: z.string(),
    amount: z.number().min(0),
  })).optional().default([]),
  supporting_documents: z.array(z.object({
    name: z.string(),
    url: z.string(),
  })).optional().default([]),
  remarks: z.string().optional().nullable(),
}).refine(data => {
  if (data.funding_type === 'advance' && (!data.requested_amount || data.requested_amount <= 0)) {
    return false;
  }
  return true;
}, {
  message: 'Requested advance amount must be greater than 0 when requesting company advance',
  path: ['requested_amount'],
}).refine(data => {
  return data.end_date >= data.start_date;
}, {
  message: 'End date cannot be earlier than start date',
  path: ['end_date'],
});

export const approveAdvanceSchema = z.object({
  decision: z.enum(['Approved', 'Rejected', 'Correction Requested']),
  approved_amount: z.number().min(0).optional().nullable(),
  reason: z.string().optional().nullable(),
}).refine(data => {
  if (data.decision === 'Approved' && (data.approved_amount === undefined || data.approved_amount === null || data.approved_amount <= 0)) {
    return false;
  }
  return true;
}, {
  message: 'Approved amount must be greater than 0 for approved requests',
  path: ['approved_amount'],
}).refine(data => {
  if ((data.decision === 'Rejected' || data.decision === 'Correction Requested') && (!data.reason || !data.reason.trim())) {
    return false;
  }
  return true;
}, {
  message: 'A reason is required when rejecting or requesting clarification',
  path: ['reason'],
});

export const disburseAdvanceSchema = z.object({
  amount: z.number().positive('Disbursement amount must be greater than 0'),
  payment_method: z.enum(['Cash', 'Bank Transfer', 'UPI', 'Cheque']),
  payment_reference: z.string().optional().nullable(),
  proof_reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
}).refine(data => {
  if (['Bank Transfer', 'UPI', 'Cheque'].includes(data.payment_method) && (!data.payment_reference || !data.payment_reference.trim())) {
    return false;
  }
  return true;
}, {
  message: 'Transaction reference is required for non-cash payment methods',
  path: ['payment_reference'],
});

export const createExpenseItemSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid expense date is required'),
  category: z.enum([
    'Travel',
    'Bus',
    'Bus Travel',
    'Train',
    'Taxi / Auto',
    'Fuel',
    'Food',
    'Accommodation / Room',
    'Room',
    'Accommodation',
    'Local Transport',
    'Parking',
    'Toll',
    'Parking / Toll',
    'Customer Visit',
    'Other',
    'Other Approved Expenses',
  ]),
  amount: z.number().positive('Expense amount must be greater than 0'),
  description: z.string().min(2, 'Description must be at least 2 characters'),
  payment_method: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  receipt_url: z.string().optional().nullable(),
  receipt_file_name: z.string().optional().nullable(),
});

export const reviewSettlementSchema = z.object({
  decision: z.enum(['Approved', 'Rejected', 'Correction Requested']),
  approval_reason: z.string().optional().nullable(),
  expense_items: z.array(z.object({
    id: z.string(),
    approval_status: z.enum(['Approved', 'Rejected', 'Correction Requested']),
    rejection_reason: z.string().optional().nullable(),
  })).optional().default([]),
  item_decisions: z.array(z.object({
    expense_id: z.string(),
    status: z.enum(['Approved', 'Rejected', 'Correction Requested']),
    approved_amount: z.number().min(0).optional(),
    rejection_reason: z.string().optional().nullable(),
  })).optional().default([]),
}).transform(data => ({
  ...data,
  expense_items: data.expense_items.length > 0
    ? data.expense_items
    : data.item_decisions.map(d => ({
        id: d.expense_id,
        approval_status: d.status,
        rejection_reason: d.rejection_reason ?? null,
      })),
})).refine(data => {
  if ((data.decision === 'Rejected' || data.decision === 'Correction Requested') && (!data.approval_reason || !data.approval_reason.trim())) {
    return false;
  }
  return true;
}, {
  message: 'Approval / rejection reason is required when rejecting or requesting clarification',
  path: ['approval_reason'],
});

export const reportBalanceReturnSchema = z.object({
  employee_reported_amount: z.number().positive('Reported amount must be greater than 0'),
  payment_method: z.enum(['Cash Handover', 'Bank Transfer', 'UPI', 'Cheque']),
  payment_reference: z.string().optional().nullable(),
  proof_reference: z.string().optional().nullable(),
  handover_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required'),
  employee_remarks: z.string().optional().nullable(),
});

export const confirmBalanceReturnSchema = z.object({
  actual_received_amount: z.number().positive('Actual received amount must be greater than 0'),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required'),
  accounts_remarks: z.string().optional().nullable(),
  status: z.enum(['Confirmed', 'Partial Receipt', 'Mismatch Reported']),
});

export const disburseReimbursementSchema = z.object({
  amount: z.number().positive('Reimbursement payout amount must be greater than 0'),
  payment_method: z.enum(['Cash', 'Bank Transfer', 'UPI', 'Cheque']),
  payment_reference: z.string().optional().nullable(),
  proof_reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
}).refine(data => {
  if (['Bank Transfer', 'UPI', 'Cheque'].includes(data.payment_method) && (!data.payment_reference || !data.payment_reference.trim())) {
    return false;
  }
  return true;
}, {
  message: 'Transaction reference is required for non-cash payment methods',
  path: ['payment_reference'],
});
