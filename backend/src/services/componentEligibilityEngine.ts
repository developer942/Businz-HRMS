import { Decimal } from 'decimal.js';
import {
  SalaryComponentConfig,
  EmployeeSalaryEligibilityContext,
  ComponentEligibilityType,
  ComponentEligibilityBase,
  ComponentEligibilityOperator,
} from '../types/payroll.js';

// Configure Decimal precision for financial calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Validates the eligibility configuration of a salary component.
 * Rejects invalid ranges, missing conditions, negative values, and duplicate selections.
 */
export const validateComponentEligibility = (
  component: Partial<SalaryComponentConfig>
): { isValid: boolean; error?: string } => {
  const type: ComponentEligibilityType = component.eligibilityType || 'ALL';

  if (type === 'ALL') {
    return { isValid: true };
  }

  if (type === 'SELECTED_EMPLOYEES') {
    const list = component.eligibleEmployeeIds;
    if (!Array.isArray(list) || list.length === 0) {
      return {
        isValid: false,
        error: 'At least one employee must be selected when eligibility is set to Specific Employees.',
      };
    }

    // Check for duplicates
    const seen = new Set<string>();
    for (const id of list) {
      const clean = String(id).trim().toLowerCase();
      if (!clean) continue;
      if (seen.has(clean)) {
        return {
          isValid: false,
          error: `Duplicate employee ID (${id}) detected in assigned employee selection.`,
        };
      }
      seen.add(clean);
    }

    return { isValid: true };
  }

  if (type === 'SALARY_CONDITION') {
    const base: ComponentEligibilityBase = component.eligibilityBase || 'CTC';
    const operator: ComponentEligibilityOperator = component.eligibilityOperator || '>=';
    const limit = component.eligibilityLimit !== undefined && component.eligibilityLimit !== null
      ? Number(component.eligibilityLimit)
      : undefined;

    if (limit === undefined || isNaN(limit)) {
      return {
        isValid: false,
        error: `A valid numeric salary limit is required for condition based on ${base}.`,
      };
    }

    if (limit < 0) {
      return {
        isValid: false,
        error: 'Salary limit cannot be negative.',
      };
    }

    if (operator === 'BETWEEN') {
      const maxLimit = component.eligibilityLimitMax !== undefined && component.eligibilityLimitMax !== null
        ? Number(component.eligibilityLimitMax)
        : undefined;

      if (maxLimit === undefined || isNaN(maxLimit)) {
        return {
          isValid: false,
          error: 'An upper range limit is required when using the BETWEEN comparison operator.',
        };
      }

      if (maxLimit <= limit) {
        return {
          isValid: false,
          error: `Maximum limit (₹${maxLimit}) must be greater than minimum limit (₹${limit}) in BETWEEN condition.`,
        };
      }
    }

    return { isValid: true };
  }

  return { isValid: true };
};

/**
 * Determines whether statutory ESIC applies based on statutory wage ceilings,
 * coverage continuation across half-yearly contribution periods, and probation exemptions.
 *
 * ESI Act Rules:
 * - Wage limit: ₹21,000 per month (ESI Wages / Gross salary).
 * - Coverage continuation: An employee whose wages exceed ₹21,000 AFTER the start of a contribution
 *   period (April–Sept or Oct–March) continues to be covered until the end of that contribution period.
 * - Exempt schemes: Probationary / without-PF schemes are exempt.
 */
export const isEsicStatutoryEligible = (
  context: EmployeeSalaryEligibilityContext,
  threshold = 21000
): boolean => {
  // 1. Probation / exempt scheme check
  if (context.withPf === false) {
    return false;
  }

  // 2. Determine applicable wage (Gross or Basic+Allowances, NOT CTC alone)
  const grossWage = context.grossSalary !== undefined
    ? context.grossSalary
    : (context.monthlyCtc || 0);

  const wageDecimal = new Decimal(grossWage);
  const ceilingDecimal = new Decimal(threshold);

  // 3. If within threshold, employee is eligible
  if (wageDecimal.lessThanOrEqualTo(ceilingDecimal)) {
    return true;
  }

  // 4. Coverage continuation rule: If employee wage was within threshold at the beginning
  // of the current contribution period, coverage continues through the end of the period.
  if (context.isContributionPeriodContinuation === true) {
    return true;
  }

  return false;
};

/**
 * Authoritative single shared eligibility engine function.
 * Evaluates whether an employee is eligible for a given salary component.
 */
export const isComponentEligible = (
  component: SalaryComponentConfig,
  context: EmployeeSalaryEligibilityContext
): boolean => {
  // Inactive components are never eligible
  if (!component.active) {
    return false;
  }

  const codeUpper = (component.code || '').toUpperCase().trim();

  // Special statutory ESIC evaluation
  if (component.isStatutory && (codeUpper === 'ESIC' || codeUpper === 'ESI')) {
    const limit = component.eligibilityLimit && component.eligibilityLimit > 0
      ? component.eligibilityLimit
      : 21000;
    return isEsicStatutoryEligible(context, limit);
  }

  const type: ComponentEligibilityType = component.eligibilityType || 'ALL';

  // 1. All Employees
  if (type === 'ALL') {
    return true;
  }

  // 2. Specific Selected Employees
  if (type === 'SELECTED_EMPLOYEES') {
    const list = component.eligibleEmployeeIds;
    if (!Array.isArray(list) || list.length === 0) {
      return false;
    }

    const targetId = (context.id || '').trim().toLowerCase();
    const targetEmpId = (context.employeeId || '').trim().toLowerCase();

    return list.some(item => {
      const clean = String(item).trim().toLowerCase();
      return (targetId && clean === targetId) || (targetEmpId && clean === targetEmpId);
    });
  }

  // 3. Based on Salary Condition
  if (type === 'SALARY_CONDITION') {
    const base: ComponentEligibilityBase = component.eligibilityBase || 'CTC';
    const operator: ComponentEligibilityOperator = component.eligibilityOperator || '>=';
    const limit = new Decimal(component.eligibilityLimit ?? 0);

    // Resolve correct employee salary value
    let salaryNum = 0;
    if (base === 'CTC') {
      salaryNum = context.monthlyCtc !== undefined
        ? context.monthlyCtc
        : (context.grossSalary ?? context.basicSalary ?? 0);
    } else if (base === 'BASIC') {
      salaryNum = context.basicSalary !== undefined
        ? context.basicSalary
        : (context.monthlyCtc ? Math.round(context.monthlyCtc * 0.4) : 0);
    } else if (base === 'GROSS') {
      salaryNum = context.grossSalary !== undefined
        ? context.grossSalary
        : (context.monthlyCtc ?? 0);
    }

    const salary = new Decimal(salaryNum);

    switch (operator) {
      case '>':
        return salary.greaterThan(limit);
      case '>=':
        return salary.greaterThanOrEqualTo(limit);
      case '<':
        return salary.lessThan(limit);
      case '<=':
        return salary.lessThanOrEqualTo(limit);
      case '=':
        return salary.minus(limit).abs().lessThanOrEqualTo(0.01);
      case 'BETWEEN': {
        const maxLimit = new Decimal(component.eligibilityLimitMax ?? 0);
        return salary.greaterThanOrEqualTo(limit) && salary.lessThanOrEqualTo(maxLimit);
      }
      default:
        return true;
    }
  }

  return true;
};

/**
 * Filters a list of salary components returning only those the employee is eligible for.
 */
export const filterEligibleComponents = (
  components: SalaryComponentConfig[],
  context: EmployeeSalaryEligibilityContext
): SalaryComponentConfig[] => {
  return (components || []).filter(comp => isComponentEligible(comp, context));
};
