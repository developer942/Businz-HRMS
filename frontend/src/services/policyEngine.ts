// VRM Enterprise HRM - Central Dynamic Policy & Rule Engine
import { 
  AttendancePolicy, 
  MasterLeavePolicy, 
  PayrollSettingsConfig, 
  EmployeeRewardRecord,
  AttendanceRecord,
  LeaveRequest,
  Employee,
  PayrollRecord,
  LoanRecord,
  LoanRepaymentInstallment
} from '../types/hrms';
import { SalaryComponentConfig } from '../types/settings';
import { toNum, formatCurrency } from '../utils/numbers';

// ========================================================
// 1. SAFE MATHEMATICAL FORMULA EVALUATOR (No eval)
// ========================================================
export interface FormulaContext {
  BASIC?: number;
  HRA?: number;
  GROSS?: number;
  CTC?: number;
  DAILY_SALARY?: number;
  WORKING_DAYS?: number;
  PAID_DAYS?: number;
  UNPAID_DAYS?: number;
  LATE_COUNT?: number;
  LEAVE_DAYS?: number;
  INCENTIVE?: number;
  BONUS?: number;
  REWARD?: number;
  [key: string]: number | undefined;
}

/**
 * Safely evaluates arithmetic expressions containing numbers, parentheses, operators (+, -, *, /),
 * and standard variables from the formula context.
 */
export const evaluateFormula = (formula: string, context: FormulaContext): number => {
  if (!formula || typeof formula !== 'string') return 0;

  // Substitute variables with numeric values from context
  let expr = formula.toUpperCase();
  const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = context[key];
    if (val !== undefined) {
      // Regex replace word boundaries
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expr = expr.replace(regex, `(${Number(val) || 0})`);
    }
  }

  // Sanitize: allow only digits, decimal points, parentheses, and arithmetic operators
  const sanitized = expr.replace(/[^0-9.+\-*/() ]/g, '');

  try {
    // Standard recursive-descent parser for arithmetic
    let index = 0;

    const parseNumber = (): number => {
      let numStr = '';
      while (index < sanitized.length && (/[0-9.]/).test(sanitized[index])) {
        numStr += sanitized[index];
        index++;
      }
      return parseFloat(numStr) || 0;
    };

    const parseFactor = (): number => {
      while (index < sanitized.length && sanitized[index] === ' ') index++;
      if (index >= sanitized.length) return 0;

      if (sanitized[index] === '(') {
        index++; // skip '('
        const res = parseExpression();
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        if (sanitized[index] === ')') index++; // skip ')'
        return res;
      }

      if (sanitized[index] === '-') {
        index++;
        return -parseFactor();
      }

      if (sanitized[index] === '+') {
        index++;
        return parseFactor();
      }

      return parseNumber();
    };

    const parseTerm = (): number => {
      let left = parseFactor();
      while (index < sanitized.length) {
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        const op = sanitized[index];
        if (op === '*' || op === '/') {
          index++;
          const right = parseFactor();
          if (op === '*') left = left * right;
          if (op === '/') left = right !== 0 ? left / right : 0;
        } else {
          break;
        }
      }
      return left;
    };

    const parseExpression = (): number => {
      let left = parseTerm();
      while (index < sanitized.length) {
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        const op = sanitized[index];
        if (op === '+' || op === '-') {
          index++;
          const right = parseTerm();
          if (op === '+') left = left + right;
          if (op === '-') left = left - right;
        } else {
          break;
        }
      }
      return left;
    };

    const result = parseExpression();
    return isNaN(result) || !isFinite(result) ? 0 : Math.round(result * 100) / 100;
  } catch {
    return 0;
  }
};

/**
 * Validates a formula string and runs a sample calculation with test values.
 */
export const validateFormula = (formula: string): { isValid: boolean; error?: string; sampleResult?: number } => {
  if (!formula || !formula.trim()) {
    return { isValid: false, error: 'Formula cannot be empty' };
  }

  // Check for balanced parentheses
  let balance = 0;
  for (const ch of formula) {
    if (ch === '(') balance++;
    if (ch === ')') balance--;
    if (balance < 0) return { isValid: false, error: 'Unbalanced parentheses' };
  }
  if (balance !== 0) return { isValid: false, error: 'Unclosed parenthesis' };

  // Check for forbidden characters
  const allowed = /^[A-Z0-9_.+\-*/() ]+$/i;
  if (!allowed.test(formula)) {
    return { isValid: false, error: 'Formula contains unsupported special characters' };
  }

  // Test evaluation context
  const testEvaluationContext: FormulaContext = {
    BASIC: 30000,
    HRA: 12000,
    GROSS: 45000,
    CTC: 50000,
    DAILY_SALARY: 1153.85,
    WORKING_DAYS: 26,
    PAID_DAYS: 24,
    UNPAID_DAYS: 2,
    LATE_COUNT: 4,
    LEAVE_DAYS: 2,
    INCENTIVE: 2000,
    BONUS: 3000,
    REWARD: 5000
  };

  try {
    const res = evaluateFormula(formula, testEvaluationContext);
    return { isValid: true, sampleResult: res };
  } catch (err: any) {
    return { isValid: false, error: err.message || 'Evaluation error' };
  }
};

// ========================================================
// 2. ATTENDANCE LATE DEDUCTION EVALUATION
// ========================================================
export interface LateDeductionResult {
  lateCount: number;
  severelyLateCount: number;
  deductionAmount: number;
  ruleApplied: string;
  isConfidential: boolean;
  genericCategoryLabel: string;
  details: string;
}

/**
 * Checks if a check-in time exceeds shift start time + grace period.
 */
export const isCheckInLate = (
  checkInStr: string | null, 
  shiftStartStr: string = '09:30', 
  graceMins: number = 10
): boolean => {
  if (!checkInStr) return false;

  const [cHour, cMin] = checkInStr.split(':').map(Number);
  const [sHour, sMin] = shiftStartStr.split(':').map(Number);

  if (isNaN(cHour) || isNaN(sHour)) return false;

  const checkInMinutes = cHour * 60 + (cMin || 0);
  const allowedMinutes = sHour * 60 + (sMin || 0) + graceMins;

  return checkInMinutes > allowedMinutes;
};

/**
 * Evaluates the attendance policy for an employee over a month to calculate late deductions.
 */
