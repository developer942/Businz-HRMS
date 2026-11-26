import { Decimal } from 'decimal.js';
import {
  PayrollCalculationInput,
  FullPayrollCalculationResult,
  ComputedSalaryStructure,
  SalaryStructureInput,
  CalculationBreakdownItem,
  EmployeeSalaryEligibilityContext,
  OtWageBaseMode,
  OtSalaryDivisorMode,
  OtCalculationMultiplier,
  PayslipOvertimeVisibilityConfig,
  CalendarDayPayrollBreakdown,
} from '../types/payroll.js';
import { isComponentEligible } from './componentEligibilityEngine.js';
import { formatHoursAndMinutes } from './shiftAttendanceEngine.js';

// Configure Decimal precision for financial calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const DEFAULT_OT_ELIGIBLE_DEPARTMENTS = new Set([
  'floor',
  'dispatch loading',
]);

/**
 * Authoritative helper to identify the Company Owner / CEO.
 * CEO is exempt from attendance tracking, punch-in/out, face attendance,
 * overtime calculations, and attendance-based salary adjustments.
 */
export function isCeoOrOwnerEmployee(empOrUser?: {
  employeeId?: string | null;
  employee_id?: string | null;
  id?: string | null;
  role?: string | null;
  department?: string | null;
  departmentName?: string | null;
  department_name?: string | null;
  designation?: string | null;
} | null): boolean {
  if (!empOrUser) return false;
  const empId = String(empOrUser.employeeId || empOrUser.employee_id || empOrUser.id || '').trim().toUpperCase();
  const role = String(empOrUser.role || '').trim().toUpperCase();
  const dept = String(
    empOrUser.department || empOrUser.departmentName || empOrUser.department_name || ''
  ).trim().toUpperCase();
  const desig = String(empOrUser.designation || '').trim().toUpperCase();

  return (
    role === 'CEO' ||
    dept === 'CEO' ||
    desig === 'CEO' ||
    desig.includes('CHIEF EXECUTIVE') ||
    desig.includes('OWNER') ||
    desig.includes('MANAGING DIRECTOR') ||
    empId === 'VRM-001' ||
    empId === 'EMP-000'
  );
}

export function isDefaultOtEligibleDepartment(departmentName?: string): boolean {
  if (!departmentName) return false;
  return DEFAULT_OT_ELIGIBLE_DEPARTMENTS.has(departmentName.trim().toLowerCase());
}

/**
 * Automatically determines whether the selected payroll month contains 28, 29, 30 or 31 days.
 */
export function getCalendarDaysInMonth(month: number, year: number): number {
  const m = Math.max(1, Math.min(12, Math.floor(Number(month) || 1)));
  const y = Number(year) || new Date().getFullYear();
  return new Date(y, m, 0).getDate();
}

export function countWeeklyOffDaysInMonth(month: number, year: number, weeklyOffDayIndex = 0): number {
  const calendarDays = getCalendarDaysInMonth(month, year);
  let count = 0;
  for (let d = 1; d <= calendarDays; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (dayOfWeek === weeklyOffDayIndex) count++;
  }
  return count;
}

const DAYS_OF_WEEK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_NAME_ALIASES: Record<string, string> = {
  sun: 'Sunday',
  sunday: 'Sunday',
  mon: 'Monday',
  monday: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
};

const ORDINAL_MAP: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  last: -1,
};

/**
 * Normalizes any date string ('YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', ISO timestamp) into 'YYYY-MM-DD'.
 */
export function normalizeDateToISO(dateInput?: string | Date | null): string | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const clean = String(dateInput).trim();
  if (!clean || clean === '—' || clean === '-' || clean === 'N/A') return null;

  // YYYY-MM-DD or ISO datetime
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(Number(isoMatch[2])).padStart(2, '0');
    const d = String(Number(isoMatch[3])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const d = String(Number(dmyMatch[1])).padStart(2, '0');
    const m = String(Number(dmyMatch[2])).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

function parseFixedWeeklyOffNames(offDaysInput?: string | string[] | null, includeOrdinal = true): string[] {
  if (!offDaysInput) return [];
  if (Array.isArray(offDaysInput)) {
    return offDaysInput
      .map(v => DAY_NAME_ALIASES[String(v || '').trim().toLowerCase()] || String(v || '').trim())
      .filter(Boolean);
  }
  const source = String(offDaysInput)
    .replace(/\bonly\b/gi, ' ')
    .replace(/\boff\b/gi, ' ')
    .replace(/\bweekly\b/gi, ' ');
  const parts = source
    .split(/[,;+&]|\band\b|\+/i)
    .map(p => p.trim())
    .filter(Boolean);

  const matched: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const hasOrdinal = /\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last|alternate)\b/.test(lower);
    if (hasOrdinal && !includeOrdinal) continue;

    if (DAY_NAME_ALIASES[lower]) {
      matched.push(DAY_NAME_ALIASES[lower]);
      continue;
    }
    const fullDay = DAYS_OF_WEEK_NAMES.find(day => new RegExp(`\\b${day.toLowerCase()}\\b`).test(lower));
    if (fullDay) {
      matched.push(fullDay);
      continue;
    }
    const shortAlias = Object.keys(DAY_NAME_ALIASES).find(alias => new RegExp(`\\b${alias}\\b`).test(lower));
    if (shortAlias) {
      matched.push(DAY_NAME_ALIASES[shortAlias]);
    }
  }
  return Array.from(new Set(matched));
}

function checkDateWeeklyOffByRuleString(date: Date, offRule?: string | string[] | null): boolean {
  const dayName = DAYS_OF_WEEK_NAMES[date.getDay()];
  if (Array.isArray(offRule)) {
    const normList = parseFixedWeeklyOffNames(offRule, true);
    return normList.includes(dayName);
  }
  const ruleStr = String(offRule || '').trim();
  if (!ruleStr) return false;

  const fixedDays = parseFixedWeeklyOffNames(ruleStr, false);
  if (fixedDays.includes(dayName)) return true;

  const lower = ruleStr.toLowerCase();
  const mentionsDay = new RegExp(`\\b${dayName.toLowerCase()}\\b|\\b${dayName.slice(0, 3).toLowerCase()}\\b`).test(lower);
  if (!mentionsDay) return false;

  const occurrence = Math.floor((date.getDate() - 1) / 7) + 1;
  const nextWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  const isLast = nextWeek.getMonth() !== date.getMonth();

  const ordinalNums = [...lower.matchAll(/\b([1-5])(?:st|nd|rd|th)\b/g)].map(m => Number(m[1]));
  const wordNums = Object.entries(ORDINAL_MAP)
    .filter(([w]) => new RegExp(`\\b${w}\\b`).test(lower))
    .map(([, v]) => v);
  const ordinals = [...ordinalNums, ...wordNums];
  if (/\balternate\b/.test(lower)) {
    ordinals.push(2, 4);
  }

  return ordinals.some(v => v === occurrence || (v === -1 && isLast));
}

/**
 * Determines whether a given calendar date is an employee-specific weekly off.
 * Hierarchy:
 * 1. Employee-specific weeklyOff rule (string or string[])
 * 2. Company Week-Off Calendar schedule (weeklySchedules)
 * 3. Default fallback: Sunday
 */
export function isDateEmployeeWeeklyOff(
  date: Date,
  weeklyOffRule?: string | string[] | null,
  weeklySchedules?: any[]
): { isWeeklyOff: boolean; dayName: string } {
  const dayName = DAYS_OF_WEEK_NAMES[date.getDay()];

  if (weeklyOffRule && (Array.isArray(weeklyOffRule) ? weeklyOffRule.length > 0 : String(weeklyOffRule).trim().length > 0)) {
    return {
      isWeeklyOff: checkDateWeeklyOffByRuleString(date, weeklyOffRule),
      dayName,
    };
  }

  if (Array.isArray(weeklySchedules) && weeklySchedules.length > 0) {
    const activeSchedule = weeklySchedules.find(s => s?.isDefault) || weeklySchedules[0];
    if (activeSchedule?.offDays) {
      return {
        isWeeklyOff: checkDateWeeklyOffByRuleString(date, activeSchedule.offDays),
        dayName,
      };
    }
  }

  return { isWeeklyOff: dayName === 'Sunday', dayName };
}

/**
 * Checks if a date string ('YYYY-MM-DD') is a company-declared paid holiday for the employee.
 */
export function isDateCompanyPaidHoliday(
  dateStr: string,
  holidays?: any[],
  employeeLocation?: string
): { isHoliday: boolean; holidayName?: string } {
  if (!Array.isArray(holidays) || holidays.length === 0) {
    return { isHoliday: false };
  }
  const empLoc = String(employeeLocation || '').trim().toLowerCase();

  const match = holidays.find(h => {
    if (!h) return false;
    const hDate = normalizeDateToISO(h.date || h.holidayDate || h.holiday_date);
    if (hDate !== dateStr) return false;
    if (h.isPaid === false || String(h.type || '').toLowerCase() === 'unpaid') return false;

    const loc = String(h.applicableLocation || h.location || 'All Sites').trim().toLowerCase();
    if (!loc || loc === 'all sites' || loc === 'all locations' || loc === 'company wide' || loc === 'all') {
      return true;
    }
    if (empLoc && (loc.includes(empLoc) || empLoc.includes(loc))) {
      return true;
    }
    return false;
  });

  return {
    isHoliday: Boolean(match),
    holidayName: match ? String(match.name || match.holidayName || 'Holiday') : undefined,
  };
}

function isLeaveTypeUnpaidCheck(leaveType?: string | null): boolean {
  if (!leaveType) return false;
  const lt = String(leaveType).toLowerCase();
  return (
    lt.includes('unpaid') ||
    lt.includes('lop') ||
    lt.includes('loss of pay') ||
    lt.includes('lwp') ||
    lt.includes('without pay')
  );
}

function isLeaveTypeWfhOrOnDuty(leaveType?: string | null): boolean {
  if (!leaveType) return false;
  const lt = String(leaveType).toLowerCase();
  return lt.includes('work from home') || lt === 'wfh' || lt.includes('on duty') || lt.includes('official duty');
}

