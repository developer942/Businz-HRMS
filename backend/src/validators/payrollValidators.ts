import { z } from 'zod';

export const salaryStructureSchema = z.object({
  monthlySalary: z.number().positive('Monthly salary must be greater than zero').max(100000000, 'Monthly salary exceeds maximum limit'),
  basicPercentage: z.number().min(0).max(100),
  daPercentage: z.number().min(0).max(100),
  conveyancePercentage: z.number().min(0).max(100),
  hraPercentage: z.number().min(0).max(100),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD').optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveTo must be YYYY-MM-DD').optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    const sum = data.basicPercentage + data.daPercentage + data.conveyancePercentage + data.hraPercentage;
    return Math.abs(sum - 100) <= 0.01;
  },
  {
    message: 'The sum of basic, DA, conveyance, and HRA percentages must equal exactly 100%',
    path: ['basicPercentage'],
  }
);

export const payrollPreviewSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required').max(50),
  payroll_month: z.number().int().min(1).max(12),
  payroll_year: z.number().int().min(1900).max(3500),
  attendance_bonus: z.number().min(0).max(10000000).default(0),
  overtime_hours: z.number().min(0).max(744).default(0),
  overtime_rate: z.number().min(0).max(100000).default(0),
  bonus: z.number().min(0).max(10000000).default(0),
  incentive: z.number().min(0).max(10000000).default(0),
  commission: z.number().min(0).max(10000000).default(0),
  other_earnings: z.number().min(0).max(10000000).default(0),
  lop_days: z.number().min(0).max(31).optional(),
  paid_leave_days: z.number().min(0).max(31).optional(),
  advance_recovery: z.number().min(0).max(10000000).default(0),
  loan_recovery: z.number().min(0).max(10000000).default(0),
  other_deductions: z.number().min(0).max(10000000).default(0),
  joining_date: z.string().max(30).optional().nullable(),
  exit_date: z.string().max(30).optional().nullable(),
  weekly_off: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  holidays: z.array(z.any()).optional(),
  weekly_schedules: z.array(z.any()).optional(),
  attendance_records: z.array(z.any()).optional(),
  leave_requests: z.array(z.any()).optional(),
  sandwich_policies: z.array(z.any()).optional(),
});

export const payrollRunCreateSchema = z.object({
  payroll_month: z.number().int().min(1).max(12),
  payroll_year: z.number().int().min(1900).max(3500),
});

export const payrollSettingsUpdateSchema = z.object({
  pfEnabled: z.boolean().optional(),
  pfRate: z.number().min(0).max(100).optional(),
  pfWageCeiling: z.number().positive().max(10000000).optional(),
  pfWageComponents: z.record(z.boolean()).optional(),
  esicEnabled: z.boolean().optional(),
  esicRate: z.number().min(0).max(100).optional(),
  esicSalaryThreshold: z.number().positive().max(10000000).optional(),
  esicWageComponents: z.record(z.boolean()).optional(),
  professionalTaxEnabled: z.boolean().optional(),
  professionalTaxAmount: z.number().min(0).max(100000).optional(),
  lopEnabled: z.boolean().optional(),
  attendanceBonusEnabled: z.boolean().optional(),
  overtimeEnabled: z.boolean().optional(),
  standardWorkingDays: z.number().int().min(1).max(31).optional(),
});

export const overtimeCreateSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required').max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  hours: z.number().positive('Hours must be positive').max(24, 'Overtime hours cannot exceed 24 per day'),
  hourly_rate: z.number().min(0).max(100000).default(0),
  reason: z.string().max(500).optional(),
});

export const advanceRecoveryCreateSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required').max(50),
  amount: z.number().positive('Amount must be positive').max(100000000),
  monthly_emi: z.number().positive('Monthly EMI must be positive').max(100000000),
  tenure_months: z.number().int().min(1).max(240),
  reason: z.string().max(500).optional(),
});
