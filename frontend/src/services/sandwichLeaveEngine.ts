// VRM Enterprise HRM - Central Sandwich Leave Calculation Engine
import { 
  Employee, 
  HolidayItem, 
  LeaveRequest,
  SandwichLeavePolicy, 
  SandwichCalculationResult, 
  SandwichCalculationDayDetail,
  SandwichCondition,
  SandwichPayType,
  WeeklyScheduleItem
} from '../types/hrms';
import { toNum } from '../utils/numbers';
import { isDateWeeklyOffBySchedule } from '../utils/weeklyScheduleUtils';

/**
 * Standard Day of Week names
 */
export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Normalizes any string representation of weekly off into an array of day names
 * e.g. "Sunday" -> ["Sunday"]
 *      "Saturday, Sunday" -> ["Saturday", "Sunday"]
 *      "Mon, Tue" -> ["Monday", "Tuesday"]
 */
export const parseWeeklyOffDays = (weeklyOffInput?: string | string[]): string[] => {
  if (!weeklyOffInput) return ['Sunday'];
  if (Array.isArray(weeklyOffInput)) return weeklyOffInput;

  const raw = weeklyOffInput.toLowerCase();
  const result: string[] = [];

  DAYS_OF_WEEK.forEach(day => {
    const short = day.substring(0, 3).toLowerCase();
    if (raw.includes(day.toLowerCase()) || raw.includes(short)) {
      result.push(day);
    }
  });

  return result.length > 0 ? result : ['Sunday'];
};

/**
 * Determines whether a given calendar date ('YYYY-MM-DD') is a Weekly Off
 * for the employee, adhering dynamically to company Week Off Calendar rules.
 * 
 * Hierarchy:
 * 1. Employee-specific shift details (employee.shiftDetails.weeklyOff)
 * 2. Explicitly passed weeklyOffSchedule parameter
 * 3. Company-wide Week Off Calendar roster (weeklySchedules)
 * 4. Fallback default: Sunday
 */
export const isDayWeeklyOff = (
  dateStr: string,
  employee?: Employee,
  weeklyOffSchedule?: string | string[],
  weeklySchedules?: WeeklyScheduleItem[]
): { isWeeklyOff: boolean; dayName: string } => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAYS_OF_WEEK[utcDate.getUTCDay()];
  const localDate = new Date(y, m - 1, d);

  // 1. Employee-specific shift weekly off days (if defined)
  if (employee?.shiftDetails?.weeklyOff) {
    const shiftOff = parseWeeklyOffDays(employee.shiftDetails.weeklyOff);
    if (shiftOff.length > 0) {
      return { isWeeklyOff: shiftOff.includes(dayName), dayName };
    }
  }

  // 2. Explicit weeklyOffSchedule parameter (if passed)
  if (weeklyOffSchedule) {
    const explicitOff = parseWeeklyOffDays(weeklyOffSchedule);
    if (explicitOff.length > 0) {
      return { isWeeklyOff: explicitOff.includes(dayName), dayName };
    }
  }

  // 3. Company Week Off Calendar schedules (Settings -> Attendance & Time -> Week Off Calendar)
  if (Array.isArray(weeklySchedules) && weeklySchedules.length > 0) {
    const isScheduleOff = isDateWeeklyOffBySchedule(localDate, weeklySchedules);
    return { isWeeklyOff: isScheduleOff, dayName };
  }

  // 4. Default company baseline fallback: Sunday
  return { isWeeklyOff: dayName === 'Sunday', dayName };
};

/**
 * Resolves the applicable Sandwich Leave Policy for an employee based on hierarchy:
 * Priority: Employee-specific > Designation > Department > Branch > Company Default
 * A policy must satisfy all of its defined non-'ALL' constraints to be eligible.
 */