export const evaluateAttendanceLateDeduction = (
  employee: Employee,
  attendanceRecords: AttendanceRecord[],
  policy: AttendancePolicy | undefined,
  dailySalary: number,
  basicSalary: number
): LateDeductionResult => {
  const defaultResult: LateDeductionResult = {
    lateCount: 0,
    severelyLateCount: 0,
    deductionAmount: 0,
    ruleApplied: 'None',
    isConfidential: false,
    genericCategoryLabel: 'OTHERS',
    details: 'No deduction'
  };

  if (!policy || policy.status !== 'Active') {
    return defaultResult;
  }

  // Check eligibility: department or branch or specific employees
  if (policy.applicableEmployees !== 'ALL' && !policy.applicableEmployees.includes(employee.employeeId)) {
    return defaultResult;
  }
  if (policy.applicableDepartments !== 'ALL' && !policy.applicableDepartments.includes(employee.department)) {
    return defaultResult;
  }

  // Count late punches for this employee
  const empRecords = attendanceRecords.filter(r => r.employeeId === employee.employeeId);
  let lateCount = 0;
  let severelyLateCount = 0;

  empRecords.forEach(rec => {
    const isLate = rec.status === 'Late' || isCheckInLate(rec.checkIn, policy.startTime, policy.graceTimeMinutes);
    if (isLate) {
      lateCount++;
      if (rec.lateStatus === 'Severely Late') {
        severelyLateCount++;
      }
    }
  });

  if (lateCount === 0) {
    return {
      ...defaultResult,
      isConfidential: policy.deductionVisibility === 'GENERIC',
      genericCategoryLabel: policy.genericCategoryLabel || 'OTHERS'
    };
  }

  let deductionAmount = 0;
  let ruleApplied = '';

  switch (policy.lateRuleType) {
    case 'FIXED_AMOUNT': {
      const perLate = toNum(policy.fixedAmount || 100);
      deductionAmount = lateCount * perLate;
      ruleApplied = `Fixed ${formatCurrency(perLate)} per late entry (${lateCount} entries)`;
      break;
    }

    case 'PERCENTAGE_DAILY': {
      const pct = toNum(policy.percentageOfDailySalary || 5);
      const perOccurrence = (dailySalary * pct) / 100;
      deductionAmount = Math.round(lateCount * perOccurrence);
      ruleApplied = `${pct}% of Daily Salary (${formatCurrency(perOccurrence)}) × ${lateCount}`;
      break;
    }

    case 'COUNT_BASED': {
      // e.g. 1-3 free, 4-5 ₹100 each, 6+ ₹200 each
      const tiers = policy.countTiers || [
        { id: 't1', minCount: 1, maxCount: 3, deductionPerOccurrence: 0 },
        { id: 't2', minCount: 4, maxCount: 5, deductionPerOccurrence: 100 },
        { id: 't3', minCount: 6, maxCount: null, deductionPerOccurrence: 200 }
      ];

      for (let i = 1; i <= lateCount; i++) {
        const tier = tiers.find(t => i >= t.minCount && (t.maxCount === null || i <= t.maxCount));
        if (tier) {
          deductionAmount += toNum(tier.deductionPerOccurrence);
        }
      }
      ruleApplied = `Count-based tiered late deduction for ${lateCount} entries`;
      break;
    }

    case 'HALF_DAY_CONVERSION': {
      // Severely late entries converted to half days
      const halfDays = severelyLateCount;
      deductionAmount = Math.round(halfDays * (dailySalary * 0.5));
      ruleApplied = `${halfDays} entries converted to half-day deductions`;
      break;
    }

    case 'CUSTOM_FORMULA': {
      if (policy.customFormula) {
        deductionAmount = evaluateFormula(policy.customFormula, {
          LATE_COUNT: lateCount,
          DAILY_SALARY: dailySalary,
          BASIC: basicSalary
        });
        ruleApplied = `Formula: ${policy.customFormula}`;
      }
      break;
    }
  }

  return {
    lateCount,
    severelyLateCount,
    deductionAmount: Math.max(0, Math.round(deductionAmount)),
    ruleApplied,
    isConfidential: policy.deductionVisibility === 'GENERIC',
    genericCategoryLabel: policy.genericCategoryLabel || 'OTHERS',
    details: `${policy.policyName}: ${ruleApplied}`
  };
};

// ========================================================
// 3. LEAVE DEDUCTION EVALUATION
// ========================================================
export interface LeaveDeductionResult {
  totalUnpaidDays: number;
  allowedFreeDays: number;
  excessUnpaidDays: number;
  deductionAmount: number;
  ruleApplied: string;
  isConfidential: boolean;
  genericCategoryLabel: string;
  details: string;
  sandwichUnpaidDays?: number;
  sandwichDeduction?: number;
}

/**
 * Evaluates the master leave policy for an employee over a month to calculate unpaid leave deductions.
 */