export interface CalendarDayPayrollParams {
  month: number;
  year: number;
  employeeId?: string;
  employeeUuid?: string;
  joiningDate?: string | null;
  exitDate?: string | null;
  weeklyOff?: string | string[] | null;
  weeklySchedules?: any[];
  holidays?: any[];
  employeeLocation?: string;
  attendanceRecords?: any[];
  leaveRequests?: any[];
  sandwichPolicies?: any[];
  weekOffEligibilityPolicy?: {
    requireAdjacentPresenceForWeekOff?: boolean;
    requireAdjacentPresenceForHoliday?: boolean;
  };
  autoConvertPendingToLop?: boolean;
  lopEnabled?: boolean;
  isCeo?: boolean;
  evaluationCutoffDate?: string;
  explicitLopDays?: number;
  explicitPaidLeaveDays?: number;
  explicitUnpaidLeaveDays?: number;
  explicitAbsentDays?: number;
  explicitHalfDays?: number;
  explicitPresentDays?: number;
}

/**
 * Authoritative Calendar Day Based Payroll Attendance & Payable Days Engine.
 * Requirements 1-9:
 * - Automatically identifies total calendar days (28/29/30/31), employee scheduled working days,
 *   employee-specific weekly offs, company-declared paid holidays, present days, approved paid leave,
 *   unpaid leave / LOP, and final payable days.
 * - Weekly offs and paid holidays count as paid days for eligible employees even without attendance punches.
 * - Never double-counts a holiday falling on a weekly off.
 * - Applies joining date, exit date, unpaid absence, sandwich & leave policies accurately.
 * - Does not automatically convert pending attendance or missing punches to LOP without policy authorization.
 */