export const resolveSandwichPolicy = (
  employee: Employee,
  policies: SandwichLeavePolicy[],
  targetDate: string
): SandwichLeavePolicy | null => {
  const activePolicies = policies.filter(p => {
    if (p.status !== 'Active') return false;
    if (p.effectiveFrom && targetDate < p.effectiveFrom) return false;
    if (p.effectiveTo && targetDate > p.effectiveTo) return false;
    return true;
  });

  if (activePolicies.length === 0) return null;

  // Filter policies that match all non-ALL criteria of the employee
  const eligiblePolicies = activePolicies.filter(p => {
    if (!employee) return true;

    // 1. Employee filter
    if (p.applicableEmployees && p.applicableEmployees !== 'ALL') {
      const empArr = Array.isArray(p.applicableEmployees) ? p.applicableEmployees : [p.applicableEmployees];
      if (empArr.length > 0 && !empArr.includes(employee.employeeId) && !empArr.includes(employee.id)) {
        return false;
      }
    }

    // 2. Designation filter
    if (p.applicableDesignations && p.applicableDesignations !== 'ALL') {
      const desigArr = Array.isArray(p.applicableDesignations) ? p.applicableDesignations : [p.applicableDesignations];
      if (desigArr.length > 0 && !desigArr.includes(employee.designation)) {
        return false;
      }
    }

    // 3. Department filter
    if (p.applicableDepartments && p.applicableDepartments !== 'ALL') {
      const deptArr = Array.isArray(p.applicableDepartments) ? p.applicableDepartments : [p.applicableDepartments];
      if (deptArr.length > 0 && !deptArr.includes(employee.department)) {
        return false;
      }
    }

    // 4. Branch filter
    if (p.applicableBranches && p.applicableBranches !== 'ALL') {
      const branchArr = Array.isArray(p.applicableBranches) ? p.applicableBranches : [p.applicableBranches];
      if (branchArr.length > 0) {
        const empBranch = (employee.workLocation || '').toLowerCase().trim();
        const matches = branchArr.some(b => {
          const bl = b.toLowerCase().trim();
          return empBranch === bl || empBranch.includes(bl) || bl.includes(empBranch);
        });
        if (!matches) return false;
      }
    }

    return true;
  });

  if (eligiblePolicies.length === 0) return null;

  // Calculate specificity score for hierarchy resolution:
  // Employee (1000) > Designation (100) > Department (50) > Branch (20) > Default (0)
  const scored = eligiblePolicies.map(p => {
    let score = 0;
    if (p.applicableEmployees && p.applicableEmployees !== 'ALL' && (p.applicableEmployees as string[]).length > 0) score += 1000;
    if (p.applicableDesignations && p.applicableDesignations !== 'ALL' && (p.applicableDesignations as string[]).length > 0) score += 100;
    if (p.applicableDepartments && p.applicableDepartments !== 'ALL' && (p.applicableDepartments as string[]).length > 0) score += 50;
    if (p.applicableBranches && p.applicableBranches !== 'ALL' && (p.applicableBranches as string[]).length > 0) score += 20;
    return { policy: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].policy;
};

/**
 * Checks if a date string 'YYYY-MM-DD' is a public holiday for this employee's branch/location
 */
export const isPublicHolidayForEmployee = (
  dateStr: string,
  employee: Employee,
  holidays: HolidayItem[]
): { isHoliday: boolean; holidayName?: string } => {
  const empLocation = (employee.workLocation || '').toLowerCase();

  const match = holidays.find(h => {
    if (h.date !== dateStr) return false;

    const loc = (h.applicableLocation || 'All Sites').toLowerCase();
    if (loc === 'all sites' || loc === 'all locations' || loc === 'company wide' || !h.applicableLocation) {
      return true;
    }
    if (empLocation && loc.includes(empLocation)) {
      return true;
    }
    return false;
  });

  return {
    isHoliday: !!match,
    holidayName: match?.name
  };
};

/**
 * Helper to add days to a date string 'YYYY-MM-DD'
 */
export const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
};

/**
 * Checks whether an applied leave type is considered paid or unpaid
 */
export const isLeaveTypePaid = (leaveType?: string): boolean => {
  if (!leaveType) return true;
  const lt = leaveType.toLowerCase();
  if (
    lt.includes('unpaid') || 
    lt.includes('lop') || 
    lt.includes('loss of pay') || 
    lt.includes('lwp') ||
    lt.includes('without pay')
  ) {
    return false;
  }
  return true;
};

/**
 * Generates an array of date strings between startDate and endDate inclusive
 */
export const getDateRangeArray = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let current = startDate;
  let guard = 0;

  while (current <= endDate && guard < 366) {
    dates.push(current);
    current = addDays(current, 1);
    guard++;
  }

  return dates;
};