export const evaluateLeaveDeductions = (
  employee: Employee,
  leaveRequests: LeaveRequest[],
  policy: MasterLeavePolicy | undefined,
  dailySalary: number,
  basicSalary: number
): LeaveDeductionResult => {
  const defaultResult: LeaveDeductionResult = {
    totalUnpaidDays: 0,
    allowedFreeDays: 1,
    excessUnpaidDays: 0,
    deductionAmount: 0,
    ruleApplied: 'None',
    isConfidential: false,
    genericCategoryLabel: 'OTHERS',
    details: 'No unpaid leave deduction',
    sandwichUnpaidDays: 0,
    sandwichDeduction: 0
  };

  // Find all approved leaves for this employee
  const approvedLeaves = leaveRequests.filter(
    l => l.employeeId === employee.employeeId && l.status === 'Approved'
  );

  const isProv = policy?.applicableEmploymentType === 'Provisional' || 
    policy?.id === 'LP-MASTER-PROVISIONAL' || 
    (policy?.policyName || '').toLowerCase().includes('provisional') || 
    (policy?.policyName || '').toLowerCase().includes('probation');

  let paidLeavesTaken = 0;
  let regularUnpaidDays = 0;
  let sandwichUnpaidDays = 0;

  approvedLeaves.forEach(l => {
    const leaveName = (l.leaveType || '').toLowerCase();
    const isExplicitUnpaid = leaveName.includes('unpaid') || leaveName.includes('lop') || leaveName.includes('loss of pay');
    if (isExplicitUnpaid) {
      regularUnpaidDays += toNum(l.daysCount);
    } else {
      paidLeavesTaken += toNum(l.daysCount);
    }

    // Also include unpaid sandwich days
    if (l.unpaidSandwichDays && l.unpaidSandwichDays > 0) {
      sandwichUnpaidDays += toNum(l.unpaidSandwichDays);
    } else if (l.sandwichDetails?.unpaidDays && l.sandwichDetails.unpaidDays > 0 && !isExplicitUnpaid) {
      sandwichUnpaidDays += toNum(l.sandwichDetails.unpaidDays);
    }
  });

  // Calculate excess paid leave days beyond allowed policy quota:
  // - Confirmed: 1 day paid casual leave allowed per month. Excess incurs salary deduction.
  // - Provisional: 1 day paid leave allowed during the first 3 months of probation. Excess incurs salary deduction.
  const allowedPaidQuota = 1;
  const excessPaidLeaves = Math.max(0, paidLeavesTaken - allowedPaidQuota);

  // For provisional employees, free unpaid days is strictly 0 (any leave past 1 paid day incurs deduction)
  // For confirmed employees, monthly free unpaid leaves comes from policy (default 1)
  const freeDays = isProv ? 0 : (policy ? toNum(policy.monthlyFreeUnpaidLeaves ?? 1) : 1);
  const totalUnpaidDays = regularUnpaidDays + sandwichUnpaidDays + excessPaidLeaves;
  const excessUnpaidDays = isProv 
    ? (regularUnpaidDays + sandwichUnpaidDays + excessPaidLeaves)
    : Math.max(0, (regularUnpaidDays + sandwichUnpaidDays) - (paidLeavesTaken === 0 ? freeDays : 0) + excessPaidLeaves);

  const sandwichDeduction = Math.round(sandwichUnpaidDays * dailySalary);

  if (totalUnpaidDays === 0 || excessUnpaidDays === 0) {
    return {
      ...defaultResult,
      totalUnpaidDays,
      allowedFreeDays: freeDays,
      excessUnpaidDays: 0,
      deductionAmount: 0,
      ruleApplied: isProv 
        ? 'Within Provisional 1 Paid Leave allowance' 
        : `Within ${freeDays} paid/free leave allowance`,
      isConfidential: policy?.deductionVisibility === 'GENERIC',
      genericCategoryLabel: policy?.genericCategoryLabel || 'OTHERS',
      details: isProv 
        ? 'Provisional leave covered by 1-day probation allowance.' 
        : `Covered by 1 day/month paid leave allowance.`
    };
  }

  let deductionAmount = 0;
  let ruleApplied = '';

  const ruleType = policy?.deductionRuleType || 'DAILY_SALARY';

  switch (ruleType) {
    case 'DAILY_SALARY': {
      const multiplier = toNum(policy?.dailySalaryMultiplier || 1);
      deductionAmount = excessUnpaidDays * (dailySalary * multiplier);
      ruleApplied = `${excessUnpaidDays} excess day(s) × Daily Salary (${formatCurrency(dailySalary * multiplier)})`;
      break;
    }

    case 'FIXED_AMOUNT': {
      const perDay = toNum(policy?.fixedDeductionAmount || 1000);
      deductionAmount = excessUnpaidDays * perDay;
      ruleApplied = `Fixed ${formatCurrency(perDay)} per excess day (${excessUnpaidDays} days)`;
      break;
    }

    case 'PERCENTAGE': {
      const pct = toNum(policy?.percentageOfDailySalary || 100);
      deductionAmount = excessUnpaidDays * ((dailySalary * pct) / 100);
      ruleApplied = `${pct}% of Daily Salary for ${excessUnpaidDays} excess day(s)`;
      break;
    }

    case 'CUSTOM_FORMULA': {
      if (policy?.customFormula) {
        deductionAmount = evaluateFormula(policy.customFormula, {
          UNPAID_DAYS: excessUnpaidDays,
          DAILY_SALARY: dailySalary,
          BASIC: basicSalary
        });
        ruleApplied = `Formula: ${policy.customFormula}`;
      } else {
        deductionAmount = excessUnpaidDays * dailySalary;
      }
      break;
    }
  }

  return {
    totalUnpaidDays,
    allowedFreeDays: freeDays,
    excessUnpaidDays,
    deductionAmount: Math.max(0, Math.round(deductionAmount)),
    ruleApplied,
    isConfidential: policy?.deductionVisibility === 'GENERIC',
    genericCategoryLabel: policy?.genericCategoryLabel || 'OTHERS',
    details: `${policy?.policyName || 'Unpaid Leave Policy'}: ${ruleApplied}${sandwichUnpaidDays > 0 ? ` (includes ${sandwichUnpaidDays} unpaid sandwich day(s))` : ''}`,
    sandwichUnpaidDays,
    sandwichDeduction
  };
};

// ========================================================
// 4. STATUTORY CONTRIBUTIONS (PF, ESIC, PT)
// ========================================================
export interface StatutoryDeductionsResult {
  epfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  totalStatutory: number;
  epfRule: string;
  esiRule: string;
  pfBaseAmount?: number;
  pfBaseLabel?: string;
  pfFormulaLabel?: string;
  esicFormulaLabel?: string;
  isEsicExempt?: boolean;
  pfActive?: boolean;
  esicActive?: boolean;
  ptActive?: boolean;
}

export const resolveEmployeeWithPf = (employee?: Pick<Employee, 'withPf' | 'salaryDetails'> | null): boolean => {
  const scheme = employee?.salaryDetails?.salaryScheme;
  if (scheme === 'WITH_PF') return true;
  if (scheme === 'WITHOUT_PF') return false;
  if (employee?.salaryDetails?.withPf !== undefined) return Boolean(employee.salaryDetails.withPf);
  if (employee?.withPf !== undefined) return Boolean(employee.withPf);
  return true;
};

export type StatutoryDeductionKind = 'PF' | 'ESIC' | 'PT';

export const getStatutoryDeductionKind = (component: Pick<SalaryComponentConfig, 'code' | 'name'>): StatutoryDeductionKind | null => {
  const code = (component.code || '').trim().toUpperCase();
  const name = (component.name || '').trim().toLowerCase();
  const combined = `${code} ${name}`;

  if (
    ['PF', 'EPF', 'ERF', 'PF_EMPLOYEE', 'EMPLOYEE_PF'].includes(code) ||
    combined.includes('provident fund') ||
    combined.includes('employee pf') ||
    combined.includes(' epf ')
  ) {
    return 'PF';
  }

  if (
    ['ESIC', 'ESI'].includes(code) ||
    combined.includes('state insurance') ||
    combined.includes('esic') ||
    combined.includes('esi contribution')
  ) {
    return 'ESIC';
  }

  if (['PT', 'PROFESSIONAL_TAX'].includes(code) || combined.includes('professional tax')) {
    return 'PT';
  }

  return null;
};

export interface PayrollFormulaContextInput {
  basic: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  gross: number;
  ctc: number;
  attendanceBonus?: number;
  overtime?: number;
  customContext?: Record<string, number>;
}

export const buildPayrollFormulaContext = ({
  basic,
  da = 0,
  conveyance = 0,
  hra = 0,
  gross,
  ctc,
  attendanceBonus = 0,
  overtime = 0,
  customContext = {}
}: PayrollFormulaContextInput): FormulaContext => {
  const context: FormulaContext = {
    BASIC: toNum(basic),
    DA: toNum(da),
    CONV: toNum(conveyance),
    CONVEYANCE: toNum(conveyance),
    HRA: toNum(hra),
    GROSS: toNum(gross),
    CTC: toNum(ctc),
    ATTENDANCE_BONUS: toNum(attendanceBonus),
    OVERTIME: toNum(overtime)
  };

  Object.entries(customContext || {}).forEach(([key, value]) => {
    const amount = toNum(value);
    context[key] = amount;
    context[key.toUpperCase()] = amount;
  });

  return context;
};

