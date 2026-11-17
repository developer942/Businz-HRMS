// VRM Enterprise HRMS - Attendance & Overtime Calculation Engine
// Strictly computes worked hours, break deductions, potential/approved OT, late/early flags, salary impact & monthly summaries

import { AttendanceRecord, Employee } from '../types/hrms';
import { isOwnerOrCEO } from '../data/hrmsInitialData';
import {
  ShiftModel,
  OvertimePolicy,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  AttendancePolicyConfig,
  SalaryImpactSummary,
  MonthlyAttendanceSummary,
  OvertimeRequest,
  OvertimeMultiplierType,
  OtRateType,
  OtWageBaseMode,
  OtSalaryDivisorMode
} from '../types/attendanceEnterprise';
import { PayrollSettingsConfig } from '../types/settings';

/**
 * Parses time string (e.g. "09:00 AM", "07:15 PM", "09:30", "18:45") into total minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  let clean = timeStr.trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === 'N/A' || clean === '—') return null;

  // Normalize potential typing mistakes like 10;30 AM or 10.00 AM
  clean = clean.replace(/^(\d{1,2})[;.](\d{2})/, '$1:$2');

  // Handle full ISO datetime string (e.g. 2026-10-06T12:48:30.277+00:00)
  if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
    let parsed: Date;
    if (clean.endsWith('Z') || clean.includes('+') || /-[0-9]{2}:?[0-9]{2}$/.test(clean)) {
      parsed = new Date(clean);
    } else {
      parsed = new Date(clean.includes('T') ? (clean.endsWith('Z') ? clean : clean + 'Z') : clean.replace(/\s+/, 'T') + 'Z');
    }
    if (!isNaN(parsed.getTime())) {
      const istStr = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = istStr.split(':').map(Number);
      let h = parts[0];
      if (h === 24) h = 0;
      return h * 60 + parts[1];
    }
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridian = match[3]?.toUpperCase();

  if (meridian) {
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Formats decimal hours (e.g. 10.08) into standard enterprise display: "10h 05m"
 */