/**
 * Primary 16-Step Sandwich Calculation Engine
 * 
 * Computes exact leave breakdown including sandwich evaluation, weekly offs,
 * public holidays, paid vs unpaid days, and payroll deduction estimates.
 */
export const calculateSandwichLeave = (params: {
  employee: Employee;
  leaveType: string;
  startDate: string;
  endDate: string;
  policies: SandwichLeavePolicy[];
  holidays: HolidayItem[];
  existingLeaves?: LeaveRequest[];
  weeklyOffSchedule?: string | string[];
  weeklySchedules?: WeeklyScheduleItem[];
}): SandwichCalculationResult => {
  const {
    employee,
    leaveType,
    startDate,
    endDate,
    policies,
    holidays,
    existingLeaves = [],
    weeklyOffSchedule,
    weeklySchedules
  } = params;

  // Step 1: Resolve Active Policy using hierarchy
  const policy = resolveSandwichPolicy(employee, policies, startDate);

  const datesInRange = getDateRangeArray(startDate, endDate);
  const isAppliedTypePaid = isLeaveTypePaid(leaveType);

  // Base fallback if policy disabled or doesn't apply
  const isPolicyActive = policy && policy.sandwichRuleEnabled && policy.status === 'Active';
  
  // Check if requested leave type is subject to sandwich rule
  const isLeaveTypeApplicable = Boolean(
    isPolicyActive && (
      !policy.applicableLeaveTypes || 
      policy.applicableLeaveTypes.length === 0 || 
      (policy.applicableLeaveTypes as any) === 'ALL' ||
      policy.applicableLeaveTypes.some(t => {
        const tNorm = t.toLowerCase().trim();
        const ltNorm = leaveType.toLowerCase().trim();
        return ltNorm.includes(tNorm) || tNorm.includes(ltNorm);
      })
    )
  );

  // If sandwich rule is disabled or leave type excluded:
  // Weekly offs and holidays are NOT counted as leave!
  if (!isPolicyActive || !isLeaveTypeApplicable) {
    let appliedCount = 0;
    let weeklyOffCount = 0;
    let holidayCount = 0;

    const breakdown: SandwichCalculationDayDetail[] = datesInRange.map(dateStr => {
      const { isWeeklyOff, dayName } = isDayWeeklyOff(dateStr, employee, weeklyOffSchedule, weeklySchedules);
      const holidayCheck = isPublicHolidayForEmployee(dateStr, employee, holidays);

      if (holidayCheck.isHoliday) {
        holidayCount++;
        return {
          date: dateStr,
          dayOfWeek: dayName,
          dayType: 'PUBLIC_HOLIDAY',
          isSandwich: false,
          isPaid: true,
          reason: `Public Holiday (${holidayCheck.holidayName || 'Holiday'})`,
          holidayName: holidayCheck.holidayName
        };
      }

      if (isWeeklyOff) {
        weeklyOffCount++;
        return {
          date: dateStr,
          dayOfWeek: dayName,
          dayType: 'WEEKLY_OFF',
          isSandwich: false,
          isPaid: true,
          reason: `Weekly Off (${dayName})`
        };
      }

      appliedCount++;
      return {
        date: dateStr,
        dayOfWeek: dayName,
        dayType: 'APPLIED_LEAVE',
        isSandwich: false,
        isPaid: isAppliedTypePaid,
        reason: `${leaveType} applied`
      };
    });

    const totalDays = Math.max(1, appliedCount);
    return {
      appliedLeaveDays: appliedCount,
      weeklyOffDays: weeklyOffCount,
      publicHolidayDays: holidayCount,
      sandwichDays: 0,
      totalDays,
      paidDays: isAppliedTypePaid ? totalDays : 0,
      unpaidDays: isAppliedTypePaid ? 0 : totalDays,
      isSandwichApplied: false,
      appliedPolicyId: policy?.id,
      appliedPolicyName: policy?.policyName,
      policyVersion: policy?.version,
      breakdown,
      noticeMessage: !isPolicyActive 
        ? 'Sandwich rule is currently disabled. Weekly offs and holidays are excluded.'
        : `Leave type "${leaveType}" is excluded from the sandwich rule.`
    };
  }

  // Active Sandwich Policy Evaluation:
  // Inspect external leaves around startDate and endDate to support multi-leave spans
  const approvedExistingDates = new Set<string>();
  existingLeaves
    .filter(l => (
      employee && (l.employeeId === employee.employeeId || l.employeeId === employee.id) && l.status !== 'Rejected'
    ))
    .forEach(l => {
      const existingDates = getDateRangeArray(l.startDate, l.endDate);
      existingDates.forEach(d => approvedExistingDates.add(d));
    });

  // Function to check if a specific date outside or inside is a leave day
  const isLeaveOnDate = (dateStr: string): boolean => {
    if (datesInRange.includes(dateStr)) {
      // In the range, is it a normal working day?
      const { isWeeklyOff } = isDayWeeklyOff(dateStr, employee, weeklyOffSchedule, weeklySchedules);
      const isHoliday = isPublicHolidayForEmployee(dateStr, employee, holidays).isHoliday;
      return !isWeeklyOff && !isHoliday;
    }
    return approvedExistingDates.has(dateStr);
  };

  // Helper: check if there is leave immediately before or after a block of non-working days
  const hasLeaveBefore = (earliestDate: string): boolean => {
    let checkDate = addDays(earliestDate, -1);
    // Walk back across consecutive holidays/offs to see if preceded by leave
    let safety = 0;
    while (safety < 14) {
      if (isLeaveOnDate(checkDate)) return true;
      const { isWeeklyOff } = isDayWeeklyOff(checkDate, employee, weeklyOffSchedule, weeklySchedules);
      const isHol = isPublicHolidayForEmployee(checkDate, employee, holidays).isHoliday;
      if (!isWeeklyOff && !isHol) {
        // It's a working day and not on leave -> no leave before
        return false;
      }
      checkDate = addDays(checkDate, -1);
      safety++;
    }
    return false;
  };

  const hasLeaveAfter = (latestDate: string): boolean => {
    let checkDate = addDays(latestDate, 1);
    // Walk forward across consecutive holidays/offs to see if succeeded by leave
    let safety = 0;
    while (safety < 14) {
      if (isLeaveOnDate(checkDate)) return true;
      const { isWeeklyOff } = isDayWeeklyOff(checkDate, employee, weeklyOffSchedule, weeklySchedules);
      const isHol = isPublicHolidayForEmployee(checkDate, employee, holidays).isHoliday;
      if (!isWeeklyOff && !isHol) {
        // It's a working day and not on leave -> no leave after
        return false;
      }
      checkDate = addDays(checkDate, 1);
      safety++;
    }
    return false;
  };

  // Classify each day in the requested range
  let appliedCount = 0;
  let weeklyOffCount = 0;
  let holidayCount = 0;
  let sandwichCount = 0;

  const breakdown: SandwichCalculationDayDetail[] = datesInRange.map(dateStr => {
    const { isWeeklyOff, dayName } = isDayWeeklyOff(dateStr, employee, weeklyOffSchedule, weeklySchedules);
    const holidayCheck = isPublicHolidayForEmployee(dateStr, employee, holidays);

    if (!isWeeklyOff && !holidayCheck.isHoliday) {
      appliedCount++;
      return {
        date: dateStr,
        dayOfWeek: dayName,
        dayType: 'APPLIED_LEAVE',
        isSandwich: false,
        isPaid: isAppliedTypePaid,
        reason: `${leaveType} applied`
      };
    }

    if (holidayCheck.isHoliday) {
      holidayCount++;
    } else if (isWeeklyOff) {
      weeklyOffCount++;
    }

    // Evaluate sandwich condition for this non-working day
    const leaveBefore = hasLeaveBefore(dateStr);
    const leaveAfter = hasLeaveAfter(dateStr);

    let conditionMet = false;
    switch (policy.sandwichCondition) {
      case 'BOTH_SIDES_MANDATORY':
      case 'LEAVE_BEFORE_AND_AFTER':
        conditionMet = leaveBefore && leaveAfter;
        break;
      case 'LEAVE_ONLY_BEFORE':
      case 'EITHER_SIDE' as any:
      case 'LEAVE_BEFORE_OR_AFTER' as any:
        conditionMet = leaveBefore || leaveAfter;
        break;
      case 'LEAVE_ONLY_AFTER':
        conditionMet = leaveAfter;
        break;
      default:
        conditionMet = leaveBefore && leaveAfter;
    }

    // Check if the specific rule is enabled for this type of non-working day
    let isSandwich = false;
    let reason = '';

    if (conditionMet) {
      if (isWeeklyOff && policy.countWeeklyOffAsLeave) {
        isSandwich = true;
        reason = `Weekly Off (${dayName}) converted to Leave (${policy.sandwichCondition.replace(/_/g, ' ')})`;
      } else if (holidayCheck.isHoliday && policy.countPublicHolidayAsLeave) {
        isSandwich = true;
        reason = `Public Holiday (${holidayCheck.holidayName || 'Holiday'}) converted to Leave`;
      }
    }

    if (!isSandwich) {
      reason = holidayCheck.isHoliday 
        ? `Public Holiday (${holidayCheck.holidayName || 'Holiday'}) - Sandwich condition not met`
        : `Weekly Off (${dayName}) - Sandwich condition not met`;
    }

    // Determine pay treatment for sandwich day
    let isDayPaid = true;
    if (isSandwich) {
      sandwichCount++;
      switch (policy.payType) {
        case 'SAME_AS_APPLIED_LEAVE':
          isDayPaid = isAppliedTypePaid;
          break;
        case 'PAID_LEAVE':
          isDayPaid = true;
          break;
        case 'UNPAID_LEAVE':
          isDayPaid = false;
          break;
        case 'CUSTOM_RULE':
          isDayPaid = isAppliedTypePaid;
          break;
        default:
          isDayPaid = isAppliedTypePaid;
      }
    }

    return {
      date: dateStr,
      dayOfWeek: dayName,
      dayType: isSandwich ? 'SANDWICH_LEAVE' : (holidayCheck.isHoliday ? 'PUBLIC_HOLIDAY' : 'WEEKLY_OFF'),
      isSandwich,
      isPaid: isDayPaid,
      reason,
      holidayName: holidayCheck.holidayName
    };
  });

  const totalDays = appliedCount + sandwichCount;

  // Compute paid vs unpaid totals
  let paidDays = 0;
  let unpaidDays = 0;

  breakdown.forEach(item => {
    if (item.dayType === 'APPLIED_LEAVE' || item.isSandwich) {
      if (item.isPaid) paidDays++;
      else unpaidDays++;
    }
  });

  // Calculate estimated payroll deduction for unpaid sandwich days
  const dailySalary = toNum(employee.basicSalary || 30000) / 26;
  const unpaidSandwichCount = breakdown.filter(b => b.isSandwich && !b.isPaid).length;
  const unpaidSandwichDeductionAmount = Math.round(unpaidSandwichCount * dailySalary);

  const isSandwichApplied = sandwichCount > 0;
  let noticeMessage = '';

  if (isSandwichApplied) {
    noticeMessage = `Sandwich leave policy "${policy.policyName}" has been applied. ${sandwichCount} day(s) (${policy.payType.replace(/_/g, ' ')}) included in total leave.`;
  } else {
    noticeMessage = `Standard leave calculation. No sandwich condition was triggered for this period.`;
  }

  return {
    appliedLeaveDays: appliedCount,
    weeklyOffDays: weeklyOffCount,
    publicHolidayDays: holidayCount,
    sandwichDays: sandwichCount,
    totalDays,
    paidDays,
    unpaidDays,
    isSandwichApplied,
    appliedPolicyId: policy.id,
    appliedPolicyName: policy.policyName,
    policyVersion: policy.version,
    payTypeApplied: policy.payType,
    breakdown,
    noticeMessage,
    unpaidSandwichDeductionAmount
  };
};