export const getComponentCalculationDescription = (
  component: Pick<SalaryComponentConfig, 'calculationMethod' | 'defaultValue' | 'percentageBase' | 'formula'>
): string => {
  if (component.calculationMethod === 'FIXED_AMOUNT') {
    return `Fixed ${formatCurrency(component.defaultValue || 0)}`;
  }
  if (component.calculationMethod === 'PERCENTAGE') {
    return `${component.defaultValue || 0}% of ${component.percentageBase || 'GROSS'}`;
  }
  if (component.calculationMethod === 'FORMULA') {
    return component.formula ? `Formula: ${component.formula}` : 'Formula not configured';
  }
  return '';
};

export const calculateConfiguredComponentAmount = (
  component: SalaryComponentConfig,
  context: FormulaContext
): number => {
  if (!component.active) return 0;

  if (component.calculationMethod === 'FIXED_AMOUNT') {
    return Math.max(0, Math.round(toNum(component.defaultValue)));
  }

  if (component.calculationMethod === 'PERCENTAGE') {
    const baseKey = component.percentageBase || 'GROSS';
    const base = toNum(context[baseKey], baseKey === 'CTC' ? context.CTC : context.GROSS);
    return Math.max(0, Math.round((base * toNum(component.defaultValue)) / 100));
  }

  if (component.calculationMethod === 'FORMULA' && component.formula) {
    return Math.max(0, Math.round(evaluateFormula(component.formula, context)));
  }

  return 0;
};

export interface ConfiguredDeductionLine {
  id: string;
  name: string;
  code: string;
  amount: number;
  description: string;
  statutoryKind: StatutoryDeductionKind | null;
  isConfidential: boolean;
}

export const calculateConfiguredDeductionLines = (
  components: SalaryComponentConfig[] | undefined,
  context: FormulaContext,
  options: { withPf?: boolean; esicSalaryLimit?: number } = {}
): ConfiguredDeductionLine[] => {
  const withPf = options.withPf !== false;
  const gross = toNum(context.GROSS);
  const esicLimit = toNum(options.esicSalaryLimit);

  return (components || [])
    .filter(component => component.active && component.type === 'DEDUCTION')
    .map(component => {
      const statutoryKind = getStatutoryDeductionKind(component);
      let amount = calculateConfiguredComponentAmount(component, context);
      let description = getComponentCalculationDescription(component);

      if ((statutoryKind === 'PF' || statutoryKind === 'ESIC') && !withPf) {
        amount = 0;
        description = 'Exempt Scheme';
      } else if (statutoryKind === 'ESIC' && component.calculationMethod !== 'FORMULA' && esicLimit > 0 && gross > esicLimit) {
        amount = 0;
        description = `Exempt: Gross ${formatCurrency(gross)} exceeds ${formatCurrency(esicLimit)}`;
      }

      return {
        id: component.id,
        name: component.name,
        code: component.code,
        amount,
        description,
        statutoryKind,
        isConfidential: component.isConfidential
      };
    });
};

export const evaluateStatutoryContributions = (
  basicSalary: number,
  grossSalary: number,
  payrollConfig: PayrollSettingsConfig | undefined,
  withPf: boolean = true,
  da: number = 0,
  conveyance: number = 0,
  hra: number = 0,
  attendanceBonus: number = 0,
  overtime: number = 0,
  customContext?: Record<string, number>
): StatutoryDeductionsResult => {
  const ptActive = !payrollConfig || payrollConfig.enableProfessionalTax !== false;
  let professionalTax = 0;
  if (ptActive) {
    professionalTax = payrollConfig?.standardPtAmount || 200;
  }
  const pfActive = payrollConfig?.pfPolicy?.active !== false;
  const esicActive = payrollConfig?.esicPolicy?.active !== false;

  // Scheme 1: Without PF & ESIC (New Employee / Under 6 Months probation)
  // PF and ESIC are strictly 0!
  if (!withPf) {
    return {
      epfDeduction: 0,
      esiDeduction: 0,
      professionalTax,
      totalStatutory: professionalTax,
      epfRule: 'Exempt (New Employee / < 6 Months)',
      esiRule: 'Exempt (New Employee / < 6 Months)',
      pfBaseAmount: 0,
      pfBaseLabel: 'Exempt Scheme',
      pfFormulaLabel: 'Exempt (0%)',
      esicFormulaLabel: 'Exempt (0%)',
      isEsicExempt: true,
      pfActive,
      esicActive,
      ptActive
    };
  }

  // Scheme 2: With PF & ESIC (Eligible / > 6 Months)
  let epfDeduction = 0;
  let epfRule = '';
  let pfBaseAmount = 0;
  let pfBaseLabel = 'PF Base (Basic + DA + Conv)';
  let pfFormulaLabel = '';

  if (!pfActive) {
    epfDeduction = 0;
    epfRule = 'Inactive in Settings';
    pfFormulaLabel = 'Disabled';
  } else {
    const pfRate = payrollConfig?.pfPolicy?.percentage ?? 12;
    const calcType = payrollConfig?.pfPolicy?.calculationType || 'PERCENTAGE';
    const calcBase = payrollConfig?.pfPolicy?.calculationBase || 'CUSTOM';

    // Build context for formula evaluation
    const formulaContext: FormulaContext = {
      BASIC: basicSalary,
      DA: da,
      CONV: conveyance,
      CONVEYANCE: conveyance,
      HRA: hra,
      GROSS: grossSalary,
      CTC: grossSalary,
      ATTENDANCE_BONUS: attendanceBonus,
      OVERTIME: overtime,
      ...(customContext || {})
    };

    if (calcType === 'FORMULA' && payrollConfig?.pfPolicy?.formula) {
      epfDeduction = Math.round(evaluateFormula(payrollConfig.pfPolicy.formula, formulaContext));
      epfRule = `Formula: ${payrollConfig.pfPolicy.formula}`;
      pfFormulaLabel = payrollConfig.pfPolicy.formula;

      const upperForm = payrollConfig.pfPolicy.formula.toUpperCase();
      if (upperForm.includes('BASIC') && (upperForm.includes('DA') || upperForm.includes('CONV'))) {
        pfBaseAmount = basicSalary + da + conveyance;
        pfBaseLabel = 'Basic + DA + Conv';
      } else if (upperForm.includes('BASIC')) {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Basic';
      } else if (upperForm.includes('GROSS')) {
        pfBaseAmount = grossSalary;
        pfBaseLabel = 'Gross';
      } else {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Base';
      }
    } else if (calcType === 'FIXED_AMOUNT') {
      epfDeduction = Math.round(payrollConfig?.pfPolicy?.fixedAmount || 0);
      pfBaseAmount = epfDeduction;
      pfBaseLabel = 'Fixed Base';
      epfRule = `Fixed Amount ${formatCurrency(epfDeduction)}`;
      pfFormulaLabel = `Fixed ${formatCurrency(epfDeduction)}`;
    } else {
      // PERCENTAGE mode
      if (calcBase === 'BASIC') {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Basic';
      } else if (calcBase === 'GROSS') {
        pfBaseAmount = grossSalary;
        pfBaseLabel = 'Gross';
      } else {
        pfBaseAmount = basicSalary + da + conveyance;
        pfBaseLabel = 'Basic + DA + Conv';
      }
      epfDeduction = Math.round((pfBaseAmount * pfRate) / 100);
      epfRule = `${pfRate}% of Base ${formatCurrency(pfBaseAmount)}`;
      pfFormulaLabel = `${pfRate}%`;
    }
  }

  // ESIC Calculation: Applicable only when gross is within statutory ceiling (₹21,000)
  const esicLimit = payrollConfig?.esicPolicy?.grossSalaryLimit || 21000;
  const esicBase = basicSalary + da + conveyance + hra + attendanceBonus + overtime;
  let esiDeduction = 0;
  let esiRule = '';
  let esicFormulaLabel = '';
  let isEsicExempt = false;

  if (!esicActive) {
    esiDeduction = 0;
    esiRule = 'Inactive in Settings';
    esicFormulaLabel = 'Disabled';
  } else if (grossSalary <= esicLimit || esicBase <= esicLimit) {
    const esicRate = payrollConfig?.esicPolicy?.percentage ?? 0.75;
    if (payrollConfig?.esicPolicy?.formula) {
      esiDeduction = Math.round(evaluateFormula(payrollConfig.esicPolicy.formula, {
        GROSS: grossSalary,
        BASIC: basicSalary,
        HRA: hra,
        DA: da,
        CONV: conveyance,
        ...(customContext || {})
      }));
      esiRule = `Formula: ${payrollConfig.esicPolicy.formula}`;
      esicFormulaLabel = payrollConfig.esicPolicy.formula;
    } else {
      esiDeduction = Math.round((grossSalary * esicRate) / 100);
      esiRule = `${esicRate}% of Gross ${formatCurrency(grossSalary)}`;
      esicFormulaLabel = `${esicRate}%`;
    }
  } else {
    isEsicExempt = true;
    esiDeduction = 0;
    esiRule = `Gross ${formatCurrency(grossSalary)} exceeds wage ceiling ${formatCurrency(esicLimit)}`;
    esicFormulaLabel = `Exempt (> ${formatCurrency(esicLimit)})`;
  }

  return {
    epfDeduction,
    esiDeduction,
    professionalTax,
    totalStatutory: epfDeduction + esiDeduction + professionalTax,
    epfRule,
    esiRule,
    pfBaseAmount,
    pfBaseLabel,
    pfFormulaLabel,
    esicFormulaLabel,
    isEsicExempt,
    pfActive,
    esicActive,
    ptActive
  };
};

