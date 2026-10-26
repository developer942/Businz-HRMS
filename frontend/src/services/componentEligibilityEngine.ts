import {
  SalaryComponentConfig,
  EmployeeSalaryEligibilityContext,
  ComponentEligibilityType,
  ComponentEligibilityBase,
  ComponentEligibilityOperator,
} from '../types/settings';

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
        error: 'Please select at least one employee for the Specific Employees eligibility rule.',
      };
    }

    // Check for duplicate employee selections
    const seen = new Set<string>();
    for (const id of list) {
      const clean = String(id).trim().toLowerCase();
      if (!clean) continue;
      if (seen.has(clean)) {
        return {
          isValid: false,
          error: `Duplicate employee ID (${id}) detected in selection list.`,
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
        error: `Please specify a valid numeric salary limit based on ${base}.`,
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
          error: `Maximum limit (₹${maxLimit.toLocaleString('en-IN')}) must be greater than minimum limit (₹${limit.toLocaleString('en-IN')}) in BETWEEN condition.`,
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

  // 3. If within threshold, employee is eligible
  if (grossWage <= threshold) {
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
    const limit = Number(component.eligibilityLimit ?? 0);

    // Resolve correct employee salary value
    let salary = 0;
    if (base === 'CTC') {
      salary = context.monthlyCtc !== undefined
        ? context.monthlyCtc
        : (context.grossSalary ?? context.basicSalary ?? 0);
    } else if (base === 'BASIC') {
      salary = context.basicSalary !== undefined
        ? context.basicSalary
        : (context.monthlyCtc ? Math.round(context.monthlyCtc * 0.4) : 0);
    } else if (base === 'GROSS') {
      salary = context.grossSalary !== undefined
        ? context.grossSalary
        : (context.monthlyCtc ?? 0);
    }

    switch (operator) {
      case '>':
        return salary > limit;
      case '>=':
        return salary >= limit;
      case '<':
        return salary < limit;
      case '<=':
        return salary <= limit;
      case '=':
        return Math.abs(salary - limit) < 0.01;
      case 'BETWEEN': {
        const maxLimit = Number(component.eligibilityLimitMax ?? 0);
        return salary >= limit && salary <= maxLimit;
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

/**
 * Formats a user-readable summary description for a component's eligibility rule.
 */
export const getEligibilityBadgeLabel = (component: SalaryComponentConfig): string => {
  const type: ComponentEligibilityType = component.eligibilityType || 'ALL';

  if (type === 'ALL') {
    return 'All Employees';
  }

  if (type === 'SELECTED_EMPLOYEES') {
    const count = (component.eligibleEmployeeIds || []).length;
    return count === 1 ? '1 Selected Employee' : `${count} Selected Employees`;
  }

  if (type === 'SALARY_CONDITION') {
    const base = component.eligibilityBase || 'CTC';
    const op = component.eligibilityOperator || '>=';
    const limit = Number(component.eligibilityLimit || 0);

    if (op === 'BETWEEN') {
      const maxLimit = Number(component.eligibilityLimitMax || 0);
      return `${base} ₹${limit.toLocaleString('en-IN')} - ₹${maxLimit.toLocaleString('en-IN')}`;
    }

    return `${base} ${op} ₹${limit.toLocaleString('en-IN')}`;
  }

  return 'All Employees';
};