export function calculateCalendarDayPayrollAttendance(params: CalendarDayPayrollParams): CalendarDayPayrollBreakdown {
  const monthNum = Math.max(1, Math.min(12, Math.floor(Number(params.month) || 1)));
  const yearNum = Number(params.year) || new Date().getFullYear();
  const calendarDays = getCalendarDaysInMonth(monthNum, yearNum) as 28 | 29 | 30 | 31;

  const monthPad = String(monthNum).padStart(2, '0');
  const monthStartStr = `${yearNum}-${monthPad}-01`;
  const monthEndStr = `${yearNum}-${monthPad}-${String(calendarDays).padStart(2, '0')}`;
  const lopEnabled = params.lopEnabled !== false;

  if (params.isCeo) {
    let ceoWeekOffs = 0;
    let ceoHolidays = 0;
    let ceoOverlapping = 0;
    for (let d = 1; d <= calendarDays; d++) {
      const dateStr = `${yearNum}-${monthPad}-${String(d).padStart(2, '0')}`;
      const localDate = new Date(yearNum, monthNum - 1, d);
      const isOff = isDateEmployeeWeeklyOff(localDate, params.weeklyOff, params.weeklySchedules).isWeeklyOff;
      const isHol = isDateCompanyPaidHoliday(dateStr, params.holidays, params.employeeLocation).isHoliday;
      if (isOff && isHol) ceoOverlapping++;
      if (isOff) ceoWeekOffs++;
      else if (isHol) ceoHolidays++;
    }
    const ceoWorkingDays = Math.max(0, calendarDays - ceoWeekOffs - ceoHolidays);
    return {
      calendarDays,
      eligibleDays: calendarDays,
      unemployedDays: 0,
      scheduledWorkingDays: ceoWorkingDays,
      workingDays: ceoWorkingDays,
      presentDays: ceoWorkingDays,
      actualPunchedDays: ceoWorkingDays,
      pendingAttendanceDays: 0,
      paidWeekOffDays: ceoWeekOffs,
      paidHolidayDays: ceoHolidays,
      overlappingHolidayDays: ceoOverlapping,
      paidLeaveDays: 0,
      lopDays: 0,
      sandwichLopDays: 0,
      paidDays: calendarDays,
      totalPaidDays: calendarDays,
      activeStartDate: monthStartStr,
      activeEndDate: monthEndStr,
      prorationFactor: 1,
      isFullMonthEligible: true,
    };
  }

  // Resolve active employment window from joiningDate and exitDate
  const joiningIso = normalizeDateToISO(params.joiningDate);
  const exitIso = normalizeDateToISO(params.exitDate);

  const activeStartDate = joiningIso && joiningIso > monthStartStr ? joiningIso : monthStartStr;
  const activeEndDate = exitIso && exitIso < monthEndStr ? exitIso : monthEndStr;

  const isCompletelyOutsideEmployment =
    (joiningIso !== null && joiningIso > monthEndStr) ||
    (exitIso !== null && exitIso < monthStartStr) ||
    activeStartDate > activeEndDate;

  if (isCompletelyOutsideEmployment) {
    return {
      calendarDays,
      eligibleDays: 0,
      unemployedDays: calendarDays,
      scheduledWorkingDays: 0,
      workingDays: 0,
      presentDays: 0,
      actualPunchedDays: 0,
      pendingAttendanceDays: 0,
      paidWeekOffDays: 0,
      paidHolidayDays: 0,
      overlappingHolidayDays: 0,
      paidLeaveDays: 0,
      lopDays: 0,
      sandwichLopDays: 0,
      paidDays: 0,
      totalPaidDays: 0,
      activeStartDate,
      activeEndDate,
      prorationFactor: 0,
      isFullMonthEligible: false,
    };
  }

  interface DayClassification {
    dayNum: number;
    dateStr: string;
    isEligible: boolean;
    isWeeklyOff: boolean;
    isRawHoliday: boolean;
    isEffectiveHoliday: boolean;
    isOverlappingHoliday: boolean;
    isScheduledWorkingDay: boolean;
    dayPresent: number;
    dayPaidLeave: number;
    dayLop: number;
    hasLeaveOrAbsence: boolean;
    isUnpaidLeaveOrAbsence: boolean;
    isExplicitSandwichUnpaid: boolean;
  }

  const dayList: DayClassification[] = [];
  let eligibleDays = 0;
  let overlappingHolidayDays = 0;

  for (let d = 1; d <= calendarDays; d++) {
    const dateStr = `${yearNum}-${monthPad}-${String(d).padStart(2, '0')}`;
    const localDate = new Date(yearNum, monthNum - 1, d);
    const isEligible = dateStr >= activeStartDate && dateStr <= activeEndDate;
    if (isEligible) eligibleDays++;

    const isWeeklyOff = isDateEmployeeWeeklyOff(localDate, params.weeklyOff, params.weeklySchedules).isWeeklyOff;
    const isRawHoliday = isDateCompanyPaidHoliday(dateStr, params.holidays, params.employeeLocation).isHoliday;
    const isOverlappingHoliday = isWeeklyOff && isRawHoliday;
    // Requirement 4: Never double-count a holiday falling on a weekly off
    const isEffectiveHoliday = isRawHoliday && !isWeeklyOff;
    const isScheduledWorkingDay = !isWeeklyOff && !isEffectiveHoliday;

    if (isEligible && isOverlappingHoliday) {
      overlappingHolidayDays++;
    }

    dayList.push({
      dayNum: d,
      dateStr,
      isEligible,
      isWeeklyOff,
      isRawHoliday,
      isEffectiveHoliday,
      isOverlappingHoliday,
      isScheduledWorkingDay,
      dayPresent: 0,
      dayPaidLeave: 0,
      dayLop: 0,
      hasLeaveOrAbsence: false,
      isUnpaidLeaveOrAbsence: false,
      isExplicitSandwichUnpaid: false,
    });
  }

  const empIdNorm = String(params.employeeId || '').trim().toLowerCase();
  const empUuidNorm = String(params.employeeUuid || '').trim().toLowerCase();
  const matchesTargetEmp = (rawId: any): boolean => {
    if (!empIdNorm && !empUuidNorm) return true;
    const idNorm = String(rawId || '').trim().toLowerCase();
    if (!idNorm) return !empIdNorm;
    return (Boolean(empIdNorm) && idNorm === empIdNorm) || (Boolean(empUuidNorm) && idNorm === empUuidNorm);
  };

  // Filter attendance records strictly to this employee and target month/year
  let maxMonthAttDateStr = '';
  const monthAttMap = new Map<string, any>();
  if (Array.isArray(params.attendanceRecords)) {
    for (const rec of params.attendanceRecords) {
      if (!rec) continue;
      const dIso = normalizeDateToISO(rec.date || rec.shiftDate || rec.shift_date);
      if (!dIso || dIso < monthStartStr || dIso > monthEndStr) continue;
      if (dIso > maxMonthAttDateStr) {
        maxMonthAttDateStr = dIso;
      }
      if (!matchesTargetEmp(rec.employeeId || rec.employee_id)) continue;
      const existing = monthAttMap.get(dIso);
      if (!existing) {
        monthAttMap.set(dIso, rec);
      } else {
        const isManual = String(rec.method || '').toLowerCase().includes('manual');
        const existingManual = String(existing.method || '').toLowerCase().includes('manual');
        const hasOut = Boolean(rec.checkOut ?? rec.check_out);
        const existingOut = Boolean(existing.checkOut ?? existing.check_out);
        if ((isManual && !existingManual) || (hasOut && !existingOut)) {
          monthAttMap.set(dIso, rec);
        }
      }
    }
  }

  // Filter approved leave requests covering dates in this month
  const approvedLeavesInMonth: any[] = [];
  const explicitSandwichUnpaidDates = new Set<string>();
  const leaveDatesInRequestRange = new Map<string, { isUnpaid: boolean; isHalfDay: boolean; isWfh: boolean }>();

  if (Array.isArray(params.leaveRequests)) {
    for (const lr of params.leaveRequests) {
      if (!lr) continue;
      const statusNorm = String(lr.status || '').trim().toLowerCase();
      if (statusNorm !== 'approved') continue;
      if (!matchesTargetEmp(lr.employeeId || lr.employee_id)) continue;
      const sIso = normalizeDateToISO(lr.startDate || lr.start_date);
      const eIso = normalizeDateToISO(lr.endDate || lr.end_date || sIso);
      if (!sIso || !eIso) continue;
      if (eIso < monthStartStr || sIso > monthEndStr) continue;

      approvedLeavesInMonth.push({ ...lr, sIso, eIso });

      // Check pre-computed sandwich breakdown if present
      if (Array.isArray(lr.sandwichDetails?.breakdown)) {
        for (const b of lr.sandwichDetails.breakdown) {
          const bIso = normalizeDateToISO(b?.date);
          if (bIso && b?.isSandwich && b?.isPaid === false) {
            explicitSandwichUnpaidDates.add(bIso);
          }
        }
      }

      const isUnpaid = isLeaveTypeUnpaidCheck(lr.leaveType || lr.leave_type);
      const isWfh = isLeaveTypeWfhOrOnDuty(lr.leaveType || lr.leave_type);
      const isHalfDay = Boolean(lr.isHalfDay) || (sIso === eIso && Number(lr.daysCount || lr.days_count) === 0.5);

      for (const dayObj of dayList) {
        if (dayObj.dateStr >= sIso && dayObj.dateStr <= eIso) {
          leaveDatesInRequestRange.set(dayObj.dateStr, { isUnpaid, isHalfDay, isWfh });
          if (explicitSandwichUnpaidDates.has(dayObj.dateStr)) {
            dayObj.isExplicitSandwichUnpaid = true;
          }
        }
      }
    }
  }

  const isPunchLogAttendanceMode =
    Boolean(empIdNorm || empUuidNorm) &&
    Array.isArray(params.attendanceRecords) &&
    params.attendanceRecords.length > 0;

  const todayIstIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const evaluationCutoffDate = (() => {
    const explicitCutoff = normalizeDateToISO(params.evaluationCutoffDate);
    if (explicitCutoff) return explicitCutoff;
    if (todayIstIso >= monthStartStr && todayIstIso <= monthEndStr) {
      return maxMonthAttDateStr && maxMonthAttDateStr > todayIstIso ? maxMonthAttDateStr : todayIstIso;
    }
    if (todayIstIso < monthStartStr) {
      return maxMonthAttDateStr || todayIstIso;
    }
    return monthEndStr;
  })();

  const hasDailyRecords = isPunchLogAttendanceMode || monthAttMap.size > 0 || approvedLeavesInMonth.length > 0;
  let actualPunchedDays = 0;
  let pendingAttendanceDays = 0;

  // Step 1: Evaluate all eligible Scheduled Working Days
  for (const dayObj of dayList) {
    if (!dayObj.isEligible || !dayObj.isScheduledWorkingDay) continue;

    const leaveInfo = leaveDatesInRequestRange.get(dayObj.dateStr);
    const att = monthAttMap.get(dayObj.dateStr);

    if (isPunchLogAttendanceMode && dayObj.dateStr > evaluationCutoffDate && !leaveInfo && !att) {
      // Future working day in the ongoing month: has not occurred yet
      dayObj.dayPresent = 0;
      dayObj.dayPaidLeave = 0;
      dayObj.dayLop = 0;
      continue;
    }

    if (leaveInfo) {
      if (leaveInfo.isWfh) {
        dayObj.dayPresent = 1;
      } else if (leaveInfo.isHalfDay) {
        if (leaveInfo.isUnpaid && lopEnabled) {
          dayObj.dayLop = 0.5;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPaidLeave = 0.5;
          dayObj.hasLeaveOrAbsence = true;
        }
        // Remaining 0.5 day
        const attStatus = String(att?.status || '').trim().toLowerCase();
        if (attStatus === 'absent' && lopEnabled) {
          dayObj.dayLop += 0.5;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else if (att || !isPunchLogAttendanceMode) {
          dayObj.dayPresent = 0.5;
          if (att) actualPunchedDays += 0.5;
        } else if (lopEnabled) {
          dayObj.dayLop += 0.5;
        }
      } else {
        if (leaveInfo.isUnpaid && lopEnabled) {
          dayObj.dayLop = 1;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPaidLeave = 1;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = false;
        }
      }
      continue;
    }

    if (att) {
      const statusNorm = String(att.status || '').trim().toLowerCase();
      const rawCheckOut = att.checkOut ?? att.check_out;
      const hasCompletedOut =
        Boolean(rawCheckOut) &&
        String(rawCheckOut).trim() !== '' &&
        String(rawCheckOut).trim() !== '--:--' &&
        !String(rawCheckOut).toLowerCase().includes('progress');
      const numWh = Number(att.workingHours ?? att.working_hours ?? 0);
      const workedHrsForDay = Number.isFinite(numWh) && numWh > 0 && (!rawCheckOut || hasCompletedOut) ? numWh : 0;
      const shiftHrsForDay = Number(att.shiftWorkingHours ?? att.shiftHours ?? 9) || 9;
      const isHalfDayByHours =
        (statusNorm === 'present' || statusNorm === 'late') &&
        workedHrsForDay > 0 &&
        workedHrsForDay < shiftHrsForDay * 0.7;

      if (statusNorm === 'half day' || statusNorm === 'half-day' || statusNorm === 'hd' || isHalfDayByHours) {
        dayObj.dayPresent = 0.5;
        actualPunchedDays += 0.5;
        if (lopEnabled) {
          dayObj.dayLop = 0.5;
        } else {
          dayObj.dayPresent = 1;
        }
      } else if (
        statusNorm === 'present' ||
        statusNorm === 'late' ||
        statusNorm === 'work from home' ||
        statusNorm === 'wfh' ||
        statusNorm === 'on duty' ||
        statusNorm === 'field visit'
      ) {
        dayObj.dayPresent = 1;
        actualPunchedDays += 1;
      } else if (statusNorm === 'on leave' || statusNorm === 'leave') {
        const unpaid = isLeaveTypeUnpaidCheck(att.leaveType || att.reason);
        if (unpaid && lopEnabled) {
          dayObj.dayLop = 1;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPaidLeave = 1;
          dayObj.hasLeaveOrAbsence = true;
        }
      } else if (statusNorm === 'absent') {
        if (lopEnabled) {
          dayObj.dayLop = 1;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPresent = 1;
        }
      } else if (statusNorm === 'missing punch' || statusNorm === 'pending') {
        // Requirement 7: Do not automatically convert pending attendance or missing punches to LOP
        // without following the configured approval policy.
        pendingAttendanceDays += 1;
        if (params.autoConvertPendingToLop === true && lopEnabled) {
          dayObj.dayLop = 1;
          dayObj.hasLeaveOrAbsence = true;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPresent = 1;
        }
      } else {
        dayObj.dayPresent = 1;
      }
    } else if (isPunchLogAttendanceMode) {
      // Elapsed scheduled working day with NO attendance punch and NO approved leave -> Absent / LOP
      dayObj.dayPresent = 0;
      if (lopEnabled) {
        dayObj.dayLop = 1;
      }
    } else {
      dayObj.dayPresent = 1;
    }
  }

  // Step 2: Evaluate Sandwich Policy & Holiday/Week-Off Eligibility on eligible Weekly Offs and Paid Holidays
  const activeSandwichPolicy = Array.isArray(params.sandwichPolicies)
    ? params.sandwichPolicies.find(p => p && p.status === 'Active' && p.sandwichRuleEnabled === true)
    : null;

  const findAdjacentWorkingDay = (startIndex: number, direction: -1 | 1): DayClassification | null => {
    let idx = startIndex + direction;
    while (idx >= 0 && idx < dayList.length) {
      const candidate = dayList[idx];
      if (!candidate.isEligible) return null;
      if (candidate.isScheduledWorkingDay) return candidate;
      idx += direction;
    }
    return null;
  };

  let paidWeekOffDays = 0;
  let paidHolidayDays = 0;
  let sandwichLopDays = 0;

  for (let i = 0; i < dayList.length; i++) {
    const dayObj = dayList[i];
    if (!dayObj.isEligible || dayObj.isScheduledWorkingDay) continue;

    if (
      isPunchLogAttendanceMode &&
      dayObj.dateStr > evaluationCutoffDate &&
      !monthAttMap.has(dayObj.dateStr) &&
      !leaveDatesInRequestRange.has(dayObj.dateStr)
    ) {
      // Future weekly off or future holiday in the ongoing month: has not occurred yet
      continue;
    }

    let convertToLop = false;

    if (dayObj.isExplicitSandwichUnpaid && lopEnabled) {
      convertToLop = true;
    } else if (lopEnabled && (activeSandwichPolicy || params.weekOffEligibilityPolicy)) {
      const prevWork = findAdjacentWorkingDay(i, -1);
      const nextWork = findAdjacentWorkingDay(i, 1);

      if (activeSandwichPolicy) {
        const appliesToDayType =
          (dayObj.isWeeklyOff && activeSandwichPolicy.countWeeklyOffAsLeave !== false) ||
          (dayObj.isEffectiveHoliday && activeSandwichPolicy.countPublicHolidayAsLeave !== false);

        if (appliesToDayType) {
          const cond = String(activeSandwichPolicy.sandwichCondition || 'BOTH_SIDES_MANDATORY');
          const beforeHasLeave = Boolean(prevWork?.hasLeaveOrAbsence);
          const afterHasLeave = Boolean(nextWork?.hasLeaveOrAbsence);

          let condMet = false;
          if (cond === 'LEAVE_ONLY_BEFORE') condMet = beforeHasLeave;
          else if (cond === 'LEAVE_ONLY_AFTER') condMet = afterHasLeave;
          else if (cond === 'EITHER_SIDE' || cond === 'LEAVE_BEFORE_OR_AFTER') condMet = beforeHasLeave || afterHasLeave;
          else condMet = beforeHasLeave && afterHasLeave;

          if (condMet) {
            const payType = String(activeSandwichPolicy.payType || 'SAME_AS_APPLIED_LEAVE');
            if (payType === 'UNPAID_LEAVE') {
              convertToLop = true;
            } else if (payType !== 'PAID_LEAVE') {
              const flankingUnpaid =
                Boolean(prevWork?.isUnpaidLeaveOrAbsence) || Boolean(nextWork?.isUnpaidLeaveOrAbsence);
              if (flankingUnpaid) {
                convertToLop = true;
              }
            }
          }
        }
      }

      if (!convertToLop && params.weekOffEligibilityPolicy) {
        const checkWeekOffElig = dayObj.isWeeklyOff && params.weekOffEligibilityPolicy.requireAdjacentPresenceForWeekOff;
        const checkHolidayElig = dayObj.isEffectiveHoliday && params.weekOffEligibilityPolicy.requireAdjacentPresenceForHoliday;
        if (checkWeekOffElig || checkHolidayElig) {
          if (prevWork && nextWork && prevWork.isUnpaidLeaveOrAbsence && nextWork.isUnpaidLeaveOrAbsence) {
            convertToLop = true;
          }
        }
      }
    }

    if (convertToLop) {
      dayObj.dayLop = 1;
      sandwichLopDays += 1;
    } else {
      if (dayObj.isWeeklyOff) {
        paidWeekOffDays += 1;
      } else if (dayObj.isEffectiveHoliday) {
        paidHolidayDays += 1;
      }
    }
  }

  const scheduledWorkingDays = dayList.filter(d => d.isEligible && d.isScheduledWorkingDay).length;
  let presentDays = dayList.reduce((sum, d) => sum + d.dayPresent, 0);
  let paidLeaveDays = dayList.reduce((sum, d) => sum + d.dayPaidLeave, 0);
  let lopDays = dayList.reduce((sum, d) => sum + d.dayLop, 0);

  // Step 3: Apply explicit summary overrides when daily records were not provided or when explicit LOP / Paid Leave is higher
  const explicitPaidLeave = Math.max(0, Number(params.explicitPaidLeaveDays) || 0);
  if (!hasDailyRecords && explicitPaidLeave > 0) {
    paidLeaveDays = Math.min(scheduledWorkingDays, explicitPaidLeave);
    presentDays = Math.max(0, scheduledWorkingDays - paidLeaveDays - lopDays);
  }

  const rawExplicitLop =
    params.explicitLopDays !== undefined && Number(params.explicitLopDays) > 0
      ? Number(params.explicitLopDays)
      : Number(params.explicitUnpaidLeaveDays || 0) +
        Number(params.explicitAbsentDays || 0) +
        Number(params.explicitHalfDays || 0) * 0.5;

  if (!isPunchLogAttendanceMode && lopEnabled && rawExplicitLop > lopDays) {
    const targetLop = Math.min(eligibleDays, rawExplicitLop);
    const additionalLop = targetLop - lopDays;
    lopDays = targetLop;

    // Deduct additional LOP from presentDays first, then paidWeekOffDays/paidHolidayDays if needed
    const deductFromPresent = Math.min(presentDays, additionalLop);
    presentDays = Math.max(0, presentDays - deductFromPresent);
    let remainingToDeduct = additionalLop - deductFromPresent;

    if (remainingToDeduct > 0) {
      const deductFromWeekOff = Math.min(paidWeekOffDays, remainingToDeduct);
      paidWeekOffDays -= deductFromWeekOff;
      remainingToDeduct -= deductFromWeekOff;
    }
    if (remainingToDeduct > 0) {
      const deductFromHoliday = Math.min(paidHolidayDays, remainingToDeduct);
      paidHolidayDays -= deductFromHoliday;
    }
  }

  if (isPunchLogAttendanceMode && presentDays + paidLeaveDays <= 0) {
    paidWeekOffDays = 0;
    paidHolidayDays = 0;
  }

  // Round to 2 decimal places (supports 0.5 half days cleanly)
  presentDays = Math.round(presentDays * 100) / 100;
  paidLeaveDays = Math.round(paidLeaveDays * 100) / 100;
  lopDays = lopEnabled ? Math.round(lopDays * 100) / 100 : 0;
  paidWeekOffDays = Math.round(paidWeekOffDays * 100) / 100;
  paidHolidayDays = Math.round(paidHolidayDays * 100) / 100;

  // Requirement 5:
  // In punch-log attendance mode: Paid Days = Present Days + Paid Week Offs + Paid Holidays + Paid Leaves (elapsed up to cutoff).
  // In summary mode: Paid Days = Eligible Days - Approved LOP Days.
  const paidDays = isPunchLogAttendanceMode
    ? Math.min(
        eligibleDays,
        Math.max(0, Math.round((presentDays + paidWeekOffDays + paidHolidayDays + paidLeaveDays) * 100) / 100)
      )
    : Math.max(0, Math.round((eligibleDays - lopDays) * 100) / 100);
  const prorationFactor = calendarDays > 0 ? paidDays / calendarDays : 1;

  return {
    calendarDays,
    eligibleDays,
    unemployedDays: Math.max(0, calendarDays - eligibleDays),
    scheduledWorkingDays,
    workingDays: scheduledWorkingDays,
    presentDays,
    actualPunchedDays: Math.round(actualPunchedDays * 100) / 100,
    pendingAttendanceDays,
    paidWeekOffDays,
    paidHolidayDays,
    overlappingHolidayDays,
    paidLeaveDays,
    lopDays,
    sandwichLopDays,
    paidDays,
    totalPaidDays: paidDays,
    activeStartDate,
    activeEndDate,
    prorationFactor,
    isFullMonthEligible: eligibleDays === calendarDays,
  };
}

/**
 * Resolves the configured salary divisor for a payroll month without assuming every company uses calendar days.
 */
export function resolvePayrollSalaryDivisor(params: {
  month: number;
  year: number;
  divisorMode?: OtSalaryDivisorMode;
  fixedDivisorDays?: number;
  weeklyOffDayIndex?: number;
  holidayCount?: number;
}): { calendarDays: number; divisorDays: number; modeUsed: string } {
  const calendarDays = getCalendarDaysInMonth(params.month, params.year);
  const mode = params.divisorMode || 'FIXED_DAYS';

  if (mode === 'CALENDAR_DAYS') {
    return { calendarDays, divisorDays: calendarDays, modeUsed: 'CALENDAR_DAYS' };
  }
  if (mode === 'FIXED_30') {
    return { calendarDays, divisorDays: 30, modeUsed: 'FIXED_30' };
  }
  if (mode === 'FIXED_26' || mode === 'STATUTORY_DIVISOR') {
    const statDays = Number(params.fixedDivisorDays) > 0 && mode === 'STATUTORY_DIVISOR' ? Number(params.fixedDivisorDays) : 26;
    return {
      calendarDays,
      divisorDays: mode === 'STATUTORY_DIVISOR' ? statDays : 26,
      modeUsed: mode === 'STATUTORY_DIVISOR' ? 'STATUTORY_DIVISOR' : 'FIXED_26',
    };
  }
  if (mode === 'WORKING_DAYS' || mode === 'ACTUAL_WORKING_DAYS') {
    const weeklyOffs = countWeeklyOffDaysInMonth(params.month, params.year, params.weeklyOffDayIndex ?? 0);
    const holidays = Math.max(0, Number(params.holidayCount) || 0);
    const workingDays = Math.max(1, calendarDays - weeklyOffs - holidays);
    return { calendarDays, divisorDays: workingDays, modeUsed: 'WORKING_DAYS' };
  }
  const fixed = Number(params.fixedDivisorDays);
  const divisorDays = fixed > 0 ? fixed : 26;
  return { calendarDays, divisorDays, modeUsed: mode === 'CUSTOM' ? 'CUSTOM' : 'FIXED_DAYS' };
}

export function parseOtMultiplierValue(multiplier?: OtCalculationMultiplier | number): number {
  if (typeof multiplier === 'number' && multiplier > 0) return multiplier;
  if (multiplier === '2x Salary') return 2;
  if (multiplier === '1.5x Salary') return 1.5;
  return 1;
}

export function calculateEnterpriseOvertimeRateAndAmount(params: {
  approvedHours: number;
  wageBaseMode?: OtWageBaseMode;
  basicSalary?: number;
  grossSalary?: number;
  monthlyCtc?: number;
  fixedHourlyRate?: number;
  divisorDays: number;
  dailyPaidHours: number;
  multiplier?: OtCalculationMultiplier | number;
}): {
  hourlyRate: number;
  multiplierValue: number;
  calculatedAmount: number;
  wageBaseUsed: OtWageBaseMode;
  baseSalaryAmount: number;
  divisorUsed: number;
  dailyPaidHoursUsed: number;
} {
  const hours = new Decimal(Math.max(0, Number(params.approvedHours) || 0));
  const divisor = new Decimal(Math.max(1, Number(params.divisorDays) || 26));
  const shiftHours = new Decimal(Math.max(1, Number(params.dailyPaidHours) || 9));
  const wageBase: OtWageBaseMode = params.wageBaseMode || 'FIXED_HOURLY';
  const multVal = new Decimal(parseOtMultiplierValue(params.multiplier));

  if (wageBase === 'FIXED_HOURLY' || params.multiplier === 'Fixed Amount Per Hour') {
    const fixedRate = new Decimal(Math.max(0, Number(params.fixedHourlyRate) || 100));
    const effectiveMult =
      params.multiplier && params.multiplier !== 'Fixed Amount Per Hour' ? multVal : new Decimal(1);
    const hourlyRate = fixedRate.times(effectiveMult).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const calculatedAmount = hours.times(fixedRate).times(effectiveMult).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      hourlyRate: hourlyRate.toNumber(),
      multiplierValue: effectiveMult.toNumber(),
      calculatedAmount: calculatedAmount.toNumber(),
      wageBaseUsed: 'FIXED_HOURLY',
      baseSalaryAmount: fixedRate.toNumber(),
      divisorUsed: divisor.toNumber(),
      dailyPaidHoursUsed: shiftHours.toNumber(),
    };
  }

  let baseSalary = new Decimal(0);
  if (wageBase === 'BASIC') {
    baseSalary = new Decimal(Number(params.basicSalary) || 0);
  } else if (wageBase === 'GROSS') {
    baseSalary = new Decimal(Number(params.grossSalary) || Number(params.monthlyCtc) || 0);
  } else {
    baseSalary = new Decimal(Number(params.monthlyCtc) || Number(params.grossSalary) || 0);
  }

  if (baseSalary.lessThanOrEqualTo(0) && Number(params.fixedHourlyRate) > 0) {
    const fallbackBase = new Decimal(Number(params.fixedHourlyRate));
    const fallbackRate = fallbackBase.times(multVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      hourlyRate: fallbackRate.toNumber(),
      multiplierValue: multVal.toNumber(),
      calculatedAmount: hours.times(fallbackBase).times(multVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      wageBaseUsed: wageBase,
      baseSalaryAmount: 0,
      divisorUsed: divisor.toNumber(),
      dailyPaidHoursUsed: shiftHours.toNumber(),
    };
  }

  const baseHourly = baseSalary.dividedBy(divisor.times(shiftHours));
  const effectiveHourlyRate = baseHourly.times(multVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const calculatedAmount = baseHourly.times(multVal).times(hours).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    hourlyRate: effectiveHourlyRate.toNumber(),
    multiplierValue: multVal.toNumber(),
    calculatedAmount: calculatedAmount.toNumber(),
    wageBaseUsed: wageBase,
    baseSalaryAmount: baseSalary.toNumber(),
    divisorUsed: divisor.toNumber(),
    dailyPaidHoursUsed: shiftHours.toNumber(),
  };
}

export function resolveEmployeeOtEligibility(params: {
  departmentName: string;
  employeeId?: string;
  role?: string;
  designation?: string;
  dateStr?: string;
  departmentOtAllowed?: boolean;
  departmentEffectiveFrom?: string;
  departmentEffectiveTo?: string;
  employeeExceptionRule?: 'Follow Department' | 'Allow OT' | 'Block OT';
  statutoryEntitlement?: boolean;
  employeePolicyEffectiveFrom?: string;
  employeePolicyEffectiveTo?: string;
}): {
  eligible: boolean;
  source: 'DEPARTMENT_POLICY' | 'EMPLOYEE_EXCEPTION' | 'STATUTORY_ENTITLEMENT' | 'RESTRICTED';
  reason: string;
} {
  if (
    isCeoOrOwnerEmployee({
      employeeId: params.employeeId,
      role: params.role,
      designation: params.designation,
      departmentName: params.departmentName,
    })
  ) {
    return {
      eligible: false,
      source: 'RESTRICTED',
      reason: 'CEO / Company Owner is exempt from attendance tracking and overtime eligibility',
    };
  }

  const dateStr = (params.dateStr || '').slice(0, 10);
  const isDateInRange = (from?: string, to?: string) => {
    if (!dateStr) return true;
    if (from && dateStr < from.slice(0, 10)) return false;
    if (to && dateStr > to.slice(0, 10)) return false;
    return true;
  };

  if (isDateInRange(params.employeePolicyEffectiveFrom, params.employeePolicyEffectiveTo)) {
    if (params.employeeExceptionRule === 'Block OT') {
      return {
        eligible: false,
        source: 'RESTRICTED',
        reason: 'Blocked by employee-specific overtime policy exception',
      };
    }
    if (params.statutoryEntitlement) {
      return {
        eligible: true,
        source: 'STATUTORY_ENTITLEMENT',
        reason: 'Eligible via statutory overtime entitlement',
      };
    }
    if (params.employeeExceptionRule === 'Allow OT') {
      return {
        eligible: true,
        source: 'EMPLOYEE_EXCEPTION',
        reason: 'Eligible via employee-specific overtime policy exception',
      };
    }
  }

  const deptAllowed =
    params.departmentOtAllowed !== undefined
      ? params.departmentOtAllowed && isDateInRange(params.departmentEffectiveFrom, params.departmentEffectiveTo)
      : isDefaultOtEligibleDepartment(params.departmentName);

  if (deptAllowed) {
    return {
      eligible: true,
      source: 'DEPARTMENT_POLICY',
      reason: `Eligible under ${params.departmentName} department overtime policy`,
    };
  }

  return {
    eligible: false,
    source: 'RESTRICTED',
    reason: `Department "${params.departmentName}" is restricted from automatic overtime approval`,
  };
}

export function formatPayslipOvertimeForViewer(params: {
  overtimeHours: number;
  overtimeAmount: number;
  overtimeRate: number;
  divisorUsed?: number;
  shiftHours?: number;
  multiplierLabel?: string;
  visibility?: PayslipOvertimeVisibilityConfig;
}): {
  visible: boolean;
  showHours: boolean;
  showAmount: boolean;
  showCalculationDetails: boolean;
  label: string;
  amount: number;
  description?: string;
} {
  const vis = params.visibility || {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
  };
  const hrs = Number(params.overtimeHours) || 0;
  const amt = Number(params.overtimeAmount) || 0;
  const rate = Number(params.overtimeRate) || 0;

  if (amt <= 0 && hrs <= 0) {
    return {
      visible: false,
      showHours: vis.showOtHoursOnPayslip,
      showAmount: vis.showOtAmountOnPayslip,
      showCalculationDetails: vis.showOtCalculationDetailsOnPayslip,
      label: 'Overtime Earnings',
      amount: 0,
    };
  }

  const label =
    vis.showOtHoursOnPayslip && hrs > 0
      ? `Overtime Earnings (${Number.isInteger(hrs) ? `${hrs} hrs` : formatHoursAndMinutes(hrs)})`
      : 'Overtime Earnings';

  let description: string | undefined;
  if (vis.showOtCalculationDetailsOnPayslip) {
    const parts: string[] = [];
    if (hrs > 0 && rate > 0) parts.push(`${hrs} hrs × ₹${rate}/hr`);
    if (params.divisorUsed) parts.push(`Divisor: ${params.divisorUsed}d`);
    if (params.shiftHours) parts.push(`Shift: ${params.shiftHours}h`);
    if (params.multiplierLabel) parts.push(params.multiplierLabel);
    description = parts.join(' | ') || 'Approved Overtime';
  }

  return {
    visible: vis.showOtAmountOnPayslip || vis.showOtHoursOnPayslip,
    showHours: vis.showOtHoursOnPayslip,
    showAmount: vis.showOtAmountOnPayslip,
    showCalculationDetails: vis.showOtCalculationDetailsOnPayslip,
    label,
    amount: amt,
    description,
  };
}

export const STANDARD_PAYROLL_VARIABLES = [
  'BASIC',
  'HRA',
  'DA',
  'CONV',
  'CONVEYANCE',
  'OT',
  'OVERTIME',
  'GROSS',
  'CTC',
  'DAILY_SALARY',
  'WORKING_DAYS',
  'PAID_DAYS',
  'UNPAID_DAYS',
  'LATE_COUNT',
  'LEAVE_DAYS',
  'INCENTIVE',
  'BONUS',
  'REWARD',
  'ATTENDANCE_BONUS',
] as const;

export const evaluateFormula = (formula: string, context: Record<string, number | undefined>): number => {
  if (!formula || typeof formula !== 'string') return 0;

  let expr = formula.toUpperCase();
  const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = context[key];
    if (val !== undefined) {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expr = expr.replace(regex, `(${Number(val) || 0})`);
    }
  }

  const sanitized = expr.replace(/[^0-9.+\-*/() ]/g, '');

  try {
    let index = 0;

    const parseNumber = (): number => {
      let numStr = '';
      while (index < sanitized.length && /[0-9.]/.test(sanitized[index])) {
        numStr += sanitized[index];
        index++;
      }
      return parseFloat(numStr) || 0;
    };

    const parseFactor = (): number => {
      while (index < sanitized.length && sanitized[index] === ' ') index++;
      if (index >= sanitized.length) return 0;

      if (sanitized[index] === '(') {
        index++;
        const res = parseExpression();
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        if (sanitized[index] === ')') index++;
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
    if (isNaN(result) || !isFinite(result)) return 0;
    return new Decimal(result).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
};

export const validateFormula = (
  formula: string,
  options?: {
    allowedVariables?: string[];
    currentComponentCode?: string;
    allComponents?: { code: string; formula?: string; calculationMethod?: string }[];
  }
): { isValid: boolean; error?: string; referencedVariables?: string[] } => {
  if (!formula || !formula.trim()) {
    return { isValid: false, error: 'Formula cannot be empty' };
  }
  const trimmed = formula.trim();
  let balance = 0;
  for (const ch of trimmed) {
    if (ch === '(') balance++;
    if (ch === ')') balance--;
    if (balance < 0) return { isValid: false, error: 'Unbalanced parentheses' };
  }
  if (balance !== 0) return { isValid: false, error: 'Unclosed parenthesis' };

  const allowed = /^[A-Z0-9_.+\-*/() ]+$/i;
  if (!allowed.test(trimmed)) {
    return { isValid: false, error: 'Formula contains unsupported special characters' };
  }

  const compact = trimmed.replace(/\s+/g, '');
  if (/\(\)/.test(compact) || /^[*/]|[+\-*/]$/.test(compact) || /[+\-*/]{2,}/.test(compact) || /\([*/]/.test(compact) || /[+\-*/]\)/.test(compact)) {
    return { isValid: false, error: 'Formula contains invalid operator syntax' };
  }

  const rawTokens = trimmed.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  const referencedVariables = Array.from(new Set(rawTokens.map(t => t.toUpperCase())));

  const allowedSet = new Set<string>(STANDARD_PAYROLL_VARIABLES);
  options?.allowedVariables?.forEach(v => v && allowedSet.add(v.trim().toUpperCase()));
  options?.allComponents?.forEach(c => c?.code && allowedSet.add(c.code.trim().toUpperCase()));

  const unknownVars = referencedVariables.filter(v => !allowedSet.has(v));
  if (unknownVars.length > 0) {
    return { isValid: false, error: `Unknown variable(s): ${unknownVars.join(', ')}`, referencedVariables };
  }

  const selfCode = options?.currentComponentCode?.trim().toUpperCase();
  if (selfCode) {
    if (referencedVariables.includes(selfCode)) {
      return { isValid: false, error: `Circular dependency detected: ${selfCode} cannot reference itself`, referencedVariables };
    }
    if (options?.allComponents && options.allComponents.length > 0) {
      const compMap = new Map<string, string[]>();
      options.allComponents.forEach(c => {
        const code = (c.code || '').trim().toUpperCase();
        if (!code) return;
        const fStr = code === selfCode ? trimmed : (c.calculationMethod === 'FORMULA' ? (c.formula || '') : '');
        const deps = (fStr.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || []).map(t => t.toUpperCase());
        compMap.set(code, Array.from(new Set(deps)));
      });
      compMap.set(selfCode, referencedVariables);

      const visited = new Set<string>();
      const visiting = new Set<string>();
      const findCycle = (node: string, path: string[]): string[] | null => {
        if (visiting.has(node)) return [...path, node];
        if (visited.has(node)) return null;
        visiting.add(node);
        for (const next of compMap.get(node) || []) {
          if (compMap.has(next)) {
            const cycle = findCycle(next, [...path, node]);
            if (cycle) return cycle;
          }
        }
        visiting.delete(node);
        visited.add(node);
        return null;
      };
      const cycle = findCycle(selfCode, []);
      if (cycle) {
        return { isValid: false, error: `Circular dependency detected: ${cycle.join(' → ')}`, referencedVariables };
      }
    }
  }

  return { isValid: true, referencedVariables };
};

export class PayrollConfigurationError extends Error {
  public code: string;
  public details: unknown[];

  constructor(message: string, code = 'PF_CONFIGURATION_ERROR', details: unknown[] = []) {
    super(message);
    this.name = 'PayrollConfigurationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates and computes fixed salary components from percentages.
 * Percentages must sum to exactly 100.
 */
export const computeSalaryStructure = (input: SalaryStructureInput): ComputedSalaryStructure => {
  const monthly = new Decimal(input.monthlySalary);
  const basicPct = new Decimal(input.basicPercentage);
  const daPct = new Decimal(input.daPercentage);
  const convPct = new Decimal(input.conveyancePercentage);
  const hraPct = new Decimal(input.hraPercentage);

  const pctSum = basicPct.plus(daPct).plus(convPct).plus(hraPct);

  if (monthly.isNegative()) {
    throw new Error('Monthly salary cannot be negative');
  }

  if (basicPct.isNegative() || daPct.isNegative() || convPct.isNegative() || hraPct.isNegative()) {
    throw new Error('Salary component percentages cannot be negative');
  }

  // Tolerant to small floating point precision in input (0.01)
  if (!pctSum.minus(100).abs().lessThanOrEqualTo(0.01)) {
    throw new Error(`Salary structure percentages must sum to 100% (current sum: ${pctSum.toString()}%)`);
  }

  const basicSalary = monthly.times(basicPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const da = monthly.times(daPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const conveyance = monthly.times(convPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const hra = monthly.times(hraPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const fixedGross = basicSalary.plus(da).plus(conveyance).plus(hra).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    monthlySalary: monthly.toDecimalPlaces(2).toNumber(),
    basicSalary: basicSalary.toNumber(),
    da: da.toNumber(),
    conveyance: conveyance.toNumber(),
    hra: hra.toNumber(),
    fixedGross: fixedGross.toNumber(),
    percentagesSum: pctSum.toNumber(),
    isValid: true,
  };
};

/**
 * Calculates Provident Fund (PF) contribution according to business policy.
 * Default PF Base = Basic + DA + Conveyance
 * Default PF Rate = 12%
 */
export const calculatePF = (
  basic: Decimal,
  da: Decimal,
  conveyance: Decimal,
  hra: Decimal,
  attendanceBonus: Decimal,
  overtime: Decimal,
  otherEarnings: Decimal,
  pfEnabled: boolean,
  pfRate: number | null | undefined,
  wageComponents?: Record<string, boolean>
): { pfBase: Decimal; pfRateApplied: Decimal; pfAmount: Decimal } => {
  if (!pfEnabled) {
    return {
      pfBase: new Decimal(0),
      pfRateApplied: new Decimal(0),
      pfAmount: new Decimal(0),
    };
  }

  // Strict rule: If PF is enabled, configuration must be valid. Never silently set PF = 0!
  if (pfRate === null || pfRate === undefined || isNaN(pfRate) || pfRate <= 0) {
    throw new PayrollConfigurationError(
      'PF configuration is required to calculate payroll',
      'PF_CONFIGURATION_ERROR',
      ['pf_rate is missing, disabled or invalid while pf_enabled is TRUE']
    );
  }

  const rate = new Decimal(pfRate);
  let base = new Decimal(0);

  if (wageComponents) {
    if (wageComponents.basic !== false) base = base.plus(basic);
    if (wageComponents.da !== false) base = base.plus(da);
    if (wageComponents.conveyance !== false) base = base.plus(conveyance);
    if (wageComponents.hra === true) base = base.plus(hra);
    if (wageComponents.attendance_bonus === true) base = base.plus(attendanceBonus);
    if (wageComponents.overtime === true) base = base.plus(overtime);
    if (wageComponents.other_earnings === true) base = base.plus(otherEarnings);
  } else {
    // Default standard project formula: Basic + DA + Conveyance
    base = basic.plus(da).plus(conveyance);
  }

  const pfAmount = base.times(rate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    pfBase: base.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    pfRateApplied: rate,
    pfAmount,
  };
};

/**
 * Calculates ESIC contribution according to project business policy.
 * ESIC Base = Basic + DA + Conveyance + HRA + Attendance Bonus + Overtime + Other Earnings
 * Default ESIC Rate = 0.75%
 * Wage ceiling threshold: default ₹21,000
 */
export const calculateESIC = (
  basic: Decimal,
  da: Decimal,
  conveyance: Decimal,
  hra: Decimal,
  attendanceBonus: Decimal,
  overtime: Decimal,
  otherEarnings: Decimal,
  grossSalary: Decimal,
  esicEnabled: boolean,
  esicRate: number | null | undefined,
  threshold: number | null | undefined,
  wageComponents?: Record<string, boolean>,
  isContributionPeriodContinuation?: boolean,
  options?: {
    excludeOtFromEligibility?: boolean;
    esicCovered?: boolean;
    employerEsicRate?: number;
  }
): {
  esicBase: Decimal;
  esicRateApplied: Decimal;
  esicAmount: Decimal;
  employerEsicRateApplied: Decimal;
  employerEsicAmount: Decimal;
  esicCovered: boolean;
} => {
  if (!esicEnabled) {
    return {
      esicBase: new Decimal(0),
      esicRateApplied: new Decimal(0),
      esicAmount: new Decimal(0),
      employerEsicRateApplied: new Decimal(0),
      employerEsicAmount: new Decimal(0),
      esicCovered: false,
    };
  }

  const wageCeiling = new Decimal(threshold ?? 21000);
  const eligibilityWage = options?.excludeOtFromEligibility
    ? Decimal.max(0, grossSalary.minus(overtime))
    : grossSalary;

  const isCovered =
    options?.esicCovered === true ||
    Boolean(isContributionPeriodContinuation) ||
    eligibilityWage.lessThanOrEqualTo(wageCeiling);

  // If eligibility wage exceeds statutory ceiling and employee is NOT covered / continuing, exempt
  if (!isCovered) {
    return {
      esicBase: new Decimal(0),
      esicRateApplied: new Decimal(0),
      esicAmount: new Decimal(0),
      employerEsicRateApplied: new Decimal(0),
      employerEsicAmount: new Decimal(0),
      esicCovered: false,
    };
  }

  const rate = new Decimal(esicRate ?? 0.75);
  const employerRate = new Decimal(options?.employerEsicRate ?? 3.25);
  let base = new Decimal(0);

  if (wageComponents) {
    if (wageComponents.basic !== false) base = base.plus(basic);
    if (wageComponents.da !== false) base = base.plus(da);
    if (wageComponents.conveyance !== false) base = base.plus(conveyance);
    if (wageComponents.hra !== false) base = base.plus(hra);
    if (wageComponents.attendance_bonus !== false) base = base.plus(attendanceBonus);
    if (wageComponents.overtime !== false) base = base.plus(overtime);
    if (wageComponents.other_earnings !== false) base = base.plus(otherEarnings);
  } else {
    // Default project formula: Basic + DA + Conveyance + HRA + Attendance Bonus + Overtime + Other Earnings
    base = basic
      .plus(da)
      .plus(conveyance)
      .plus(hra)
      .plus(attendanceBonus)
      .plus(overtime)
      .plus(otherEarnings);
  }

  const esicAmount = base.times(rate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const employerEsicAmount = base.times(employerRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    esicBase: base.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    esicRateApplied: rate,
    esicAmount,
    employerEsicRateApplied: employerRate,
    employerEsicAmount,
    esicCovered: true,
  };
};

/**
 * Calculates Loss of Pay (LOP) based on attendance and working days.
 * Daily Salary = Monthly Salary / Working Days
 * LOP = Daily Salary * LOP Days
 */
export const calculateLOP = (
  monthlySalary: Decimal,
  workingDays: number,
  lopDays: number
): { dailySalary: Decimal; lopAmount: Decimal } => {
  if (workingDays <= 0 || lopDays <= 0) {
    return {
      dailySalary: workingDays > 0 ? monthlySalary.dividedBy(workingDays).toDecimalPlaces(2) : new Decimal(0),
      lopAmount: new Decimal(0),
    };
  }

  const daysCount = new Decimal(workingDays);
  const unpaidDays = new Decimal(lopDays);
  const dailySalary = monthlySalary.dividedBy(daysCount).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const lopAmount = dailySalary.times(unpaidDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    dailySalary: dailySalary.toDecimalPlaces(2),
    lopAmount,
  };
};

/**
 * Main calculation engine: orchestrates authoritative Calendar Day Based Payroll calculation.
 * All computations use Decimal for full financial accuracy.
 */
export const computeFullPayroll = (input: PayrollCalculationInput): FullPayrollCalculationResult => {
  // 1. Full Monthly Configured Salary Structure
  const structure = computeSalaryStructure({
    monthlySalary: input.monthlySalary,
    basicPercentage: input.basicPercentage,
    daPercentage: input.daPercentage,
    conveyancePercentage: input.conveyancePercentage,
    hraPercentage: input.hraPercentage,
  });

  const fullBasic = new Decimal(structure.basicSalary);
  const fullDa = new Decimal(structure.da);
  const fullConveyance = new Decimal(structure.conveyance);
  const fullHra = new Decimal(structure.hra);
  const fullFixedGross = new Decimal(structure.fixedGross);

  const isCeo = isCeoOrOwnerEmployee({
    employeeId: input.employeeId,
    id: input.employeeContext?.id,
    role: input.employeeContext?.role,
    department: input.employeeContext?.department,
    designation: input.employeeContext?.designation,
  });

  // 2. Calendar Day Based Attendance & Payable Days Breakdown (Requirements 1-9)
  const calBreakdown = calculateCalendarDayPayrollAttendance({
    month: input.payrollMonth,
    year: input.payrollYear,
    employeeId: input.employeeId,
    employeeUuid: input.employeeContext?.id,
    joiningDate: input.joiningDate ?? input.attendance?.joiningDate ?? input.employeeContext?.joiningDate,
    exitDate: input.exitDate ?? input.attendance?.exitDate,
    weeklyOff: input.weeklyOff ?? input.attendance?.weeklyOff,
    weeklySchedules: input.weeklySchedules ?? input.attendance?.weeklySchedules,
    holidays: input.holidays ?? input.attendance?.holidays,
    employeeLocation: input.employeeContext?.branchId,
    attendanceRecords: input.attendanceRecords ?? input.attendance?.attendanceRecords,
    leaveRequests: input.leaveRequests ?? input.attendance?.leaveRequests,
    sandwichPolicies: input.sandwichPolicies ?? input.attendance?.sandwichPolicies,
    weekOffEligibilityPolicy: input.weekOffEligibilityPolicy,
    autoConvertPendingToLop: input.autoConvertPendingToLop,
    lopEnabled: input.settings?.lopEnabled !== false,
    isCeo,
    evaluationCutoffDate: (input as any).evaluationCutoffDate,
    explicitLopDays: input.attendance?.lopDays,
    explicitPaidLeaveDays: input.attendance?.paidLeaveDays,
    explicitUnpaidLeaveDays: input.attendance?.unpaidLeaveDays,
    explicitAbsentDays: input.attendance?.absentDays,
    explicitHalfDays: input.attendance?.halfDays,
    explicitPresentDays: input.attendance?.presentDays,
  });

  const calendarDays = calBreakdown.calendarDays;
  const eligibleDays = calBreakdown.eligibleDays;
  const paidDays = calBreakdown.paidDays;
  const lopDays = calBreakdown.lopDays;
  const scheduledWorkingDays = calBreakdown.scheduledWorkingDays;
  const presentDays = calBreakdown.presentDays;
  const paidWeekOffDays = calBreakdown.paidWeekOffDays;
  const paidHolidayDays = calBreakdown.paidHolidayDays;
  const paidLeaveDays = calBreakdown.paidLeaveDays;

  // Resolve Configured Salary Divisor for Overtime hourly rate calculation
  const resolvedDivisor = resolvePayrollSalaryDivisor({
    month: input.payrollMonth,
    year: input.payrollYear,
    divisorMode: input.salaryDivisorMode || 'FIXED_DAYS',
    fixedDivisorDays: input.customSalaryDivisor || input.attendance.workingDays || input.settings.standardWorkingDays || 26,
  });

  // 3. Prorate Salary Components by Paid Days / Total Calendar Days (Requirements 5, 9, 10)
  // Requirement 9: If an employee is eligible for the full month and has zero LOP,
  // pay the full configured monthly gross salary regardless of the number of Sundays or holidays.
  let basic = fullBasic;
  let da = fullDa;
  let conveyance = fullConveyance;
  let hra = fullHra;
  let fixedGross = fullFixedGross;

  if (!isCeo && paidDays < calendarDays) {
    if (paidDays <= 0 || calendarDays <= 0) {
      basic = new Decimal(0);
      da = new Decimal(0);
      conveyance = new Decimal(0);
      hra = new Decimal(0);
      fixedGross = new Decimal(0);
    } else {
      const paidDec = new Decimal(paidDays);
      const calDec = new Decimal(calendarDays);
      fixedGross = fullFixedGross.times(paidDec).dividedBy(calDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      basic = fullBasic.times(paidDec).dividedBy(calDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      da = fullDa.times(paidDec).dividedBy(calDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      conveyance = fullConveyance.times(paidDec).dividedBy(calDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      hra = fullHra.times(paidDec).dividedBy(calDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // Reconcile minor 1-paisa rounding delta so component sum matches Monthly Gross * Paid Days / Calendar Days
      const componentSum = basic.plus(da).plus(conveyance).plus(hra);
      const diff = fixedGross.minus(componentSum);
      if (!diff.isZero() && diff.abs().lessThanOrEqualTo(0.05)) {
        if (hra.greaterThan(0)) {
          hra = hra.plus(diff).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        } else if (basic.greaterThan(0)) {
          basic = basic.plus(diff).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        }
      }
    }
  }

  const prorationRatio = isCeo || paidDays >= calendarDays || calendarDays <= 0
    ? new Decimal(1)
    : new Decimal(paidDays).dividedBy(calendarDays);

  // 4. Additional Earnings & Enterprise Overtime Calculation
  const attBonus = isCeo ? new Decimal(0) : new Decimal(input.earnings?.attendanceBonus ?? 0);

  const otHours = isCeo ? new Decimal(0) : new Decimal(input.earnings?.overtimeHours ?? 0);
  let otRate = isCeo ? new Decimal(0) : new Decimal(input.earnings?.overtimeRate ?? 0);
  let otAmount = isCeo ? new Decimal(0) : new Decimal(input.earnings?.overtimeAmount ?? 0);

  if (!isCeo && otAmount.isZero() && otHours.greaterThan(0)) {
    if (input.earnings?.overtimeWageBase || input.earnings?.overtimeMultiplier) {
      const enterpriseOt = calculateEnterpriseOvertimeRateAndAmount({
        approvedHours: otHours.toNumber(),
        wageBaseMode: input.earnings?.overtimeWageBase || (otRate.greaterThan(0) ? 'FIXED_HOURLY' : 'GROSS'),
        basicSalary: fullBasic.toNumber(),
        grossSalary: fullFixedGross.toNumber(),
        monthlyCtc: input.monthlySalary,
        fixedHourlyRate: otRate.toNumber() || 100,
        divisorDays: resolvedDivisor.divisorDays,
        dailyPaidHours: input.earnings?.standardShiftHours || 9,
        multiplier: input.earnings?.overtimeMultiplier || '1x Salary',
      });
      otRate = new Decimal(enterpriseOt.hourlyRate);
      otAmount = new Decimal(enterpriseOt.calculatedAmount);
    } else if (otRate.greaterThan(0)) {
      otAmount = otHours.times(otRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
  }

  const bonus = new Decimal(input.earnings?.bonus ?? 0);
  const incentive = new Decimal(input.earnings?.incentive ?? 0);
  const commission = new Decimal(input.earnings?.commission ?? 0);
  const otherEarnings = new Decimal(input.earnings?.otherEarnings ?? 0);

  // Dynamic component eligibility evaluation (evaluated against employee's configured salary structure)
  const eligibilityCtx: EmployeeSalaryEligibilityContext = {
    id: input.employeeContext?.id || input.employeeId,
    employeeId: input.employeeId,
    monthlyCtc: input.monthlySalary,
    basicSalary: fullBasic.toNumber(),
    grossSalary: fullFixedGross.toNumber(),
    withPf: input.withPf !== undefined ? input.withPf : true,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
    isContributionPeriodContinuation: input.employeeContext?.isContributionPeriodContinuation,
    ...(input.employeeContext || {}),
  };

  let customEarningsSum = new Decimal(0);
  const customEarningsBreakdown: CalculationBreakdownItem[] = [];

  const configured = input.configuredComponents || [];
  const baseCodes = new Set(['BASIC', 'DA', 'HRA', 'CONV', 'CONVEYANCE', 'OT', 'OVERTIME']);

  // Build shared formula context with global OT variable (Section 7)
  const formulaCtx: Record<string, number> = {
    BASIC: basic.toNumber(),
    DA: da.toNumber(),
    CONV: conveyance.toNumber(),
    CONVEYANCE: conveyance.toNumber(),
    HRA: hra.toNumber(),
    OT: otAmount.toNumber(),
    OVERTIME: otAmount.toNumber(),
    ATTENDANCE_BONUS: attBonus.toNumber(),
    GROSS: fixedGross.plus(otAmount).toNumber(),
    CTC: input.monthlySalary,
    WORKING_DAYS: scheduledWorkingDays,
    PAID_DAYS: paidDays,
    UNPAID_DAYS: lopDays,
  };

  // Evaluate custom earnings
  for (const comp of configured) {
    if (comp.type !== 'EARNING' || !comp.active) continue;
    const code = (comp.code || '').toUpperCase().trim();
    // Prevent duplicate counting of base salary components or already-computed OT
    if (baseCodes.has(code)) continue;
    if (comp.calculationMethod === 'ATTENDANCE_OT' && otAmount.greaterThan(0)) continue;

    if (isComponentEligible(comp, eligibilityCtx)) {
      let amount = new Decimal(0);
      if (comp.calculationMethod === 'FIXED_AMOUNT') {
        amount = new Decimal(comp.defaultValue || 0).times(prorationRatio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (comp.calculationMethod === 'PERCENTAGE') {
        const baseVal = comp.percentageBase === 'BASIC'
          ? basic
          : (comp.percentageBase === 'GROSS' ? fixedGross : new Decimal(input.monthlySalary).times(prorationRatio));
        amount = baseVal.times(comp.defaultValue || 0).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (comp.calculationMethod === 'ATTENDANCE_OT') {
        amount = otAmount;
      } else if (comp.calculationMethod === 'FORMULA' && comp.formula) {
        amount = new Decimal(evaluateFormula(comp.formula, formulaCtx)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
      if (code) {
        formulaCtx[code] = amount.toNumber();
      }
      if (amount.greaterThan(0)) {
        customEarningsSum = customEarningsSum.plus(amount);
        customEarningsBreakdown.push({
          name: comp.name,
          category: 'EARNING',
          amount: amount.toNumber(),
          description: comp.calculationMethod === 'PERCENTAGE'
            ? `${comp.defaultValue}% of ${comp.percentageBase || 'CTC'} | Paid ${paidDays}/${calendarDays} days`
            : comp.calculationMethod === 'FORMULA'
              ? `Formula: ${comp.formula}`
              : comp.calculationMethod === 'ATTENDANCE_OT'
                ? 'Attendance-Based Overtime (OT)'
                : `Fixed ₹${comp.defaultValue} | Paid ${paidDays}/${calendarDays} days`
        });
      }
    }
  }

  // Gross Earnings = Prorated Fixed Gross + Attendance Bonus + OT + Bonus + Incentive + Commission + Other + Custom Earnings
  const grossSalary = fixedGross
    .plus(attBonus)
    .plus(otAmount)
    .plus(bonus)
    .plus(incentive)
    .plus(commission)
    .plus(otherEarnings)
    .plus(customEarningsSum)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  eligibilityCtx.grossSalary = grossSalary.toNumber();
  formulaCtx.GROSS = grossSalary.toNumber();

  // 5. Statutory Deductions (PF & ESIC) on prorated components according to configured policies
  const isPfEligible = input.withPf !== undefined ? input.withPf : true;
  const pfEnabled = isPfEligible && input.settings.pfEnabled;
  const esicEnabled = isPfEligible && input.settings.esicEnabled;

  const pfResult = calculatePF(
    basic,
    da,
    conveyance,
    hra,
    attBonus,
    otAmount,
    otherEarnings,
    pfEnabled,
    input.settings.pfRate,
    input.settings.pfWageComponents
  );

  const employerPfRate = pfEnabled ? new Decimal(12) : new Decimal(0);
  const employerPfAmount = pfEnabled
    ? pfResult.pfBase.times(employerPfRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);

  // 6. Statutory Deductions (ESIC)
  const esicResult = calculateESIC(
    basic,
    da,
    conveyance,
    hra,
    attBonus,
    otAmount,
    otherEarnings,
    grossSalary,
    esicEnabled,
    input.settings.esicRate,
    input.settings.esicSalaryThreshold,
    input.settings.esicWageComponents,
    input.employeeContext?.isContributionPeriodContinuation,
    {
      excludeOtFromEligibility: input.employeeContext?.excludeOtFromEsicEligibility,
      esicCovered: input.employeeContext?.esicCovered,
      employerEsicRate: 3.25,
    }
  );

  // 7. Professional Tax (PT)
  let ptAmount = new Decimal(0);
  if (input.settings.professionalTaxEnabled && grossSalary.greaterThan(0)) {
    ptAmount = new Decimal(input.settings.professionalTaxAmount ?? 200).toDecimalPlaces(2);
  }

  // 8. Calendar-Day Daily Salary & Informational LOP Amount
  // Note: Because fixedGross is already prorated by Paid Days / Calendar Days,
  // LOP is already reflected in Gross Pay and is NOT deducted a second time from Gross Pay!
  const dailySalaryDec = calendarDays > 0
    ? new Decimal(input.monthlySalary).dividedBy(calendarDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const lopAmountDec = isCeo || lopDays <= 0 || calendarDays <= 0
    ? new Decimal(0)
    : new Decimal(input.monthlySalary).times(lopDays).dividedBy(calendarDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 9. Advance Loan Recovery & Other Deductions
  const advanceRecovery = new Decimal(input.deductions?.advanceRecovery ?? 0);
  const loanRecovery = new Decimal(input.deductions?.loanRecovery ?? 0);
  const otherDeductions = new Decimal(input.deductions?.otherDeductions ?? 0);

  // Evaluate custom eligible deductions
  let customDeductionsSum = new Decimal(0);
  const customDeductionsBreakdown: CalculationBreakdownItem[] = [];

  const statutoryCodes = new Set(['PF', 'EPF', 'ERF', 'ESIC', 'ESI', 'PT', 'PROFESSIONAL_TAX']);

  for (const comp of configured) {
    if (comp.type !== 'DEDUCTION' || !comp.active) continue;
    const code = (comp.code || '').toUpperCase().trim();
    if (statutoryCodes.has(code) && comp.isStatutory) continue;

    if (isComponentEligible(comp, eligibilityCtx)) {
      let amount = new Decimal(0);
      if (comp.calculationMethod === 'FIXED_AMOUNT') {
        amount = new Decimal(comp.defaultValue || 0);
      } else if (comp.calculationMethod === 'PERCENTAGE') {
        const baseVal = comp.percentageBase === 'BASIC'
          ? basic
          : (comp.percentageBase === 'CTC' ? new Decimal(input.monthlySalary) : grossSalary);
        amount = baseVal.times(comp.defaultValue || 0).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (comp.calculationMethod === 'ATTENDANCE_OT') {
        amount = otAmount;
      } else if (comp.calculationMethod === 'FORMULA' && comp.formula) {
        amount = new Decimal(evaluateFormula(comp.formula, formulaCtx)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
      if (code) {
        formulaCtx[code] = amount.toNumber();
      }
      if (amount.greaterThan(0)) {
        customDeductionsSum = customDeductionsSum.plus(amount);
        customDeductionsBreakdown.push({
          name: comp.name,
          category: 'DEDUCTION',
          amount: amount.toNumber(),
          description: comp.calculationMethod === 'PERCENTAGE'
            ? `${comp.defaultValue}% of ${comp.percentageBase || 'GROSS'}`
            : comp.calculationMethod === 'FORMULA'
              ? `Formula: ${comp.formula}`
              : `Fixed ₹${comp.defaultValue}`
        });
      }
    }
  }

  // Total Deductions = PF + ESIC + PT + Advance + Loan + Other + Custom Deductions
  // (LOP is already reflected via Calendar Day proration of Gross Salary: Gross = Monthly Gross * Paid Days / Calendar Days)
  const totalDeductions = pfResult.pfAmount
    .plus(esicResult.esicAmount)
    .plus(ptAmount)
    .plus(advanceRecovery)
    .plus(loanRecovery)
    .plus(otherDeductions)
    .plus(customDeductionsSum)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Final Net Salary = Gross Earnings - Total Deductions
  const netSalary = Decimal.max(0, grossSalary.minus(totalDeductions)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Breakdown items for transparency & UI
  const paidDescSuffix = `Paid ${paidDays}/${calendarDays} days`;
  const earningsBreakdown: CalculationBreakdownItem[] = [
    { name: 'Basic Salary', category: 'EARNING', amount: basic.toNumber(), description: `${input.basicPercentage}% of CTC | ${paidDescSuffix}` },
    { name: 'Dearness Allowance (DA)', category: 'EARNING', amount: da.toNumber(), description: `${input.daPercentage}% of CTC | ${paidDescSuffix}` },
    { name: 'Conveyance Allowance', category: 'EARNING', amount: conveyance.toNumber(), description: `${input.conveyancePercentage}% of CTC | ${paidDescSuffix}` },
    { name: 'House Rent Allowance (HRA)', category: 'EARNING', amount: hra.toNumber(), description: `${input.hraPercentage}% of CTC | ${paidDescSuffix}` },
  ];

  if (attBonus.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Attendance Bonus', category: 'EARNING', amount: attBonus.toNumber() });
  }
  if (otAmount.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Approved Overtime', category: 'EARNING', amount: otAmount.toNumber(), description: `${otHours.toString()} hrs @ ₹${otRate.toString()}/hr` });
  }
  if (bonus.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Bonus', category: 'EARNING', amount: bonus.toNumber() });
  }
  if (incentive.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Performance Incentive', category: 'EARNING', amount: incentive.toNumber() });
  }
  if (commission.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Sales Commission', category: 'EARNING', amount: commission.toNumber() });
  }
  if (otherEarnings.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Other Earnings', category: 'EARNING', amount: otherEarnings.toNumber() });
  }

  // Append custom eligible earnings to breakdown
  earningsBreakdown.push(...customEarningsBreakdown);

  const deductionsBreakdown: CalculationBreakdownItem[] = [];

  if (pfResult.pfAmount.greaterThan(0)) {
    deductionsBreakdown.push({
      name: 'Provident Fund (EPF)',
      category: 'DEDUCTION',
      amount: pfResult.pfAmount.toNumber(),
      description: `${pfResult.pfRateApplied.toString()}% on Base ₹${pfResult.pfBase.toString()}`,
    });
  }

  if (esicResult.esicAmount.greaterThan(0)) {
    deductionsBreakdown.push({
      name: 'ESIC Employee Contribution',
      category: 'DEDUCTION',
      amount: esicResult.esicAmount.toNumber(),
      description: `${esicResult.esicRateApplied.toString()}% on Base ₹${esicResult.esicBase.toString()}`,
    });
  }

  if (ptAmount.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Professional Tax (PT)', category: 'DEDUCTION', amount: ptAmount.toNumber() });
  }

  if (advanceRecovery.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Advance Salary Recovery', category: 'DEDUCTION', amount: advanceRecovery.toNumber() });
  }

  if (loanRecovery.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Loan Recovery (EMI)', category: 'DEDUCTION', amount: loanRecovery.toNumber() });
  }

  if (otherDeductions.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Other Deductions', category: 'DEDUCTION', amount: otherDeductions.toNumber() });
  }

  // Append custom eligible deductions to breakdown
  deductionsBreakdown.push(...customDeductionsBreakdown);

  return {
    employeeId: input.employeeId,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
    withPf: isPfEligible,

    monthlySalary: structure.monthlySalary,
    basicSalary: basic.toNumber(),
    da: da.toNumber(),
    conveyance: conveyance.toNumber(),
    hra: hra.toNumber(),
    fixedGross: fixedGross.toNumber(),

    attendanceBonus: attBonus.toNumber(),
    overtimeHours: otHours.toNumber(),
    overtimeRate: otRate.toNumber(),
    overtimeAmount: otAmount.toNumber(),
    bonus: bonus.toNumber(),
    incentive: incentive.toNumber(),
    commission: commission.toNumber(),
    otherEarnings: otherEarnings.toNumber(),
    grossSalary: grossSalary.toNumber(),

    pfBase: pfResult.pfBase.toNumber(),
    pfRate: pfResult.pfRateApplied.toNumber(),
    pfAmount: pfResult.pfAmount.toNumber(),
    employerPfRate: employerPfRate.toNumber(),
    employerPfAmount: employerPfAmount.toNumber(),

    esicBase: esicResult.esicBase.toNumber(),
    esicRate: esicResult.esicRateApplied.toNumber(),
    esicAmount: esicResult.esicAmount.toNumber(),
    employerEsicRate: esicResult.employerEsicRateApplied.toNumber(),
    employerEsicAmount: esicResult.employerEsicAmount.toNumber(),
    esicCovered: esicResult.esicCovered,
    otVariableAmount: otAmount.toNumber(),

    professionalTax: ptAmount.toNumber(),

    calendarDays,
    calendarDaysInMonth: calendarDays,
    eligibleDays,
    workingDays: scheduledWorkingDays,
    scheduledWorkingDays,
    salaryDivisorUsed: resolvedDivisor.divisorDays,
    salaryDivisorMode: resolvedDivisor.modeUsed,
    presentDays,
    paidWeekOffDays,
    paidHolidayDays,
    overlappingHolidayDays: calBreakdown.overlappingHolidayDays,
    paidLeaveDays,
    lopDays,
    paidDays,
    totalPaidDays: paidDays,
    pendingAttendanceDays: calBreakdown.pendingAttendanceDays,
    dailySalary: dailySalaryDec.toNumber(),
    lopAmount: lopAmountDec.toNumber(),

    advanceRecovery: advanceRecovery.toNumber(),
    loanRecovery: loanRecovery.toNumber(),
    otherDeductions: otherDeductions.toNumber(),

    totalDeductions: totalDeductions.toNumber(),
    netSalary: netSalary.toNumber(),

    earningsBreakdown,
    deductionsBreakdown,
  };
};