export interface SalaryBreakdownResult {
  monthlyCtc: number;
  basicSalary: number;
  da: number;
  conveyance: number;
  hra: number;
  customComponents: Record<string, number>;
  grossSalary: number;
}

/**
 * Centrally and dynamically calculates the complete salary component breakdown
 * based strictly on the active earnings configured in Settings → Payroll Settings.
 * If zero components are configured, returns a clean slate without mock values.
 */
export const calculateSalaryBreakdown = (
  ctcVal: number,
  components: SalaryComponentConfig[]
): SalaryBreakdownResult => {
  const ctc = Math.max(0, ctcVal);
  const activeEarnings = (components || []).filter(c => c.active && c.type === 'EARNING');

  if (activeEarnings.length === 0) {
    return {
      monthlyCtc: ctc,
      basicSalary: ctc,
      da: 0,
      conveyance: 0,
      hra: 0,
      customComponents: {},
      grossSalary: ctc
    };
  }

  const customVals: Record<string, number> = {};
  let basic = 0;
  let da = 0;
  let conveyance = 0;
  let hra = 0;

  // 1. Identify primary base component (e.g. BASIC or first earning)
  const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
  if (basicComp) {
    if (basicComp.calculationMethod === 'PERCENTAGE') {
      const pct = basicComp.defaultValue || 0;
      basic = Math.round((ctc * pct) / 100);
    } else if (basicComp.calculationMethod === 'FIXED_AMOUNT') {
      basic = Math.round(basicComp.defaultValue || 0);
    }
    customVals[basicComp.code] = basic;
  }

  // 2. Evaluate CTC-percentage components & fixed amounts
  activeEarnings.forEach(comp => {
    if (comp === basicComp) return;
    if (comp.calculationMethod === 'FIXED_AMOUNT') {
      customVals[comp.code] = Math.round(comp.defaultValue || 0);
    } else if (comp.calculationMethod === 'PERCENTAGE' && (comp.percentageBase === 'CTC' || !comp.percentageBase)) {
      customVals[comp.code] = Math.round((ctc * (comp.defaultValue || 0)) / 100);
    }
  });

  // If no basic component was found, derive basic from first component or 40%
  if (!basicComp) {
    const firstCode = activeEarnings[0]?.code;
    basic = customVals[firstCode] || Math.round(ctc * 0.40);
  }

  // 3. Evaluate BASIC-percentage components
  activeEarnings.forEach(comp => {
    if (comp.calculationMethod === 'PERCENTAGE' && comp.percentageBase === 'BASIC') {
      customVals[comp.code] = Math.round((basic * (comp.defaultValue || 0)) / 100);
    }
  });

  // 4. Evaluate GROSS-percentage & FORMULA components
  const interimGross = Object.values(customVals).reduce((a, b) => a + b, 0);
  activeEarnings.forEach(comp => {
    if (comp.calculationMethod === 'PERCENTAGE' && comp.percentageBase === 'GROSS') {
      customVals[comp.code] = Math.round((interimGross * (comp.defaultValue || 0)) / 100);
    } else if (comp.calculationMethod === 'FORMULA' && comp.formula) {
      customVals[comp.code] = Math.round(evaluateFormula(comp.formula, {
        BASIC: basic,
        CTC: ctc,
        GROSS: interimGross || ctc,
        ...customVals
      }));
    }
  });

  // Map known fields if configured
  if (customVals['BASIC'] !== undefined) basic = customVals['BASIC'];
  if (customVals['DA'] !== undefined) da = customVals['DA'];
  if (customVals['HRA'] !== undefined) hra = customVals['HRA'];
  if (customVals['CONV'] !== undefined) conveyance = customVals['CONV'];
  else if (customVals['CONVEYANCE'] !== undefined) conveyance = customVals['CONVEYANCE'];

  const grossSalary = activeEarnings.reduce((sum, c) => sum + (customVals[c.code] ?? 0), 0);

  return {
    monthlyCtc: ctc,
    basicSalary: basic,
    da,
    conveyance,
    hra,
    customComponents: customVals,
    grossSalary
  };
};