export function formatHoursAndMinutes(hoursVal: number): string {
  if (!hoursVal || isNaN(hoursVal) || hoursVal <= 0) return '0h 00m';
  const totalMinutes = Math.round(hoursVal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Checks whether a department is eligible for Overtime by default when not explicitly configured.
 * Requirement 2 & 3: FLOOR and Dispatch Loading are eligible by default; other departments
 * remain restricted from automatic overtime approval unless enabled by HR/CEO or employee exception.
 */
export function isDefaultOtEligibleDepartment(department?: string | null): boolean {
  if (!department) return false;
  const norm = department.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    norm === 'floor' ||
    norm === 'dispatch loading' ||
    norm === 'production floor'
  );
}

/**
 * Normalizes month string/number (1..12, 'January', 'Jan', '2026-02') into 1-based month number (1..12).
 */
export function parseMonthAndYear(monthInput?: string | number, fallbackYear?: number): { monthNum: number; resolvedYear?: number } {
  if (typeof monthInput === 'number' && monthInput >= 1 && monthInput <= 12) {
    return { monthNum: Math.floor(monthInput), resolvedYear: fallbackYear };
  }
  const clean = String(monthInput || '').trim();
  if (/^\d{4}-\d{2}/.test(clean)) {
    const [y, m] = clean.slice(0, 7).split('-').map(Number);
    if (m >= 1 && m <= 12) return { monthNum: m, resolvedYear: y || fallbackYear };
  }
  const num = Number(clean);
  if (Number.isFinite(num) && num >= 1 && num <= 12) {
    return { monthNum: Math.floor(num), resolvedYear: fallbackYear };
  }
  const lower = clean.toLowerCase();
  const months = [
    ['january', 'jan'],
    ['february', 'feb'],
    ['march', 'mar'],
    ['april', 'apr'],
    ['may', 'may'],
    ['june', 'jun'],
    ['july', 'jul'],
    ['august', 'aug'],
    ['september', 'sep', 'sept'],
    ['october', 'oct'],
    ['november', 'nov'],
    ['december', 'dec']
  ];
  for (let i = 0; i < months.length; i++) {
    if (months[i].some(alias => lower === alias || lower.startsWith(alias))) {
      return { monthNum: i + 1, resolvedYear: fallbackYear };
    }
  }
  return { monthNum: 8, resolvedYear: fallbackYear };
}

export function resolveMonthNumber(monthInput?: string | number, fallbackYear?: number): number {
  return parseMonthAndYear(monthInput, fallbackYear).monthNum;
}

/**
 * Requirement 4: Automatically determines whether the selected payroll month contains 28, 29, 30 or 31 days.
 * Accurately handles leap years (e.g. February 2024 & 2028 = 29 days; February 2025 & 2026 = 28 days).
 */
export function getCalendarDaysInMonth(month: string | number, year: number): 28 | 29 | 30 | 31 {
  const { monthNum, resolvedYear } = parseMonthAndYear(month, year);
  const targetYear = resolvedYear || year || new Date().getFullYear();
  const days = new Date(targetYear, monthNum, 0).getDate();
  if (days === 28 || days === 29 || days === 30 || days === 31) {
    return days;
  }
  return 30;
}

/**
 * Counts standard weekly off days (Sundays by default) in a given calendar month.
 */
export function countWeeklyOffDaysInMonth(month: string | number, year: number, weeklyOffDayIndex = 0): number {
  const { monthNum, resolvedYear } = parseMonthAndYear(month, year);
  const targetYear = resolvedYear || year || new Date().getFullYear();
  const totalDays = getCalendarDaysInMonth(monthNum, targetYear);
  let offCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(targetYear, monthNum - 1, d).getDay() === weeklyOffDayIndex) {
      offCount++;
    }
  }
  return offCount;
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

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(Number(isoMatch[2])).padStart(2, '0');
    const d = String(Number(isoMatch[3])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

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

export interface CalendarDayPayrollBreakdown {
  calendarDays: 28 | 29 | 30 | 31;
  eligibleDays: number;
  unemployedDays: number;
  scheduledWorkingDays: number;
  workingDays: number;
  presentDays: number;
  actualPunchedDays: number;
  pendingAttendanceDays: number;
  paidWeekOffDays: number;
  paidHolidayDays: number;
  overlappingHolidayDays: number;
  paidLeaveDays: number;
  lopDays: number;
  sandwichLopDays: number;
  sandwichUnpaidDays?: number;
  paidDays: number;
  totalPaidDays: number;
  activeStartDate: string;
  activeEndDate: string;
  prorationFactor: number;
  isFullMonthEligible: boolean;
}

export interface CalendarDayPayrollParams {
  month: string | number;
  year: number;
  employeeId?: string;
  department?: string;
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
  explicitLopDays?: number;
  explicitPaidLeaveDays?: number;
  explicitUnpaidLeaveDays?: number;
  explicitAbsentDays?: number;
  explicitHalfDays?: number;
  explicitPresentDays?: number;
}

/**
 * Shared Calendar Day Based Payroll Attendance & Payable Days Engine.
 */
export function calculateCalendarDayPayrollAttendance(params: CalendarDayPayrollParams): CalendarDayPayrollBreakdown {
  const { monthNum, resolvedYear } = parseMonthAndYear(params.month, params.year);
  const yearNum = resolvedYear || Number(params.year) || new Date().getFullYear();
  const calendarDays = getCalendarDaysInMonth(monthNum, yearNum);

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

  const monthAttMap = new Map<string, any>();
  if (Array.isArray(params.attendanceRecords)) {
    for (const rec of params.attendanceRecords) {
      if (!rec) continue;
      if (empIdNorm) {
        const recEmp = String(rec.employeeId || rec.employee_id || '').trim().toLowerCase();
        if (recEmp && recEmp !== empIdNorm) continue;
      }
      const dIso = normalizeDateToISO(rec.date || rec.shiftDate || rec.shift_date);
      if (!dIso || dIso < monthStartStr || dIso > monthEndStr) continue;
      monthAttMap.set(dIso, rec);
    }
  }

  const approvedLeavesInMonth: any[] = [];
  const explicitSandwichUnpaidDates = new Set<string>();
  const leaveDatesInRequestRange = new Map<string, { isUnpaid: boolean; isHalfDay: boolean; isWfh: boolean }>();

  if (Array.isArray(params.leaveRequests)) {
    for (const lr of params.leaveRequests) {
      if (!lr) continue;
      const statusNorm = String(lr.status || '').trim().toLowerCase();
      if (statusNorm !== 'approved') continue;
      if (empIdNorm) {
        const lrEmp = String(lr.employeeId || lr.employee_id || '').trim().toLowerCase();
        if (lrEmp && lrEmp !== empIdNorm) continue;
      }
      const sIso = normalizeDateToISO(lr.startDate || lr.start_date);
      const eIso = normalizeDateToISO(lr.endDate || lr.end_date || sIso);
      if (!sIso || !eIso) continue;
      if (eIso < monthStartStr || sIso > monthEndStr) continue;

      approvedLeavesInMonth.push({ ...lr, sIso, eIso });

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

  const hasDailyRecords = monthAttMap.size > 0 || approvedLeavesInMonth.length > 0;
  let actualPunchedDays = 0;
  let pendingAttendanceDays = 0;

  for (const dayObj of dayList) {
    if (!dayObj.isEligible || !dayObj.isScheduledWorkingDay) continue;

    const leaveInfo = leaveDatesInRequestRange.get(dayObj.dateStr);
    const att = monthAttMap.get(dayObj.dateStr);

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
        const attStatus = String(att?.status || '').trim().toLowerCase();
        if (attStatus === 'absent' && lopEnabled) {
          dayObj.dayLop += 0.5;
          dayObj.isUnpaidLeaveOrAbsence = true;
        } else {
          dayObj.dayPresent = 0.5;
          if (att) actualPunchedDays += 0.5;
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
      const rawCheckIn = att.checkIn ?? att.check_in;
      const rawCheckOut = att.checkOut ?? att.check_out;
      const hasCompletedOut =
        Boolean(rawCheckOut) &&
        String(rawCheckOut).trim() !== '' &&
        String(rawCheckOut).trim() !== '--:--' &&
        !String(rawCheckOut).toLowerCase().includes('progress');
      let workedHrsForDay = 0;
      if (hasCompletedOut && rawCheckIn) {
        const inM = parseTimeToMinutes(String(rawCheckIn));
        const outM = parseTimeToMinutes(String(rawCheckOut));
        if (inM !== null && outM !== null) {
          let diff = outM - inM;
          if (diff < 0) diff += 24 * 60;
          workedHrsForDay = diff / 60;
        }
      }
      if (workedHrsForDay <= 0 && (!rawCheckOut || hasCompletedOut)) {
        const numWh = Number(att.workingHours ?? att.working_hours ?? 0);
        if (Number.isFinite(numWh) && numWh > 0) {
          workedHrsForDay = numWh;
        }
      }
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
        statusNorm === 'on duty'
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
    } else {
      dayObj.dayPresent = 1;
    }
  }

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

  if (lopEnabled && rawExplicitLop > lopDays) {
    const targetLop = Math.min(eligibleDays, rawExplicitLop);
    const additionalLop = targetLop - lopDays;
    lopDays = targetLop;

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

  presentDays = Math.round(presentDays * 100) / 100;
  paidLeaveDays = Math.round(paidLeaveDays * 100) / 100;
  lopDays = lopEnabled ? Math.round(lopDays * 100) / 100 : 0;
  paidWeekOffDays = Math.round(paidWeekOffDays * 100) / 100;
  paidHolidayDays = Math.round(paidHolidayDays * 100) / 100;

  const paidDays = Math.max(0, Math.round((eligibleDays - lopDays) * 100) / 100);
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
 * Requirement 5: Resolves the configured salary divisor for payroll and overtime calculations.
 * Does NOT assume that every company uses actual calendar days.
 */
export function resolvePayrollSalaryDivisor(params: {
  month: string | number;
  year: number;
  payrollConfig?: Pick<PayrollSettingsConfig, 'standardWorkingDaysPerMonth' | 'salaryDivisorMode'> | null;
  overtimePolicy?: OvertimePolicy | null;
  divisorModeOverride?: OtSalaryDivisorMode | 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  divisorMode?: OtSalaryDivisorMode | 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  customDivisorDays?: number;
  fixedDivisorDays?: number;
  weeklyOffDaysCount?: number;
  weeklyOffDayIndex?: number;
}): {
  calendarDaysInMonth: 28 | 29 | 30 | 31;
  calendarDays: 28 | 29 | 30 | 31;
  divisor: number;
  divisorDays: number;
  divisorMode: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  modeUsed: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  label: string;
} {
  const {
    month,
    year,
    payrollConfig,
    overtimePolicy,
    divisorModeOverride,
    divisorMode,
    customDivisorDays,
    fixedDivisorDays,
    weeklyOffDaysCount,
    weeklyOffDayIndex
  } = params;

  const calendarDaysInMonth = getCalendarDaysInMonth(month, year);
  const configuredFixedDays = fixedDivisorDays && fixedDivisorDays > 0
    ? fixedDivisorDays
    : (payrollConfig?.standardWorkingDaysPerMonth && payrollConfig.standardWorkingDaysPerMonth > 0
      ? payrollConfig.standardWorkingDaysPerMonth
      : (overtimePolicy?.customDivisorDays && overtimePolicy.customDivisorDays > 0 ? overtimePolicy.customDivisorDays : 26));

  const rawOverride = divisorModeOverride || divisorMode || overtimePolicy?.divisorMode;
  const effectiveMode = rawOverride && rawOverride !== 'COMPANY_DIVISOR'
    ? rawOverride
    : (payrollConfig?.salaryDivisorMode || 'FIXED_DAYS');

  const buildResult = (
    divisorVal: number,
    modeVal: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS',
    labelVal: string
  ) => ({
    calendarDaysInMonth,
    calendarDays: calendarDaysInMonth,
    divisor: divisorVal,
    divisorDays: divisorVal,
    divisorMode: modeVal,
    modeUsed: modeVal,
    label: labelVal
  });

  if (effectiveMode === 'CALENDAR_DAYS') {
    return buildResult(calendarDaysInMonth, 'CALENDAR_DAYS', `Actual Calendar Days (${calendarDaysInMonth} days)`);
  }

  if (effectiveMode === 'WORKING_DAYS') {
    const offs = weeklyOffDaysCount !== undefined
      ? weeklyOffDaysCount
      : countWeeklyOffDaysInMonth(month, year, weeklyOffDayIndex ?? 0);
    const workingDivisor = Math.max(1, calendarDaysInMonth - offs);
    return buildResult(
      workingDivisor,
      'WORKING_DAYS',
      `Working Days (${workingDivisor} days = ${calendarDaysInMonth} cal - ${offs} week-offs)`
    );
  }

  if (effectiveMode === 'FIXED_26' || effectiveMode === 'STATUTORY_DIVISOR') {
    const statDays = customDivisorDays && customDivisorDays > 0 ? customDivisorDays : 26;
    return buildResult(
      effectiveMode === 'STATUTORY_DIVISOR' ? statDays : 26,
      'FIXED_DAYS',
      effectiveMode === 'STATUTORY_DIVISOR' ? `Statutory Divisor (${statDays} days)` : 'Fixed 26 Days'
    );
  }

  if (effectiveMode === 'FIXED_30') {
    return buildResult(30, 'FIXED_DAYS', 'Fixed 30 Days');
  }

  const effectiveCustomDays = customDivisorDays || fixedDivisorDays || overtimePolicy?.customDivisorDays;
  if (effectiveMode === 'CUSTOM_DAYS' && effectiveCustomDays && effectiveCustomDays > 0) {
    return buildResult(effectiveCustomDays, 'FIXED_DAYS', `Custom Divisor (${effectiveCustomDays} days)`);
  }

  return buildResult(configuredFixedDays, 'FIXED_DAYS', `Configured Divisor (${configuredFixedDays} days)`);
}

/**
 * Requirement 13: Resolves an employee's department as of a specific attendance date,
 * supporting mid-month or backdated employee department transfers.
 */
export function resolveEmployeeDepartmentForDate(
  empOrCurrentDepartment: string | { department?: string; departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[] },
  attendanceDate?: string,
  departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[]
): string {
  const currentDepartment =
    typeof empOrCurrentDepartment === 'string'
      ? empOrCurrentDepartment
      : (empOrCurrentDepartment?.department || 'General');
  const historyList =
    departmentHistory ||
    (typeof empOrCurrentDepartment === 'object' && empOrCurrentDepartment !== null
      ? empOrCurrentDepartment.departmentHistory
      : undefined);

  if (!attendanceDate || !Array.isArray(historyList) || historyList.length === 0) {
    return currentDepartment;
  }
  const targetIso = String(attendanceDate).slice(0, 10);
  const sorted = [...historyList].sort((a, b) =>
    String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || ''))
  );
  const matched = sorted.find(entry => {
    const start = String(entry.effectiveFrom || '').slice(0, 10);
    const end = entry.effectiveTo ? String(entry.effectiveTo).slice(0, 10) : '';
    if (start && targetIso < start) return false;
    if (end && targetIso > end) return false;
    return true;
  });
  return matched?.department || matched?.departmentName || currentDepartment;
}

/**
 * Helper to check if an effective-dated policy applies on a given date (YYYY-MM-DD).
 */
export function isPolicyEffectiveOnDate(
  policy: { effectiveFrom?: string; effectiveTo?: string },
  targetDate?: string
): boolean {
  if (!targetDate) return true;
  const iso = String(targetDate).slice(0, 10);
  if (policy.effectiveFrom && iso < String(policy.effectiveFrom).slice(0, 10)) {
    return false;
  }
  if (policy.effectiveTo && iso > String(policy.effectiveTo).slice(0, 10)) {
    return false;
  }
  return true;
}

/**
 * Resolves an employee's Overtime Eligibility taking into account:
 * 1. Individual Exception ('Follow Department Policy' | 'Allow OT' | 'Block OT')
 * 2. Statutory Entitlement (empPolicy.statutoryEntitlement or options.statutoryEntitlement)
 * 3. Effective-dated Department-level policy (with historical department lookup on attendanceDate)
 * 4. Default company rule: FLOOR and Dispatch Loading eligible; other departments restricted unless enabled.
 */
export interface ResolvedOtEligibilityResult {
  isEligible: boolean;
  allowed: boolean;
  eligible: boolean;
  reason: string;
  maxDailyOt: number;
  maxMonthlyOt: number;
  minOtDurationMinutes: number;
  standardShiftHours: number;
  otHourlyRate: number;
  wageBase: OtWageBaseMode;
  divisorMode: OtSalaryDivisorMode;
  defaultMultiplier: OvertimeMultiplierType;
  resolvedDepartment: string;
  departmentName: string;
  source: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked';
  eligibilitySource: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked';
}

export function resolveEmployeeOtEligibility(
  empOrIdOrParams:
    | string
    | {
        id?: string;
        employeeId?: string;
        department?: string;
        departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
        statutoryOtEntitled?: boolean;
        employee?: {
          id?: string;
          employeeId?: string;
          department?: string;
          departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
          statutoryOtEntitled?: boolean;
        };
        departmentName?: string;
        dateStr?: string;
        departmentOtPolicies?: DepartmentOtPolicy[];
        employeeOtPolicies?: EmployeeOtPolicy[];
        overtimePolicy?: OvertimePolicy;
      },
  departmentOrDeptPolicies?: string | DepartmentOtPolicy[],
  deptPoliciesOrEmpPolicies?: DepartmentOtPolicy[] | EmployeeOtPolicy[],
  empPoliciesOrOtPolicy?: EmployeeOtPolicy[] | OvertimePolicy,
  optionsOrDateStr?:
    | string
    | {
        attendanceDate?: string;
        departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
        statutoryEntitlement?: boolean;
        overtimePolicy?: OvertimePolicy;
        companyId?: string;
        branchId?: string;
      }
): ResolvedOtEligibilityResult {
  let employeeId = '';
  let department = 'General';
  let deptPolicies: DepartmentOtPolicy[] = [];
  let empPolicies: EmployeeOtPolicy[] = [];
  let attendanceDate: string | undefined;
  let departmentHistory: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[] | undefined;
  let statutoryEntitlement: boolean | undefined;
  let resolvedOtPolicy: OvertimePolicy | undefined;
  let companyId: string | undefined;
  let branchId: string | undefined;

  if (typeof empOrIdOrParams === 'string') {
    employeeId = empOrIdOrParams;
    department = typeof departmentOrDeptPolicies === 'string' ? departmentOrDeptPolicies : 'General';
    deptPolicies = Array.isArray(deptPoliciesOrEmpPolicies) ? (deptPoliciesOrEmpPolicies as DepartmentOtPolicy[]) : [];
    empPolicies = Array.isArray(empPoliciesOrOtPolicy) ? (empPoliciesOrOtPolicy as EmployeeOtPolicy[]) : [];
    if (empPoliciesOrOtPolicy && !Array.isArray(empPoliciesOrOtPolicy) && typeof empPoliciesOrOtPolicy === 'object') {
      resolvedOtPolicy = empPoliciesOrOtPolicy as OvertimePolicy;
    }
    if (typeof optionsOrDateStr === 'string') {
      attendanceDate = optionsOrDateStr;
    } else if (optionsOrDateStr) {
      attendanceDate = optionsOrDateStr.attendanceDate;
      departmentHistory = optionsOrDateStr.departmentHistory;
      statutoryEntitlement = optionsOrDateStr.statutoryEntitlement;
      if (optionsOrDateStr.overtimePolicy) resolvedOtPolicy = optionsOrDateStr.overtimePolicy;
      companyId = optionsOrDateStr.companyId;
      branchId = optionsOrDateStr.branchId;
    }
  } else if (empOrIdOrParams && ('departmentOtPolicies' in empOrIdOrParams || 'dateStr' in empOrIdOrParams || 'employee' in empOrIdOrParams)) {
    const innerEmp = empOrIdOrParams.employee || empOrIdOrParams;
    employeeId = innerEmp.employeeId || innerEmp.id || '';
    department = empOrIdOrParams.departmentName || innerEmp.department || 'General';
    deptPolicies = empOrIdOrParams.departmentOtPolicies || [];
    empPolicies = empOrIdOrParams.employeeOtPolicies || [];
    attendanceDate = empOrIdOrParams.dateStr;
    departmentHistory = innerEmp.departmentHistory;
    statutoryEntitlement = innerEmp.statutoryOtEntitled;
    resolvedOtPolicy = empOrIdOrParams.overtimePolicy;
    companyId = (innerEmp as any).companyId || (empOrIdOrParams as any).companyId;
    branchId = (innerEmp as any).branchId || (empOrIdOrParams as any).branchId;
  } else if (empOrIdOrParams) {
    employeeId = empOrIdOrParams.employeeId || empOrIdOrParams.id || '';
    department = empOrIdOrParams.department || 'General';
    departmentHistory = empOrIdOrParams.departmentHistory;
    statutoryEntitlement = empOrIdOrParams.statutoryOtEntitled;
    companyId = (empOrIdOrParams as any).companyId;
    branchId = (empOrIdOrParams as any).branchId;
    deptPolicies = Array.isArray(departmentOrDeptPolicies) ? departmentOrDeptPolicies : [];
    empPolicies = Array.isArray(deptPoliciesOrEmpPolicies) ? (deptPoliciesOrEmpPolicies as EmployeeOtPolicy[]) : [];
    if (empPoliciesOrOtPolicy && !Array.isArray(empPoliciesOrOtPolicy) && typeof empPoliciesOrOtPolicy === 'object') {
      resolvedOtPolicy = empPoliciesOrOtPolicy as OvertimePolicy;
    }
    if (typeof optionsOrDateStr === 'string') {
      attendanceDate = optionsOrDateStr;
    } else if (typeof empPoliciesOrOtPolicy === 'string') {
      attendanceDate = empPoliciesOrOtPolicy;
    } else if (optionsOrDateStr && typeof optionsOrDateStr === 'object') {
      attendanceDate = optionsOrDateStr.attendanceDate;
      if (optionsOrDateStr.departmentHistory) departmentHistory = optionsOrDateStr.departmentHistory;
      if (optionsOrDateStr.statutoryEntitlement !== undefined) statutoryEntitlement = optionsOrDateStr.statutoryEntitlement;
      if (optionsOrDateStr.overtimePolicy) resolvedOtPolicy = optionsOrDateStr.overtimePolicy;
      if (optionsOrDateStr.companyId) companyId = optionsOrDateStr.companyId;
      if (optionsOrDateStr.branchId) branchId = optionsOrDateStr.branchId;
    }
  }

  const resolvedDepartment = resolveEmployeeDepartmentForDate(
    department || 'General',
    attendanceDate,
    departmentHistory
  );

  const matchesCompanyScope = (policyItem: { companyId?: string; branchId?: string }) => {
    if (companyId && policyItem.companyId && policyItem.companyId.toLowerCase() !== companyId.toLowerCase()) {
      return false;
    }
    if (branchId && policyItem.branchId && policyItem.branchId.toLowerCase() !== branchId.toLowerCase()) {
      return false;
    }
    return true;
  };

  const matchingEmpPolicies = (empPolicies || [])
    .filter(p => p.employeeId && p.employeeId.trim().toLowerCase() === employeeId.trim().toLowerCase())
    .filter(matchesCompanyScope)
    .filter(p => isPolicyEffectiveOnDate(p, attendanceDate))
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
  const empPolicy = matchingEmpPolicies[0];

  const matchingDeptPolicies = (deptPolicies || [])
    .filter(p => {
      const dName = p.department || (p as any).departmentName || '';
      return dName.trim().toLowerCase() === resolvedDepartment.trim().toLowerCase();
    })
    .filter(matchesCompanyScope)
    .filter(p => isPolicyEffectiveOnDate(p, attendanceDate))
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
  const deptPolicy = matchingDeptPolicies[0];

  const normalizeOtAllowed = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  const policyMultiplierFallback: OvertimeMultiplierType =
    resolvedOtPolicy?.defaultMultiplier ||
    (resolvedOtPolicy?.regularMultiplier === 2 ? '2x Salary' : resolvedOtPolicy?.regularMultiplier === 1.5 ? '1.5x Salary' : '1x Salary');

  const baseShiftHours = resolvedOtPolicy?.defaultDailyPaidHours || deptPolicy?.standardShiftHours || 9;
  const baseHourlyRate = empPolicy?.customHourlyRate ?? deptPolicy?.otHourlyRate ?? resolvedOtPolicy?.fixedRatePerHour ?? 100;
  const baseWageBase: OtWageBaseMode = empPolicy?.customWageBase || resolvedOtPolicy?.wageBase || deptPolicy?.wageBase || 'FIXED_HOURLY';
  const baseDivisorMode: OtSalaryDivisorMode = resolvedOtPolicy?.divisorMode || deptPolicy?.divisorMode || 'COMPANY_DIVISOR';
  const baseMultiplier: OvertimeMultiplierType = empPolicy?.customMultiplier || resolvedOtPolicy?.defaultMultiplier || deptPolicy?.defaultMultiplier || policyMultiplierFallback;
  const baseMinMins = empPolicy?.minOtDurationMinutes ?? resolvedOtPolicy?.minimumOtDurationMinutes ?? deptPolicy?.minOtDurationMinutes ?? 30;

  const makeOut = (
    isElig: boolean,
    reasonText: string,
    maxD: number,
    maxM: number,
    src: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked'
  ): ResolvedOtEligibilityResult => ({
    isEligible: isElig,
    allowed: isElig,
    eligible: isElig,
    reason: reasonText,
    maxDailyOt: maxD,
    maxMonthlyOt: maxM,
    minOtDurationMinutes: baseMinMins,
    standardShiftHours: baseShiftHours,
    otHourlyRate: baseHourlyRate,
    wageBase: baseWageBase,
    divisorMode: baseDivisorMode,
    defaultMultiplier: baseMultiplier,
    resolvedDepartment,
    departmentName: resolvedDepartment,
    source: src,
    eligibilitySource: src
  });

  const effectiveException = empPolicy?.individualException || empPolicy?.individualOtException;

  const ceoCandidate =
    typeof empOrIdOrParams === 'object' && empOrIdOrParams !== null
      ? (empOrIdOrParams.employee || empOrIdOrParams)
      : { employeeId, department: resolvedDepartment };

  if (
    isOwnerOrCEO({
      ...(ceoCandidate as any),
      employeeId: employeeId || (ceoCandidate as any)?.employeeId,
      department: resolvedDepartment || (ceoCandidate as any)?.department,
    })
  ) {
    return makeOut(
      false,
      'CEO / Company Owner is exempt from attendance tracking and overtime eligibility',
      0,
      0,
      'Blocked'
    );
  }

  // 1. Check explicit Individual Block first
  if (empPolicy && effectiveException === 'Block OT') {
    return makeOut(false, 'Overtime blocked by Individual Employee Exception', 0, 0, 'Blocked');
  }

  // 2. Check Statutory Entitlement (Requirement 3)
  if (empPolicy?.statutoryEntitlement === true || statutoryEntitlement === true) {
    return makeOut(
      true,
      `Overtime eligible under Statutory Entitlement (${resolvedDepartment})`,
      empPolicy?.maxOtDaily || empPolicy?.customDailyMaxOt || deptPolicy?.maxOtHoursDaily || 4,
      empPolicy?.maxOtMonthly || empPolicy?.customMonthlyMaxOt || deptPolicy?.maxOtHoursMonthly || 60,
      'Statutory Entitlement'
    );
  }

  // 3. Check explicit Individual Allow Exception (Requirement 3)
  if (empPolicy && (effectiveException === 'Allow OT' || empPolicy.allowIndividualException === true)) {
    return makeOut(
      true,
      `Overtime granted by Individual Employee Exception (${resolvedDepartment})`,
      empPolicy.maxOtDaily || empPolicy.customDailyMaxOt || 4,
      empPolicy.maxOtMonthly || empPolicy.customMonthlyMaxOt || 60,
      'Individual Exception'
    );
  }

  // 4. Follow Department Policy
  if (deptPolicy) {
    const defaultForDept = isDefaultOtEligibleDepartment(resolvedDepartment);
    if (!normalizeOtAllowed((deptPolicy as any).otAllowed, defaultForDept)) {
      return makeOut(
        false,
        `Department (${resolvedDepartment}) is restricted from automatic overtime approval`,
        0,
        0,
        'Department Policy'
      );
    }
    return makeOut(
      true,
      `Eligible under ${resolvedDepartment} Department OT Policy`,
      deptPolicy.maxOtHoursDaily || 4,
      deptPolicy.maxOtHoursMonthly || 60,
      'Department Policy'
    );
  }

  // 5. Fallback default: Only FLOOR and Dispatch Loading are eligible by default;
  // other departments are restricted unless configured or overridden by employee policy.
  if (isDefaultOtEligibleDepartment(resolvedDepartment)) {
    return makeOut(
      true,
      `Eligible under ${resolvedDepartment} Department Default OT Policy`,
      4,
      60,
      'Department Policy'
    );
  }

  return makeOut(
    false,
    `Department (${resolvedDepartment}) is restricted from automatic overtime approval unless an employee-specific policy or statutory entitlement applies`,
    0,
    0,
    'Default'
  );
}

export interface AttendanceCalculationResult {
  grossMinutes: number;
  breakMinutes: number;
  netWorkedMinutes: number;
  workedHours: number;
  regularHours: number;
  potentialOtHours: number;
  lateMinutes: number;
  earlyCheckoutMinutes: number;
  status: AttendanceRecord['status'];
  lateStatus: 'On Time' | 'Late (<30m)' | 'Severely Late' | 'N/A';
}

/**
 * Computes exact working hours, shift comparisons, and potential OT.
 */
export function calculateAttendanceHoursAndStatus(params: {
  checkIn?: string | null;
  checkOut?: string | null;
  shift: ShiftModel;
  otPolicy?: OvertimePolicy;
  attendancePolicy?: AttendancePolicyConfig;
  isOtEligible: boolean;
  manualStatusOverride?: AttendanceRecord['status'];
}): AttendanceCalculationResult {
  const {
    checkIn,
    checkOut,
    shift,
    otPolicy,
    attendancePolicy,
    isOtEligible,
    manualStatusOverride
  } = params;

  const inMins = parseTimeToMinutes(checkIn);
  const outMins = parseTimeToMinutes(checkOut);
  const shiftStartMins = parseTimeToMinutes(shift.startTime) ?? 9 * 60; // 09:00 AM
  const shiftEndMins = parseTimeToMinutes(shift.endTime) ?? 18 * 60;    // 06:00 PM

  const graceMins = shift.gracePeriodMinutes ?? attendancePolicy?.gracePeriodMinutes ?? 10;
  const breakMins = shift.breakDurationMinutes ?? 60;
  const reqHours = shift.requiredWorkingHours ?? 9.0;
  const halfDayThreshold = attendancePolicy?.minWorkingHoursHalfDay ?? 4.5;

  // Case 1: Missing both punches
  if (inMins === null && outMins === null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Absent',
      lateStatus: 'N/A'
    };
  }

  // Case 2: Only Check-In present
  if (inMins !== null && outMins === null) {
    const lateMins = Math.max(0, inMins - (shiftStartMins + graceMins));
    const lateStatus = lateMins === 0 ? 'On Time' : lateMins <= 30 ? 'Late (<30m)' : 'Severely Late';
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: inMins > shiftStartMins ? inMins - shiftStartMins : 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus
    };
  }

  // Case 3: Only Check-Out present
  if (inMins === null && outMins !== null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus: 'N/A'
    };
  }

  // Case 4: Both Check-In and Check-Out present
  const checkoutTimelineMins = outMins! >= inMins! ? outMins! : outMins! + 24 * 60;
  const shiftEndTimelineMins = shiftEndMins >= shiftStartMins
    ? shiftEndMins
    : shiftEndMins + 24 * 60;
  const grossMins = checkoutTimelineMins - inMins!;
  
  // Deduct break only if worked duration exceeds standard half-shift
  const applicableBreakMins = grossMins > (breakMins + 120) ? breakMins : 0;
  const netMins = Math.max(0, grossMins - applicableBreakMins);
  const workedHours = Math.round((netMins / 60) * 100) / 100;

  // Late calculation
  const lateMinutes = inMins! > (shiftStartMins + graceMins) ? (inMins! - shiftStartMins) : 0;
  let lateStatus: AttendanceCalculationResult['lateStatus'] = 'On Time';
  if (lateMinutes > 0) {
    lateStatus = (inMins! - shiftStartMins) <= 30 ? 'Late (<30m)' : 'Severely Late';
  }

  // Early checkout calculation
  const earlyThreshold = shift.earlyCheckoutThresholdMinutes ?? 10;
  const earlyCheckoutMinutes = (checkoutTimelineMins < (shiftEndTimelineMins - earlyThreshold))
    ? (shiftEndTimelineMins - checkoutTimelineMins)
    : 0;

  // Potential OT calculation
  let potentialOtHours = 0;
  if (isOtEligible && otPolicy?.enabled !== false) {
    // OT Hours = Actual Eligible Working Hours - Required Working Hours
    const rawOtHours = Math.max(0, workedHours - reqHours);
    const minOtDurationMins = otPolicy?.minimumOtDurationMinutes ?? 30;
    const minOtHours = minOtDurationMins / 60;

    if (rawOtHours >= minOtHours) {
      const maxDaily = otPolicy?.maximumDailyOtHours ?? 4;
      potentialOtHours = Math.min(rawOtHours, maxDaily);
      potentialOtHours = Math.round(potentialOtHours * 100) / 100;
    }
  }

  const regularHours = Math.min(workedHours, reqHours);
  const grossHours = Math.round((grossMins / 60) * 100) / 100;

  // Status determination (Half Day if worked hours is less than 70% of shift working hours, e.g. < 6.3h / < 6h on a 9h shift)
  let status: AttendanceRecord['status'] = manualStatusOverride || 'Present';
  if (!manualStatusOverride || manualStatusOverride === 'Present' || manualStatusOverride === 'Late') {
    if ((grossHours > 0 && grossHours < reqHours * 0.7) || (workedHours < halfDayThreshold && workedHours > 0)) {
      status = 'Half Day';
    } else if (lateMinutes > 0) {
      status = 'Late';
    } else {
      status = 'Present';
    }
  }

  return {
    grossMinutes: grossMins,
    breakMinutes: applicableBreakMins,
    netWorkedMinutes: netMins,
    workedHours,
    regularHours,
    potentialOtHours,
    lateMinutes,
    earlyCheckoutMinutes,
    status,
    lateStatus
  };
}