// ========================================================
// 5. EMPLOYEE REWARDS INTEGRATION
// ========================================================
export interface RewardEarningsResult {
  totalRewardEarnings: number;
  rewardItems: EmployeeRewardRecord[];
  rewardBreakdown: { title: string; amount: number }[];
}

export const evaluateEmployeeRewards = (
  employeeId: string,
  rewardRecords: EmployeeRewardRecord[]
): RewardEarningsResult => {
  const eligible = rewardRecords.filter(
    r => r.employeeId === employeeId && r.addToPayroll && r.payrollStatus === 'Pending'
  );

  const total = eligible.reduce((sum, r) => sum + toNum(r.amount), 0);
  const breakdown = eligible.map(r => ({
    title: r.rewardName,
    amount: toNum(r.amount)
  }));

  return {
    totalRewardEarnings: total,
    rewardItems: eligible,
    rewardBreakdown: breakdown
  };
};

// ========================================================
// 6. CENTRAL CALCULATION ENGINE
// ========================================================
export interface FullPayrollCalculationResult {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  withPf?: boolean;
  bonus: number;
  attendanceBonus?: number;
  rewardEarnings: number;
  grossSalary: number;

  // Deductions
  epfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  statutoryDeductions: number;
  advanceDeduction: number;
  lateAttendanceDeduction: number;
  unpaidLeaveDeduction: number;
  sandwichUnpaidDays?: number;
  sandwichDeduction?: number;
  totalDeductions: number;

  netSalary: number;

  // Days
  workingDays: number;
  presentDays: number;
  paidDays: number;
  paidLeaves: number;
  unpaidLeaves: number;

  // Policy references & details
  lateDetails: LateDeductionResult;
  leaveDetails: LeaveDeductionResult;
  statutoryDetails: StatutoryDeductionsResult;
  rewardDetails: RewardEarningsResult;
  earningsBreakdown: { name: string; category: 'EARNING'; amount: number; description?: string }[];
  deductionsBreakdown: { name: string; category: 'DEDUCTION'; amount: number; description?: string }[];
}

export const calculateEmployeePayroll = (
  employee: Employee,
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  advanceSalaryRecords: LoanRecord[],
  rewardRecords: EmployeeRewardRecord[],
  attendancePolicy: AttendancePolicy | undefined,
  leavePolicy: MasterLeavePolicy | undefined,
  payrollConfig: PayrollSettingsConfig | undefined,
  month: string = 'August',
  year: number = 2026
): FullPayrollCalculationResult => {
  const configuredComponents = payrollConfig?.components || [];
  const configuredEarnings = configuredComponents.filter(c => c.active && c.type === 'EARNING');
  const configuredDeductions = configuredComponents.filter(c => c.active && c.type === 'DEDUCTION');
  const savedComponentValues: Record<string, number> = {
    ...((employee.allowances as any) || {}),
    ...((employee.salaryDetails as any) || {})
  };

  let basic = toNum(employee.salaryDetails?.basicSalary ?? employee.basicSalary);

  // Dynamic CTC resolution based on configured Basic percentage.
  const basicComp = configuredEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
  const basicPercentage = (basicComp && basicComp.calculationMethod === 'PERCENTAGE' && basicComp.percentageBase === 'CTC' && basicComp.defaultValue > 0)
    ? basicComp.defaultValue
    : 40;
  const totalCtc = employee.salaryDetails?.monthlyCtc || (basic > 0 ? Math.round(basic / (basicPercentage / 100)) : 15000);
  const configuredBreakdown = calculateSalaryBreakdown(totalCtc, configuredEarnings);
  const getSavedComponentAmount = (code: string): number | undefined => {
    const lower = code.toLowerCase();
    const raw = savedComponentValues[code] ?? savedComponentValues[lower];
    return raw !== undefined && raw !== null && toNum(raw) > 0 ? toNum(raw) : undefined;
  };

  const earningsBreakdown: { name: string; category: 'EARNING'; amount: number; description?: string }[] = [];

  let calculatedAllowances = 0;
  let dynamicDa = 0;
  let dynamicConveyance = 0;
  let dynamicHra = 0;

  if (configuredEarnings.length > 0) {
    configuredEarnings.forEach(comp => {
      const configuredAmount = configuredBreakdown.customComponents[comp.code] || 0;
      const savedAmount = getSavedComponentAmount(comp.code);
      const actualVal = (savedAmount !== undefined && savedAmount > 0)
        ? savedAmount
        : (configuredAmount > 0 ? configuredAmount : (savedAmount ?? 0));

      if (actualVal > 0) {
        earningsBreakdown.push({
          name: comp.name.trim(),
          category: 'EARNING',
          amount: actualVal,
          description: getComponentCalculationDescription(comp)
        });
      }

      const code = comp.code.toUpperCase();
      if (code === 'BASIC' || comp.name.toLowerCase().includes('basic')) {
        basic = actualVal;
      } else if (code === 'DA') {
        dynamicDa = actualVal;
        calculatedAllowances += actualVal;
      } else if (code === 'CONV' || code === 'CONVEYANCE') {
        dynamicConveyance = actualVal;
        calculatedAllowances += actualVal;
      } else if (code === 'HRA') {
        dynamicHra = actualVal;
        calculatedAllowances += actualVal;
      } else {
        calculatedAllowances += actualVal;
      }
    });
  } else {
    dynamicDa = toNum(employee.allowances?.da ?? employee.salaryDetails?.da);
    dynamicConveyance = toNum(employee.allowances?.conveyance ?? employee.salaryDetails?.conveyance);
    dynamicHra = toNum(employee.allowances?.hra ?? employee.salaryDetails?.hra);
    calculatedAllowances = dynamicDa + dynamicConveyance + dynamicHra;
    if (basic > 0) earningsBreakdown.push({ name: 'Basic Salary', category: 'EARNING', amount: basic });
    if (dynamicDa > 0) earningsBreakdown.push({ name: 'Dearness Allowance (DA)', category: 'EARNING', amount: dynamicDa });
    if (dynamicConveyance > 0) earningsBreakdown.push({ name: 'Conveyance Allowance', category: 'EARNING', amount: dynamicConveyance });
    if (dynamicHra > 0) earningsBreakdown.push({ name: 'House Rent Allowance (HRA)', category: 'EARNING', amount: dynamicHra });
  }

  const da = dynamicDa;
  const conveyance = dynamicConveyance;
  const hra = dynamicHra;
  const allowances = calculatedAllowances;
  const standardDays = payrollConfig?.standardWorkingDaysPerMonth || 26;

  const dailySalary = standardDays > 0 ? basic / standardDays : basic / 26;

  // 1. Attendance & Present Days
  const empAtt = attendanceRecords.filter(a => a.employeeId === employee.employeeId);
  const presentCount = empAtt.filter(
    a => a.status === 'Present' || a.status === 'Late' || a.status === 'Work From Home'
  ).length;
  const presentDays = presentCount > 0 ? Math.min(standardDays, presentCount) : (employee.status === 'Active' ? standardDays : 0);

  // 2. Late Attendance Policy Evaluation
  const lateDetails = evaluateAttendanceLateDeduction(
    employee,
    attendanceRecords,
    attendancePolicy,
    dailySalary,
    basic
  );

  // 3. Leave Policy Evaluation
  const leaveDetails = evaluateLeaveDeductions(
    employee,
    leaveRequests,
    leavePolicy,
    dailySalary,
    basic
  );

  // 4. Rewards Evaluation
  const rewardDetails = evaluateEmployeeRewards(employee.employeeId, rewardRecords);

  const approvedPaidLeaveDays = leaveRequests
    .filter(l => l.employeeId === employee.employeeId && l.status === 'Approved')
    .filter(l => {
      const leaveName = (l.leaveType || '').toLowerCase();
      return !leaveName.includes('unpaid') && !leaveName.includes('lop') && !leaveName.includes('loss of pay');
    })
    .reduce((sum, l) => sum + toNum(l.daysCount), 0);
  const paidDays = Math.min(standardDays, Math.max(0, presentDays + approvedPaidLeaveDays));
  const salaryProrationFactor = standardDays > 0 ? paidDays / standardDays : 1;
  const prorateSalary = (value: number) => Math.round(toNum(value) * salaryProrationFactor);
  const payableBasic = prorateSalary(basic);
  const payableDa = prorateSalary(da);
  const payableConveyance = prorateSalary(conveyance);
  const payableHra = prorateSalary(hra);
  const payableAllowances = prorateSalary(allowances);

  earningsBreakdown.forEach(item => {
    item.amount = prorateSalary(item.amount);
    item.description = [item.description, `Paid ${paidDays}/${standardDays} days`].filter(Boolean).join(' | ');
  });

  // Attendance bonus: granted dynamically ONLY when employee achieves 100% attendance
  const isFullAttendance = presentDays >= standardDays && standardDays > 0 && (leaveDetails.totalUnpaidDays || 0) === 0;
  const attendanceBonus = isFullAttendance ? 1000 : 0;

  const bonus = 0;
  if (attendanceBonus > 0) {
    earningsBreakdown.push({ name: 'Attendance Bonus', category: 'EARNING', amount: attendanceBonus });
  }
  rewardDetails.rewardBreakdown.forEach(item => {
    if (toNum(item.amount) > 0) {
      earningsBreakdown.push({ name: item.title, category: 'EARNING', amount: toNum(item.amount), description: 'Reward configured for payroll' });
    }
  });
  const grossSalary = payableBasic + payableAllowances + attendanceBonus + bonus + rewardDetails.totalRewardEarnings;

  const withPf = resolveEmployeeWithPf(employee);

  const payableComponentContext: Record<string, number> = {};
  configuredEarnings.forEach(comp => {
    const configuredAmount = configuredBreakdown.customComponents[comp.code] || 0;
    const savedAmount = getSavedComponentAmount(comp.code);
    const actualVal = (savedAmount !== undefined && savedAmount > 0)
      ? savedAmount
      : (configuredAmount > 0 ? configuredAmount : (savedAmount ?? 0));
    payableComponentContext[comp.code] = prorateSalary(actualVal);
  });

  const deductionContext = buildPayrollFormulaContext({
    basic: payableBasic,
    da: payableDa,
    conveyance: payableConveyance,
    hra: payableHra,
    gross: grossSalary,
    ctc: totalCtc,
    attendanceBonus,
    customContext: payableComponentContext
  });
  const configuredDeductionLines = calculateConfiguredDeductionLines(configuredDeductions, deductionContext, {
    withPf,
    esicSalaryLimit: payrollConfig?.esicPolicy?.grossSalaryLimit || 21000
  });
  const epfDeduction = configuredDeductionLines.find(d => d.statutoryKind === 'PF')?.amount || 0;
  const esiDeduction = configuredDeductionLines.find(d => d.statutoryKind === 'ESIC')?.amount || 0;
  const professionalTax = configuredDeductionLines.find(d => d.statutoryKind === 'PT')?.amount || 0;
  const configuredDeductionTotal = configuredDeductionLines.reduce((sum, d) => sum + d.amount, 0);
  const statutoryDetails: StatutoryDeductionsResult = {
    epfDeduction,
    esiDeduction,
    professionalTax,
    totalStatutory: epfDeduction + esiDeduction + professionalTax,
    epfRule: configuredDeductionLines.find(d => d.statutoryKind === 'PF')?.description || '',
    esiRule: configuredDeductionLines.find(d => d.statutoryKind === 'ESIC')?.description || '',
    pfActive: configuredDeductionLines.some(d => d.statutoryKind === 'PF'),
    esicActive: configuredDeductionLines.some(d => d.statutoryKind === 'ESIC'),
    ptActive: configuredDeductionLines.some(d => d.statutoryKind === 'PT'),
    isEsicExempt: configuredDeductionLines.some(d => d.statutoryKind === 'ESIC' && d.amount === 0)
  };

  // 6. Advance Salary / Loan EMI deduction ("Others" deduction)
  let scheduledLoanDeduction = 0;
  if (Array.isArray(advanceSalaryRecords)) {
    advanceSalaryRecords.forEach(adv => {
      if (
        adv.employeeId === employee.employeeId && 
        (adv.status === 'Active' || adv.status === 'Disbursed') &&
        toNum(adv.outstandingBalance) > 0
      ) {
        const nextInst = adv.repaymentSchedule?.find((s: LoanRepaymentInstallment) => s.status === 'Pending');
        let emi = nextInst 
          ? toNum(nextInst.scheduledAmount || nextInst.actualDeducted) 
          : toNum(adv.monthlyDeduction);
        
        // Automatically handle final month: deduct only up to remaining outstanding balance
        const balance = toNum(adv.outstandingBalance);
        emi = Math.min(emi, balance);
        scheduledLoanDeduction += emi;
      }
    });
  }

  // Low Salary Protection: Cap loan deduction to available net salary
  const leaveDeductionAmount = 0;
  const preLoanDeductions = configuredDeductionTotal + lateDetails.deductionAmount + leaveDeductionAmount;
  const availableSalary = Math.max(0, grossSalary - preLoanDeductions);
  const advanceDeduction = Math.min(scheduledLoanDeduction, availableSalary);

  const totalDeductions = preLoanDeductions + advanceDeduction;
  const netSalary = Math.max(0, grossSalary - totalDeductions);
  const deductionsBreakdown: { name: string; category: 'DEDUCTION'; amount: number; description?: string }[] = configuredDeductionLines
    .filter(line => line.amount > 0)
    .map(line => ({
      name: line.name,
      category: 'DEDUCTION',
      amount: line.amount,
      description: line.description
    }));
  if (lateDetails.deductionAmount > 0) {
    deductionsBreakdown.push({ name: 'Late Attendance Deduction', category: 'DEDUCTION', amount: lateDetails.deductionAmount, description: lateDetails.ruleApplied });
  }
  if (leaveDeductionAmount > 0) {
    deductionsBreakdown.push({ name: 'Loss of Pay Deduction', category: 'DEDUCTION', amount: leaveDeductionAmount, description: leaveDetails.ruleApplied });
  }
  if (advanceDeduction > 0) {
    deductionsBreakdown.push({ name: 'Advance Salary / Loan Recovery', category: 'DEDUCTION', amount: advanceDeduction });
  }

  return {
    employeeId: employee.employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    designation: employee.designation,
    month,
    year,
    basicSalary: payableBasic,
    allowances: payableAllowances,
    da: payableDa,
    conveyance: payableConveyance,
    hra: payableHra,
    withPf,
    bonus,
    attendanceBonus,
    rewardEarnings: rewardDetails.totalRewardEarnings,
    grossSalary,

    epfDeduction,
    esiDeduction,
    professionalTax,
    statutoryDeductions: configuredDeductionTotal,
    advanceDeduction,
    lateAttendanceDeduction: lateDetails.deductionAmount,
    unpaidLeaveDeduction: leaveDeductionAmount,
    sandwichUnpaidDays: leaveDetails.sandwichUnpaidDays || 0,
    sandwichDeduction: leaveDetails.sandwichDeduction || 0,
    totalDeductions,

    netSalary,

    workingDays: standardDays,
    presentDays,
    paidDays,
    paidLeaves: approvedPaidLeaveDays,
    unpaidLeaves: leaveDetails.totalUnpaidDays,

    lateDetails,
    leaveDetails,
    statutoryDetails,
    rewardDetails,
    earningsBreakdown,
    deductionsBreakdown
  };
};