/**
 * Computes OT Salary Rate & Payout according to configured OT Salary Policy
 */
export function calculateOtSalaryAmount(params: {
  otHours: number;
  dailySalary: number;
  standardWorkingHours: number;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): { hourlyRate: number; multiplier: number; otAmount: number } {
  const {
    otHours,
    dailySalary,
    standardWorkingHours,
    otPolicy,
    dayType = 'Regular'
  } = params;

  if (otHours <= 0) {
    return { hourlyRate: 0, multiplier: 1, otAmount: 0 };
  }

  const reqHours = standardWorkingHours > 0 ? standardWorkingHours : 9.0;
  let baseHourlyRate = 0;

  switch (otPolicy.rateMethod) {
    case 'Fixed Amount Per Hour':
      baseHourlyRate = otPolicy.fixedRatePerHour || 100;
      break;

    case 'Daily Salary Based':
      // Daily Salary ÷ Standard Working Hours = Hourly Rate
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Hourly Salary Based':
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Basic Salary Based':
      // Basic / 26 / Standard Working Hours
      baseHourlyRate = Math.round(((dailySalary * 26) / 26 / reqHours) * 100) / 100;
      break;

    case 'Percentage Based':
      const standardRate = dailySalary / reqHours;
      baseHourlyRate = Math.round((standardRate * ((otPolicy.fixedRatePerHour || 100) / 100)) * 100) / 100;
      break;

    default:
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
  }

  // Multipliers from Policy
  let multiplier = otPolicy.regularMultiplier || 1.0;
  if (dayType === 'Weekend') multiplier = otPolicy.weekendMultiplier || 1.5;
  if (dayType === 'Holiday') multiplier = otPolicy.holidayMultiplier || 2.0;

  const otAmount = Math.round(baseHourlyRate * otHours * multiplier * 100) / 100;

  return {
    hourlyRate: baseHourlyRate,
    multiplier,
    otAmount
  };
}

/**
 * Requirement 6 & 14: Shared Enterprise Overtime Calculation Engine.
 * Computes overtime hourly rate and amount from:
 * - applicable wage base ('FIXED_HOURLY' | 'BASIC' | 'GROSS' | 'CTC')
 * - configured salary divisor (e.g. 26, 30, or calendar days 28/29/30/31)
 * - daily paid hours (standardShiftHours, e.g. 9 or 8 hrs)
 * - approved overtime hours
 * - applicable multiplier ('1x Salary', '1.5x Salary', '2x Salary', 'Fixed Amount Per Hour', or numeric)
 */
export function calculateEnterpriseOvertimeRateAndAmount(params: {
  employee?: Employee | { id?: string; employeeId?: string; department?: string; basicSalary?: number; grossSalary?: number; monthlyCtc?: number; salaryDetails?: any; departmentHistory?: any[]; statutoryOtEntitled?: boolean } | null;
  approvedOtHours?: number;
  approvedHours?: number;
  wageBaseMode?: OtWageBaseMode;
  basicSalary?: number;
  grossSalary?: number;
  monthlyCtc?: number;
  fixedHourlyRate?: number;
  divisor?: number;
  divisorDays?: number;
  dailyPaidHours?: number;
  multiplier?: OvertimeMultiplierType | number | string;
  rateType?: OtRateType | OvertimeMultiplierType | string;
  month?: string | number;
  year?: number;
  dateStr?: string;
  payrollConfig?: PayrollSettingsConfig | null;
  overtimePolicy?: OvertimePolicy | null;
  departmentOtPolicies?: DepartmentOtPolicy[];
  employeeOtPolicies?: EmployeeOtPolicy[];
  statutoryMultiplier?: number;
  statutoryMinimumMultiplier?: number;
}): {
  wageBaseMode: OtWageBaseMode;
  wageBaseUsed: OtWageBaseMode;
  wageBaseAmount: number;
  baseSalaryAmount: number;
  divisor: number;
  divisorUsed: number;
  dailyPaidHours: number;
  dailyPaidHoursUsed: number;
  calendarDaysInMonth: number;
  baseHourlyRate: number;
  hourlyRate: number;
  effectiveHourlyRate: number;
  multiplierFactor: number;
  multiplierApplied: number;
  multiplierValue: number;
  overtimeAmount: number;
  calculatedAmount: number;
  formulaDescription: string;
} {
  const emp = params.employee;
  const elig = emp
    ? resolveEmployeeOtEligibility(
        emp,
        params.departmentOtPolicies || [],
        params.employeeOtPolicies || [],
        params.overtimePolicy || undefined,
        params.dateStr
      )
    : undefined;

  const refDate = params.dateStr || '';
  const refYear = params.year || (refDate.length >= 4 ? Number(refDate.slice(0, 4)) : 2026) || 2026;
  const refMonth = params.month || (refDate.length >= 7 ? Number(refDate.slice(5, 7)) : 8) || 8;

  const divInfo = resolvePayrollSalaryDivisor({
    month: refMonth,
    year: refYear,
    payrollConfig: params.payrollConfig,
    overtimePolicy: params.overtimePolicy,
    divisorModeOverride: elig?.divisorMode !== 'COMPANY_DIVISOR' ? elig?.divisorMode : params.overtimePolicy?.divisorMode
  });

  const safeDivisor =
    (params.divisor && params.divisor > 0)
      ? params.divisor
      : ((params.divisorDays && params.divisorDays > 0) ? params.divisorDays : divInfo.divisor);

  const safeDailyHours =
    (params.dailyPaidHours && params.dailyPaidHours > 0)
      ? params.dailyPaidHours
      : (elig?.standardShiftHours || params.overtimePolicy?.defaultDailyPaidHours || 9);

  const isCeoEmp = Boolean(emp && isOwnerOrCEO(emp as any));
  const safeOtHours = isCeoEmp
    ? 0
    : Math.max(
        0,
        Number(params.approvedOtHours ?? params.approvedHours ?? 0) || 0
      );

  const wageBaseMode: OtWageBaseMode =
    params.wageBaseMode ||
    elig?.wageBase ||
    params.overtimePolicy?.wageBase ||
    'FIXED_HOURLY';

  const rawMultiplier =
    params.multiplier ??
    params.rateType ??
    elig?.defaultMultiplier ??
    params.overtimePolicy?.defaultMultiplier ??
    params.overtimePolicy?.rateMethod ??
    '1x Salary';

  let multiplierFactor = 1.0;
  if (typeof rawMultiplier === 'number' && rawMultiplier > 0) {
    multiplierFactor = rawMultiplier;
  } else if (typeof rawMultiplier === 'string') {
    if (rawMultiplier === '2x Salary') multiplierFactor = 2.0;
    else if (rawMultiplier === '1.5x Salary') multiplierFactor = 1.5;
    else multiplierFactor = 1.0;
  }

  const statMin = Number(params.statutoryMultiplier ?? params.statutoryMinimumMultiplier ?? 0);
  if (statMin > multiplierFactor) {
    multiplierFactor = statMin;
  }

  const empBasic = Number(params.basicSalary ?? emp?.salaryDetails?.basicSalary ?? emp?.basicSalary ?? 0);
  const empCtc = Number(params.monthlyCtc ?? emp?.salaryDetails?.monthlyCtc ?? emp?.monthlyCtc ?? emp?.grossSalary ?? (empBasic > 0 ? Math.round(empBasic / 0.4) : 0));
  const empGross = Number(params.grossSalary ?? emp?.grossSalary ?? empCtc);
  const fixedHourlyRate = Number(params.fixedHourlyRate ?? elig?.otHourlyRate ?? params.overtimePolicy?.fixedRatePerHour ?? 100);

  let wageBaseAmount = 0;
  let rawBaseHourlyRate = 0;

  if (wageBaseMode === 'BASIC' && empBasic > 0) {
    wageBaseAmount = empBasic;
    rawBaseHourlyRate = (empBasic / safeDivisor) / safeDailyHours;
  } else if (wageBaseMode === 'GROSS' && empGross > 0) {
    wageBaseAmount = empGross;
    rawBaseHourlyRate = (empGross / safeDivisor) / safeDailyHours;
  } else if (wageBaseMode === 'CTC' && empCtc > 0) {
    wageBaseAmount = empCtc;
    rawBaseHourlyRate = (empCtc / safeDivisor) / safeDailyHours;
  } else {
    wageBaseAmount = fixedHourlyRate > 0 ? fixedHourlyRate : 100;
    rawBaseHourlyRate = wageBaseAmount;
  }

  const baseHourlyRate = Math.round((rawBaseHourlyRate + Number.EPSILON) * 100) / 100;
  const effectiveHourlyRate = Math.round((rawBaseHourlyRate * multiplierFactor + Number.EPSILON) * 100) / 100;
  const overtimeAmount = Math.round((rawBaseHourlyRate * safeOtHours * multiplierFactor + Number.EPSILON) * 100) / 100;

  const formulaDescription = wageBaseMode === 'FIXED_HOURLY'
    ? `${safeOtHours} hrs × ₹${baseHourlyRate}/hr × ${multiplierFactor}x = ₹${overtimeAmount}`
    : `${wageBaseMode} ₹${wageBaseAmount} ÷ ${safeDivisor} days ÷ ${safeDailyHours} hrs = ₹${baseHourlyRate}/hr × ${safeOtHours} hrs × ${multiplierFactor}x = ₹${overtimeAmount}`;

  return {
    wageBaseMode,
    wageBaseUsed: wageBaseMode,
    wageBaseAmount,
    baseSalaryAmount: wageBaseAmount,
    divisor: safeDivisor,
    divisorUsed: safeDivisor,
    dailyPaidHours: safeDailyHours,
    dailyPaidHoursUsed: safeDailyHours,
    calendarDaysInMonth: divInfo.calendarDaysInMonth,
    baseHourlyRate,
    hourlyRate: effectiveHourlyRate,
    effectiveHourlyRate,
    multiplierFactor,
    multiplierApplied: multiplierFactor,
    multiplierValue: multiplierFactor,
    overtimeAmount,
    calculatedAmount: overtimeAmount,
    formulaDescription
  };
}

/**
 * Requirement 7, 12, 13: Overtime Approval Workflow Pipeline
 * Attendance -> Identify Eligible Hours -> Department Policy -> Approval -> Payroll
 * Scans attendance records, identifies extra hours beyond standard shift hours,
 * evaluates department policy + employee-specific exception + effective dates + historical department,
 * prevents duplicates and locked-payroll modifications, and returns eligible vs restricted items.
 */
export function identifyEligibleOvertimeFromAttendance(params: {
  attendanceRecords?: AttendanceRecord[];
  attendanceRecord?: AttendanceRecord;
  employees?: Employee[];
  employee?: Employee;
  shifts?: any[];
  departmentOtPolicies: DepartmentOtPolicy[];
  employeeOtPolicies: EmployeeOtPolicy[];
  overtimePolicy?: OvertimePolicy;
  existingOvertimeRequests?: OvertimeRequest[];
  existingOtRequests?: OvertimeRequest[];
  payrollConfig?: PayrollSettingsConfig;
  lockedPayrollMonths?: Set<string> | { month: string | number; year: number }[];
  currentOpenPayrollMonth?: string | { month: string; year: number };
  currentOpenPayrollYear?: number;
  month?: string | number;
  year?: number;
  payrollMonth?: string | number;
  payrollYear?: number;
}): {
  eligibleNewRequests: OvertimeRequest[];
  newRequests: OvertimeRequest[];
  restrictedItems: {
    attendanceRecordId: string;
    employeeId: string;
    employeeName: string;
    department: string;
    date: string;
    extraHours: number;
    reason: string;
  }[];
  skippedRestricted: number;
  skippedDuplicates: number;
  skippedDuplicatesCount: number;
  eligible?: boolean;
  workedHours?: number;
  overtimeHours?: number;
  overtimeAmount?: number;
} {
  const attendanceRecords = params.attendanceRecords || (params.attendanceRecord ? [params.attendanceRecord] : []);
  const employees = params.employees || (params.employee ? [params.employee] : []);
  const {
    departmentOtPolicies = [],
    employeeOtPolicies = [],
    overtimePolicy,
    payrollConfig,
  } = params;

  const existingOvertimeRequests = params.existingOvertimeRequests || params.existingOtRequests || [];
  const openMonthStr =
    typeof params.currentOpenPayrollMonth === 'object' && params.currentOpenPayrollMonth !== null
      ? params.currentOpenPayrollMonth.month
      : (params.currentOpenPayrollMonth || (typeof params.month === 'string' ? params.month : 'August'));
  const openYearNum =
    typeof params.currentOpenPayrollMonth === 'object' && params.currentOpenPayrollMonth !== null
      ? params.currentOpenPayrollMonth.year
      : (params.currentOpenPayrollYear || params.year || 2026);

  const lockedSet = new Set<string>();
  if (params.lockedPayrollMonths instanceof Set) {
    params.lockedPayrollMonths.forEach(v => lockedSet.add(v));
  } else if (Array.isArray(params.lockedPayrollMonths)) {
    params.lockedPayrollMonths.forEach(item => {
      const mNum = resolveMonthNumber(item.month, item.year);
      lockedSet.add(`${item.year}-${String(mNum).padStart(2, '0')}`);
    });
  }

  const eligibleNewRequests: OvertimeRequest[] = [];
  const restrictedItems: {
    attendanceRecordId: string;
    employeeId: string;
    employeeName: string;
    department: string;
    date: string;
    extraHours: number;
    reason: string;
  }[] = [];
  let skippedDuplicatesCount = 0;

  for (const att of attendanceRecords) {
    if (!att || !att.date || !att.employeeId) continue;
    if (att.status === 'Absent' || att.status === 'On Leave') {
      continue;
    }

    const emp = employees.find(
      e => e.employeeId?.toLowerCase() === att.employeeId.toLowerCase() || e.id?.toLowerCase() === att.employeeId.toLowerCase()
    );

    if (
      isOwnerOrCEO({
        ...(emp as any),
        employeeId: att.employeeId,
        department: att.department || emp?.department,
      })
    ) {
      continue;
    }

    const elig = resolveEmployeeOtEligibility(
      att.employeeId,
      att.department || emp?.department || 'General',
      departmentOtPolicies,
      employeeOtPolicies,
      {
        attendanceDate: att.date,
        departmentHistory: emp?.departmentHistory,
        statutoryEntitlement: emp?.statutoryOtEntitled,
        overtimePolicy
      }
    );

    const shiftHours = elig.standardShiftHours || overtimePolicy?.defaultDailyPaidHours || 9;
    let workedHours = Number(att.workingHours ?? att.workHours) || 0;
    if (workedHours <= 0 && att.checkIn && att.checkOut) {
      const inMins = parseTimeToMinutes(att.checkIn);
      const outMins = parseTimeToMinutes(att.checkOut);
      if (inMins !== null && outMins !== null) {
        const grossMins = (outMins >= inMins ? outMins : outMins + 24 * 60) - inMins;
        const breakMins = Number((att as any).breakMinutes ?? (att as any).breakDurationMinutes ?? 60);
        const applicableBreak = grossMins > (breakMins + 120) ? breakMins : 0;
        workedHours = Math.round((Math.max(0, grossMins - applicableBreak) / 60) * 100) / 100;
      }
    }

    const isHolidayOrWeekOff = att.status === 'Holiday' || att.status === 'Week Off' || Boolean((att as any).isHoliday) || Boolean((att as any).isWeeklyOff);
    if (isHolidayOrWeekOff && workedHours <= 0 && !att.calculatedOtHours && !att.otHours) {
      continue;
    }

    const rawExtraHours = Math.max(
      0,
      isHolidayOrWeekOff
        ? workedHours
        : Math.round((workedHours - shiftHours) * 100) / 100,
      Number(att.calculatedOtHours) || 0,
      Number(att.otHours) || 0
    );

    const minOtHours = (elig.minOtDurationMinutes || overtimePolicy?.minimumOtDurationMinutes || 30) / 60;
    if (rawExtraHours < minOtHours) {
      continue;
    }

    // Check duplicate in existingOvertimeRequests
    const normDate = String(att.date).slice(0, 10);
    const hasExisting = existingOvertimeRequests.some(
      req =>
        req.employeeId.trim().toLowerCase() === att.employeeId.trim().toLowerCase() &&
        String(req.date).slice(0, 10) === normDate &&
        req.status !== 'Rejected'
    );
    if (hasExisting) {
      skippedDuplicatesCount++;
      continue;
    }

    if (!elig.isEligible) {
      restrictedItems.push({
        attendanceRecordId: att.id,
        employeeId: att.employeeId,
        employeeName: att.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : att.employeeId),
        department: elig.resolvedDepartment,
        date: normDate,
        extraHours: rawExtraHours,
        reason: elig.reason
      });
      continue;
    }

    const cappedExtraHours = Math.min(rawExtraHours, elig.maxDailyOt || overtimePolicy?.maximumDailyOtHours || 4);
    const [attYearStr, attMonthStr] = normDate.split('-');
    const attYear = Number(attYearStr) || openYearNum;
    const attMonthNum = Number(attMonthStr) || 8;

    const divisorInfo = resolvePayrollSalaryDivisor({
      month: attMonthNum,
      year: attYear,
      payrollConfig,
      divisorModeOverride: elig.divisorMode !== 'COMPANY_DIVISOR' ? elig.divisorMode : overtimePolicy?.divisorMode
    });

    const basicSalary = Number(emp?.salaryDetails?.basicSalary ?? emp?.basicSalary ?? 0);
    const monthlyCtc = Number(emp?.salaryDetails?.monthlyCtc ?? emp?.grossSalary ?? (basicSalary > 0 ? Math.round(basicSalary / 0.4) : 15000));
    const grossSalary = Number(emp?.grossSalary ?? monthlyCtc);

    const rateCalc = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: cappedExtraHours,
      wageBaseMode: elig.wageBase,
      basicSalary,
      grossSalary,
      monthlyCtc,
      fixedHourlyRate: elig.otHourlyRate,
      divisor: divisorInfo.divisor,
      dailyPaidHours: shiftHours,
      multiplier: elig.defaultMultiplier
    });

    const monthKey = `${attYear}-${String(attMonthNum).padStart(2, '0')}`;
    const isAttendanceMonthLocked = lockedSet.has(monthKey);

    eligibleNewRequests.push({
      id: `OTR-AUTO-${att.employeeId}-${normDate}`,
      attendanceRecordId: att.id,
      employeeId: att.employeeId,
      employeeName: att.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : att.employeeId),
      department: elig.resolvedDepartment,
      date: normDate,
      shiftName: att.shiftName || 'Standard Shift',
      shiftEnd: '06:00 PM',
      actualCheckOut: att.checkOut || '08:00 PM',
      potentialOtHours: rawExtraHours,
      requestedOtHours: cappedExtraHours,
      requestedHours: cappedExtraHours,
      approvedOtHours: 0,
      approvedHours: 0,
      otHours: cappedExtraHours,
      otAmount: rateCalc.overtimeAmount,
      reason: `Eligible overtime identified from attendance (${workedHours}h worked vs ${shiftHours}h standard shift)`,
      workDescription: rateCalc.formulaDescription,
      status: 'Pending Approval',
      source: 'Attendance Auto-Identified',
      multiplier: elig.defaultMultiplier,
      hourlyRate: rateCalc.baseHourlyRate,
      appliedRatePerHour: rateCalc.effectiveHourlyRate,
      calculatedAmount: rateCalc.overtimeAmount,
      submittedAt: normDate,
      wageBaseUsed: rateCalc.wageBaseMode,
      divisorUsed: rateCalc.divisor,
      dailyPaidHoursUsed: rateCalc.dailyPaidHours,
      calendarDaysInMonth: divisorInfo.calendarDaysInMonth,
      eligibilitySource: elig.source === 'Default' ? 'Department Policy' : elig.source,
      payrollStatus: 'Unprocessed',
      isLocked: false,
      isBackdatedArrear: isAttendanceMonthLocked,
      targetPayrollMonth: isAttendanceMonthLocked ? openMonthStr : undefined,
      targetPayrollYear: isAttendanceMonthLocked ? openYearNum : undefined
    });
  }

  const firstReq = eligibleNewRequests[0];
  let firstWorkedHours = 0;
  if (attendanceRecords[0]) {
    const a0 = attendanceRecords[0];
    firstWorkedHours = Number(a0.workingHours ?? a0.workHours) || 0;
    if (firstWorkedHours <= 0 && a0.checkIn && a0.checkOut) {
      const inM = parseTimeToMinutes(a0.checkIn);
      const outM = parseTimeToMinutes(a0.checkOut);
      if (inM !== null && outM !== null) {
        const gM = (outM >= inM ? outM : outM + 24 * 60) - inM;
        const bM = Number((a0 as any).breakMinutes ?? (a0 as any).breakDurationMinutes ?? 60);
        firstWorkedHours = Math.round((Math.max(0, gM - (gM > bM + 120 ? bM : 0)) / 60) * 100) / 100;
      }
    }
  }

  return {
    eligibleNewRequests,
    newRequests: eligibleNewRequests,
    restrictedItems,
    skippedRestricted: restrictedItems.length,
    skippedDuplicates: skippedDuplicatesCount,
    skippedDuplicatesCount,
    eligible: eligibleNewRequests.length > 0,
    workedHours: firstWorkedHours,
    overtimeHours: firstReq?.requestedOtHours ?? 0,
    overtimeAmount: firstReq?.calculatedAmount ?? 0,
  };
}