// ========================================================
// 7. PAYSLIP PRIVACY & DEDUCTIONS FORMATTER
// ========================================================
export interface PayslipDeductionLineItem {
  label: string;
  amount: number;
  category: 'STATUTORY' | 'LOAN' | 'INTERNAL_PENALTY' | 'GENERIC_OTHER';
  isConfidential: boolean;
  internalReason?: string;
}

/**
 * Formats deductions for payslips strictly respecting the role & confidentiality settings.
 * - For Employee role: confidential policies are collapsed into generic 'OTHERS' (or custom generic label).
 * - For HR / CEO role: complete internal deduction reasons and policy names are clearly presented.
 */
export const formatPayslipDeductionsForViewer = (
  calc: FullPayrollCalculationResult,
  viewerRole: 'CEO' | 'HR' | 'HR Admin' | 'Super Admin' | 'Employee' | string,
  loanPolicy?: { payslipVisibility?: 'DETAILED' | 'GENERIC' }
): PayslipDeductionLineItem[] => {
  const isPrivileged = viewerRole === 'CEO' || viewerRole === 'HR' || viewerRole === 'HR Admin' || viewerRole === 'Super Admin';
  const items: PayslipDeductionLineItem[] = [];

  // Statutory lines (always visible)
  if (calc.epfDeduction > 0) {
    items.push({
      label: 'EPF Employee Contribution (12%)',
      amount: calc.epfDeduction,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.esiDeduction > 0) {
    items.push({
      label: 'ESI Contribution',
      amount: calc.esiDeduction,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.professionalTax > 0) {
    items.push({
      label: 'Professional Tax (PT)',
      amount: calc.professionalTax,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.advanceDeduction > 0) {
    const isGeneric = loanPolicy?.payslipVisibility === 'GENERIC' && !isPrivileged;
    items.push({
      label: isGeneric ? 'OTHERS' : 'Employee Loan Recovery',
      amount: calc.advanceDeduction,
      category: 'LOAN',
      isConfidential: isGeneric
    });
  }

  // Internal attendance & leave deductions
  let genericOtherTotal = 0;

  // 1. Late Attendance Deduction
  if (calc.lateAttendanceDeduction > 0) {
    if (isPrivileged) {
      items.push({
        label: `Late Attendance Deduction (${calc.lateDetails.lateCount} Late Entries)`,
        amount: calc.lateAttendanceDeduction,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: calc.lateDetails.ruleApplied
      });
    } else {
      if (calc.lateDetails.isConfidential) {
        genericOtherTotal += calc.lateAttendanceDeduction;
      } else {
        items.push({
          label: 'Attendance Deduction',
          amount: calc.lateAttendanceDeduction,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // 2. Unpaid Leave & Sandwich Leave Deductions
  const sandwichDeduct = toNum(calc.sandwichDeduction || calc.leaveDetails?.sandwichDeduction || 0);
  const remainingUnpaidDeduct = Math.max(0, calc.unpaidLeaveDeduction - sandwichDeduct);

  // Sandwich Leave Deduction item
  if (sandwichDeduct > 0) {
    if (isPrivileged) {
      items.push({
        label: `Sandwich Leave Deduction`,
        amount: sandwichDeduct,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: 'Sandwich Leave'
      });
    } else {
      if (calc.leaveDetails.isConfidential) {
        genericOtherTotal += sandwichDeduct;
      } else {
        items.push({
          label: 'Sandwich Leave Deduction',
          amount: sandwichDeduct,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // Other Unpaid Leave Days (if any beyond sandwich)
  if (remainingUnpaidDeduct > 0) {
    if (isPrivileged) {
      items.push({
        label: `Unpaid Leave Penalty (${calc.leaveDetails.excessUnpaidDays} Days Beyond Quota)`,
        amount: remainingUnpaidDeduct,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: calc.leaveDetails.ruleApplied
      });
    } else {
      if (calc.leaveDetails.isConfidential) {
        genericOtherTotal += remainingUnpaidDeduct;
      } else {
        items.push({
          label: 'Leave Deduction',
          amount: remainingUnpaidDeduct,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // If there are confidential deductions collapsed for employees, add the generic line
  if (!isPrivileged && genericOtherTotal > 0) {
    const label = calc.lateDetails.genericCategoryLabel || calc.leaveDetails.genericCategoryLabel || 'OTHERS';
    items.push({
      label,
      amount: genericOtherTotal,
      category: 'GENERIC_OTHER',
      isConfidential: false
    });
  }

  return items;
};