/**
 * Computes Attendance + Salary Impact Summary for single attendance record
 */
export function calculateAttendanceSalaryImpact(params: {
  employee?: Employee;
  record: AttendanceRecord;
  shift: ShiftModel;
  attendancePolicy: AttendancePolicyConfig;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): SalaryImpactSummary {
  const {
    employee,
    record,
    shift,
    attendancePolicy,
    otPolicy,
    dayType = 'Regular'
  } = params;

  if (
    isOwnerOrCEO({
      ...(employee as any),
      employeeId: employee?.employeeId || record?.employeeId,
      department: employee?.department || record?.department,
    })
  ) {
    return {
      dailySalary: 0,
      standardWorkingHours: shift.requiredWorkingHours || 9.0,
      hourlyRate: 0,
      regularWorkHours: 0,
      otHours: 0,
      otAmount: 0,
      halfDayDeduction: 0,
      lateDeduction: 0,
      absentDeduction: 0,
      earlyCheckoutDeduction: 0,
      netAdjustment: 0,
    };
  }

  const basicSalary = employee?.basicSalary || 26000;
  const workingDaysPerMonth = 26;
  const dailySalary = Math.round((basicSalary / workingDaysPerMonth) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;
  const hourlyRate = Math.round((dailySalary / standardHours) * 100) / 100;

  const regularWorkHours = record.workingHours || 0;
  const approvedOt = record.approvedOtHours || 0;

  // 1. OT Earnings
  const { otAmount } = calculateOtSalaryAmount({
    otHours: approvedOt,
    dailySalary,
    standardWorkingHours: standardHours,
    otPolicy,
    dayType
  });

  // 2. Half-Day Deduction
  let halfDayDeduction = 0;
  if (record.status === 'Half Day') {
    if (attendancePolicy.halfDayDeductionType === 'Half Day Salary Deduction') {
      halfDayDeduction = Math.round(dailySalary * 0.5 * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Percentage Deduction') {
      const pct = (attendancePolicy.halfDayDeductionValue || 50) / 100;
      halfDayDeduction = Math.round(dailySalary * pct * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Fixed Deduction') {
      halfDayDeduction = attendancePolicy.halfDayDeductionValue || 450;
    }
  }

  // 3. Absent Deduction
  let absentDeduction = 0;
  if (record.status === 'Absent') {
    if (attendancePolicy.absentDeductionType === 'Full Day Salary') {
      absentDeduction = dailySalary;
    } else if (attendancePolicy.absentDeductionType === 'Percentage') {
      absentDeduction = Math.round(dailySalary * ((attendancePolicy.absentDeductionValue || 100) / 100) * 100) / 100;
    } else if (attendancePolicy.absentDeductionType === 'Fixed Amount') {
      absentDeduction = attendancePolicy.absentDeductionValue || dailySalary;
    }
  }

  // 4. Late Deduction
  let lateDeduction = 0;
  if (record.lateDurationMinutes && record.lateDurationMinutes > 0) {
    if (attendancePolicy.lateAction === 'Salary Deduction') {
      if (attendancePolicy.lateDeductionType === 'Per Minute') {
        lateDeduction = record.lateDurationMinutes * (attendancePolicy.lateDeductionValue || 5);
      } else if (attendancePolicy.lateDeductionType === 'Fixed Amount') {
        lateDeduction = attendancePolicy.lateDeductionValue || 100;
      } else if (attendancePolicy.lateDeductionType === 'Percentage') {
        lateDeduction = Math.round(dailySalary * ((attendancePolicy.lateDeductionValue || 5) / 100) * 100) / 100;
      }
    }
  }

  // 5. Early Checkout Deduction
  let earlyCheckoutDeduction = 0;
  if (record.earlyCheckoutMinutes && record.earlyCheckoutMinutes > 0) {
    if (attendancePolicy.earlyCheckoutAction === 'Deduct Salary') {
      if (attendancePolicy.earlyCheckoutDeductionType === 'Per Minute') {
        earlyCheckoutDeduction = record.earlyCheckoutMinutes * (attendancePolicy.earlyCheckoutDeductionValue || 5);
      } else if (attendancePolicy.earlyCheckoutDeductionType === 'Fixed Amount') {
        earlyCheckoutDeduction = attendancePolicy.earlyCheckoutDeductionValue || 100;
      }
    }
  }

  const netAdjustment = Math.round((otAmount - halfDayDeduction - absentDeduction - lateDeduction - earlyCheckoutDeduction) * 100) / 100;

  return {
    dailySalary,
    standardWorkingHours: standardHours,
    hourlyRate,
    regularWorkHours,
    otHours: approvedOt,
    otAmount,
    halfDayDeduction,
    lateDeduction,
    absentDeduction,
    earlyCheckoutDeduction,
    netAdjustment
  };
}

/**
 * Computes Monthly Attendance Summary for an Employee
 */
export function aggregateMonthlyAttendanceSummary(
  employeeId: string,
  records: AttendanceRecord[],
  shift: ShiftModel,
  attendancePolicy: AttendancePolicyConfig,
  otPolicy: OvertimePolicy,
  employee?: Employee
): MonthlyAttendanceSummary {
  if (
    isOwnerOrCEO({
      ...(employee as any),
      employeeId: employee?.employeeId || employeeId,
    })
  ) {
    return {
      totalWorkingDays: 0,
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      leaveDays: 0,
      weeklyOffDays: 0,
      holidayDays: 0,
      lateDays: 0,
      earlyCheckoutDays: 0,
      missingAttendanceDays: 0,
      approvedOtHours: 0,
      pendingOtHours: 0,
      rejectedOtHours: 0,
      totalOtAmount: 0,
      totalDeductionAmount: 0,
      netImpact: 0,
    };
  }
  const empRecords = records.filter(r => r.employeeId === employeeId);

  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let lateDays = 0;
  let earlyCheckoutDays = 0;
  let missingAttendanceDays = 0;
  let approvedOtHours = 0;
  let pendingOtHours = 0;
  let rejectedOtHours = 0;
  let totalOtAmount = 0;
  let totalDeductionAmount = 0;

  const basicSalary = employee?.basicSalary || 26000;
  const dailySalary = Math.round((basicSalary / 26) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;

  empRecords.forEach(rec => {
    switch (rec.status) {
      case 'Present':
        presentDays++;
        break;
      case 'Absent':
        absentDays++;
        break;
      case 'Half Day':
        halfDays++;
        break;
      case 'On Leave':
        leaveDays++;
        break;
      case 'Week Off':
        weeklyOffDays++;
        break;
      case 'Holiday':
        holidayDays++;
        break;
      case 'Missing Punch':
        missingAttendanceDays++;
        break;
      default:
        if (rec.checkIn && rec.checkOut) presentDays++;
    }

    if (rec.lateStatus && rec.lateStatus !== 'On Time' && rec.lateStatus !== 'N/A') {
      lateDays++;
    }

    if (rec.earlyCheckoutMinutes && rec.earlyCheckoutMinutes > 0) {
      earlyCheckoutDays++;
    }

    if (rec.approvedOtHours && rec.approvedOtHours > 0) {
      const dateElig = resolveEmployeeOtEligibility(
        employee || { employeeId, department: rec.department },
        [],
        [],
        otPolicy,
        rec.date
      );
      if (dateElig.isEligible) {
        approvedOtHours += rec.approvedOtHours;
        const { otAmount } = calculateOtSalaryAmount({
          otHours: rec.approvedOtHours,
          dailySalary,
          standardWorkingHours: standardHours,
          otPolicy
        });
        totalOtAmount += otAmount;
      }
    }

    if (rec.otStatus === 'Pending' && rec.calculatedOtHours) {
      pendingOtHours += rec.calculatedOtHours;
    }

    if (rec.otStatus === 'Rejected' && rec.calculatedOtHours) {
      rejectedOtHours += rec.calculatedOtHours;
    }

    // Accumulate deductions
    const impact = calculateAttendanceSalaryImpact({
      employee,
      record: rec,
      shift,
      attendancePolicy,
      otPolicy
    });
    totalDeductionAmount += (impact.halfDayDeduction + impact.absentDeduction + impact.lateDeduction + impact.earlyCheckoutDeduction);
  });

  const totalWorkingDays = empRecords.length || 26;
  const netImpact = Math.round((totalOtAmount - totalDeductionAmount) * 100) / 100;

  return {
    totalWorkingDays,
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    weeklyOffDays,
    holidayDays,
    lateDays,
    earlyCheckoutDays,
    missingAttendanceDays,
    approvedOtHours: Math.round(approvedOtHours * 100) / 100,
    pendingOtHours: Math.round(pendingOtHours * 100) / 100,
    rejectedOtHours: Math.round(rejectedOtHours * 100) / 100,
    totalOtAmount: Math.round(totalOtAmount * 100) / 100,
    totalDeductionAmount: Math.round(totalDeductionAmount * 100) / 100,
    netImpact
  };
}

export interface MonthlyAttendanceOtReportRow {
  id: string;
  date: string;
  shiftTime: string;
  punchTimeDisplay: string;
  shiftWorkHrs: number;
  status: string;
  otHrs: number;
  otAmount: number;
  otStatus?: string;
}

export interface MonthlyAttendanceOtReportResult {
  excluded: boolean;
  showOtFields: boolean;
  eligibilityReason: string;
  eligibilitySource: string;
  rows: MonthlyAttendanceOtReportRow[];
  totalShiftWorkHours: number;
  totalApprovedOtHours: number;
  totalApprovedOtAmount: number;
}

/**
 * Builds the Monthly Attendance + Overtime Details report for an employee or HR staff member.
 * - Excludes CEO / Company Owner completely (`excluded: true`, `rows: []`, 0 OT).
 * - For OT-eligible employees: calculates `otHrs` and `otAmount` per day and `totalApprovedOtHours` / `totalApprovedOtAmount`
 *   using the exact same calculation engine as payroll and payslips.
 * - For non-eligible employees: returns `showOtFields: false` and 0 OT so a normal attendance report is shown without OT payment fields.
 */
export function buildEmployeeMonthlyAttendanceOtReport(params: {
  employee: any;
  attendanceRecords: AttendanceRecord[];
  overtimeRequests?: OvertimeRequest[];
  overtimePolicy?: OvertimePolicy;
  departmentOtPolicies?: DepartmentOtPolicy[];
  employeeOtPolicies?: EmployeeOtPolicy[];
  payrollConfig?: PayrollSettingsConfig;
  shifts?: any[];
  month: string | number;
  year: number;
}): MonthlyAttendanceOtReportResult {
  const {
    employee,
    attendanceRecords = [],
    overtimeRequests = [],
    overtimePolicy,
    departmentOtPolicies = [],
    employeeOtPolicies = [],
    payrollConfig,
    shifts = [],
    month,
    year,
  } = params;

  if (!employee || isOwnerOrCEO(employee)) {
    return {
      excluded: true,
      showOtFields: false,
      eligibilityReason: 'CEO / Company Owner is exempt from attendance tracking and overtime eligibility',
      eligibilitySource: 'Blocked',
      rows: [],
      totalShiftWorkHours: 0,
      totalApprovedOtHours: 0,
      totalApprovedOtAmount: 0,
    };
  }

  const targetMonthNum = resolveMonthNumber(month, year);
  const monthPrefix = `${year}-${String(targetMonthNum).padStart(2, '0')}`;
  const refDate = `${monthPrefix}-15`;

  const baseEligibility = resolveEmployeeOtEligibility(
    employee,
    departmentOtPolicies,
    employeeOtPolicies,
    overtimePolicy,
    refDate
  );

  const empIds = new Set(
    [employee.employeeId, employee.id]
      .filter(Boolean)
      .map((v: any) => String(v).trim().toLowerCase())
  );

  const assignedShift =
    (shifts || []).find((s: any) =>
      s.assignments?.some((a: any) => empIds.has(String(a.employeeId || '').trim().toLowerCase()))
    ) || (shifts || [])[0];

  const defaultShiftTime = assignedShift
    ? `${assignedShift.startTime || '09:00 AM'} - ${assignedShift.endTime || '06:00 PM'}`
    : '09:00 AM - 06:00 PM';

  // Deduplicate attendance records for this employee in the selected month
  const byDate = new Map<string, AttendanceRecord>();
  for (const rec of attendanceRecords) {
    if (!rec) continue;
    const recEmpId = String(rec.employeeId || '').trim().toLowerCase();
    if (!recEmpId || !empIds.has(recEmpId)) continue;
    const dateKey = String(rec.shiftDate || rec.date || '').slice(0, 10);
    if (!dateKey || !dateKey.startsWith(monthPrefix)) continue;

    const existing = byDate.get(dateKey);
    if (!existing) {
      byDate.set(dateKey, rec);
    } else {
      const isManual = (rec.method as string) === 'Manual Override' || rec.method === 'Manual Punch';
      const existingManual = (existing.method as string) === 'Manual Override' || existing.method === 'Manual Punch';
      if (isManual && !existingManual) {
        byDate.set(dateKey, rec);
      } else if (Boolean(rec.checkOut) && !existing.checkOut) {
        byDate.set(dateKey, rec);
      }
    }
  }

  // Index approved overtime requests by date for this employee & month
  const approvedOtReqByDate = new Map<string, OvertimeRequest>();
  for (const req of overtimeRequests) {
    if (!req) continue;
    const reqEmpId = String(req.employeeId || '').trim().toLowerCase();
    if (!reqEmpId || !empIds.has(reqEmpId)) continue;
    const isApproved =
      req.status === 'Approved' ||
      req.status === 'Partially Approved' ||
      req.status === 'Paid';
    if (!isApproved) continue;

    const dateKey = String(req.date || '').slice(0, 10);
    if (!dateKey) continue;

    const matchesPeriod =
      (req.isBackdatedArrear &&
        req.targetPayrollMonth &&
        req.targetPayrollYear &&
        resolveMonthNumber(req.targetPayrollMonth, Number(req.targetPayrollYear)) === targetMonthNum &&
        Number(req.targetPayrollYear) === Number(year)) ||
      dateKey.startsWith(monthPrefix);

    if (!matchesPeriod) continue;
    if (!approvedOtReqByDate.has(dateKey)) {
      approvedOtReqByDate.set(dateKey, req);
    }
  }

  // Ensure any date with an approved OT request is also represented in the date set
  const allDates = new Set<string>([
    ...byDate.keys(),
    ...approvedOtReqByDate.keys(),
  ]);

  const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b));

  let totalShiftWorkHours = 0;
  let totalApprovedOtHours = 0;
  let totalApprovedOtAmount = 0;
  let anyDayOtEligible = baseEligibility.isEligible && overtimePolicy?.enabled !== false;

  const rows: MonthlyAttendanceOtReportRow[] = sortedDates.map(dateKey => {
    const rec = byDate.get(dateKey);
    const otReq = approvedOtReqByDate.get(dateKey);

    const dateEligibility = resolveEmployeeOtEligibility(
      employee,
      departmentOtPolicies,
      employeeOtPolicies,
      overtimePolicy,
      dateKey
    );
    const isDateEligible = dateEligibility.isEligible && overtimePolicy?.enabled !== false;
    if (isDateEligible) {
      anyDayOtEligible = true;
    }

    const stdShiftHours =
      Number((assignedShift as any)?.workingHours) > 0
        ? Number((assignedShift as any).workingHours)
        : (dateEligibility.standardShiftHours || baseEligibility.standardShiftHours || 9);

    const workHrs = Math.round((Number(rec?.workingHours ?? (rec as any)?.workHours ?? 0) + Number.EPSILON) * 100) / 100;
    totalShiftWorkHours += workHrs;

    let otHrs = 0;
    let otAmount = 0;
    let otStatus = rec?.otStatus || rec?.otApprovalStatus || otReq?.status;

    if (isDateEligible) {
      if (otReq) {
        otHrs = Number(
          (otReq.approvedOtHours !== undefined && otReq.approvedOtHours > 0)
            ? otReq.approvedOtHours
            : ((otReq as any).otHours ?? otReq.requestedOtHours ?? 0)
        ) || 0;
        if (otHrs > 0) {
          const itemCalc = calculateEnterpriseOvertimeRateAndAmount({
            employee,
            approvedOtHours: otHrs,
            month,
            year,
            payrollConfig,
            overtimePolicy,
            departmentOtPolicies,
            employeeOtPolicies,
            rateType: (otReq as any).rateType || otReq.multiplier,
            fixedHourlyRate: otReq.hourlyRate && otReq.hourlyRate > 0 ? otReq.hourlyRate : undefined,
            dateStr: dateKey,
          });
          const rawReqAmt = Number((otReq as any).otAmount ?? otReq.calculatedAmount ?? 0);
          otAmount =
            itemCalc.wageBaseMode !== 'FIXED_HOURLY'
              ? itemCalc.overtimeAmount
              : (rawReqAmt > 0 ? Math.round((rawReqAmt + Number.EPSILON) * 100) / 100 : itemCalc.overtimeAmount);
        }
      } else if (rec && rec.otApprovalStatus !== 'Rejected' && rec.otStatus !== 'Rejected') {
        const explicitApprovedHrs =
          rec.approvedOtHours !== undefined && Number(rec.approvedOtHours) > 0
            ? Number(rec.approvedOtHours)
            : Number((rec as any).otHours || rec.overtimeHours || rec.calculatedOtHours || 0);
        const autoExcessHrs =
          workHrs > stdShiftHours
            ? Math.round((workHrs - stdShiftHours + Number.EPSILON) * 100) / 100
            : 0;
        const recApprovedHrs = explicitApprovedHrs > 0 ? explicitApprovedHrs : autoExcessHrs;
        if (recApprovedHrs > 0) {
          otHrs = recApprovedHrs;
          const attCalc = calculateEnterpriseOvertimeRateAndAmount({
            employee,
            approvedOtHours: otHrs,
            month,
            year,
            payrollConfig,
            overtimePolicy,
            departmentOtPolicies,
            employeeOtPolicies,
            dateStr: dateKey,
          });
          otAmount = attCalc.overtimeAmount;
        }
      }
    }

    otHrs = Math.round((otHrs + Number.EPSILON) * 100) / 100;
    otAmount = Math.round((otAmount + Number.EPSILON) * 100) / 100;
    totalApprovedOtHours += otHrs;
    totalApprovedOtAmount += otAmount;

    const checkInStr = rec?.checkIn && rec.checkIn !== '--:--' ? rec.checkIn : '--:--';
    const checkOutStr = rec?.checkOut && rec.checkOut !== '--:--' ? rec.checkOut : '--:--';

    return {
      id: rec?.id || otReq?.id || `${employee.employeeId || 'EMP'}-${dateKey}`,
      date: dateKey,
      shiftTime: rec?.shiftName || defaultShiftTime,
      punchTimeDisplay: `${checkInStr} - ${checkOutStr}`,
      shiftWorkHrs: workHrs,
      status: rec?.status || 'Present',
      otHrs: anyDayOtEligible ? otHrs : 0,
      otAmount: anyDayOtEligible ? otAmount : 0,
      otStatus,
    };
  });

  return {
    excluded: false,
    showOtFields: anyDayOtEligible,
    eligibilityReason: baseEligibility.reason,
    eligibilitySource: baseEligibility.source,
    rows,
    totalShiftWorkHours: Math.round((totalShiftWorkHours + Number.EPSILON) * 100) / 100,
    totalApprovedOtHours: anyDayOtEligible ? Math.round((totalApprovedOtHours + Number.EPSILON) * 100) / 100 : 0,
    totalApprovedOtAmount: anyDayOtEligible ? Math.round((totalApprovedOtAmount + Number.EPSILON) * 100) / 100 : 0,
  };
}
