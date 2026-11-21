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
 * Formats decimal hours (e.g. 8.82, 8.92, 0.02) or time string into standard enterprise display: "8h 49m", "8h 55m", "0h 01m".
 * Accurately converts total minutes internally (e.g. 8.82 hrs = Math.round(8.82 * 60) = 529 mins -> 8h 49m).
 * Never interprets decimal hours like 8.82 as 8 hours 82 minutes.
 */
export function formatHoursAndMinutes(hoursVal: number | string | null | undefined): string {
  if (hoursVal === null || hoursVal === undefined || hoursVal === '') return '0h 00m';
  const str = String(hoursVal).trim();
  if (str === '—' || str === '-' || str === '--:--' || str.toLowerCase().includes('progress')) {
    return '0h 00m';
  }
  if (/^\d+h\s*\d+m$/i.test(str)) {
    return str;
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str)) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  const cleanNumStr = str.replace(/[^\d.-]/g, '').trim();
  const num = Number(cleanNumStr);
  if (isNaN(num) || num <= 0) return '0h 00m';
  const totalMinutes = Math.round((num + Number.EPSILON) * 60);
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
 * Returns today's date string ('YYYY-MM-DD') in Asia/Kolkata local timezone.
 */
export function getIstTodayDateStr(ref: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ref);
  } catch {
    const y = ref.getFullYear();
    const m = String(ref.getMonth() + 1).padStart(2, '0');
    const d = String(ref.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Normalizes any date string ('YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', ISO timestamp) into 'YYYY-MM-DD'
 * using Asia/Kolkata timezone for ISO timestamps with time/offset.
 */
export function normalizeDateToISO(dateInput?: string | Date | null): string | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return getIstTodayDateStr(dateInput);
  }
  const clean = String(dateInput).trim();
  if (!clean || clean === '—' || clean === '-' || clean === 'N/A') return null;

  // Plain YYYY-MM-DD without time offset
  const plainIsoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (plainIsoMatch) {
    const y = plainIsoMatch[1];
    const m = String(Number(plainIsoMatch[2])).padStart(2, '0');
    const d = String(Number(plainIsoMatch[3])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ISO timestamp with time/timezone (e.g. 2026-11-06T18:30:00.000Z or 2026-11-07T00:00:00.000Z)
  if (clean.includes('T') && (clean.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(clean))) {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return getIstTodayDateStr(parsed);
    }
  }

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
    const hStart = normalizeDateToISO(h.startDate || h.date || h.holidayDate || h.holiday_date);
    if (!hStart) return false;
    const hEndRaw = normalizeDateToISO(h.endDate);
    let matchesDate = false;
    if (hEndRaw && hEndRaw >= hStart) {
      matchesDate = dateStr >= hStart && dateStr <= hEndRaw;
    } else if (Number(h.daysCount) > 1) {
      const [ys, ms, ds] = hStart.split('-').map(Number);
      const endObj = new Date(ys, ms - 1, ds + Number(h.daysCount) - 1);
      const calcEnd = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
      matchesDate = dateStr >= hStart && dateStr <= calcEnd;
    } else {
      matchesDate = hStart === dateStr;
    }
    if (!matchesDate) return false;
    if (h.isPaid === false || String(h.type || '').toLowerCase() === 'unpaid') return false;

    const loc = String(h.applicableLocation || h.location || 'All Sites').trim().toLowerCase();
    if (
      !loc ||
      loc === 'all' ||
      loc.includes('all sites') ||
      loc.includes('all locations') ||
      loc.includes('company wide') ||
      loc.includes('all branches')
    ) {
      return true;
    }
    if (!empLoc || loc.includes(empLoc) || empLoc.includes(loc)) {
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
  fullPresentDays?: number;
  halfDays?: number;
  workedDays?: number;
  elapsedCalendarDays?: number;
  elapsedHolidays?: number;
  elapsedScheduledWorkingDays?: number;
  provisionalInProgressDays?: number;
  confirmedPaidDays?: number;
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
  employeeUuid?: string;
  employeeName?: string;
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
  finalizePayroll?: boolean;
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
  const empUuidNorm = String(params.employeeUuid || '').trim().toLowerCase();
  const empNameNorm = String(params.employeeName || '').trim().toLowerCase();
  const matchesTargetEmp = (rawId: any, rawName?: any): boolean => {
    if (!empIdNorm && !empUuidNorm && !empNameNorm) return true;
    const idNorm = String(rawId || '').trim().toLowerCase();
    const nameNorm = String(rawName || '').trim().toLowerCase();
    if (idNorm && ((empIdNorm && idNorm === empIdNorm) || (empUuidNorm && idNorm === empUuidNorm))) {
      return true;
    }
    if (nameNorm && empNameNorm && nameNorm === empNameNorm) {
      return true;
    }
    if (!idNorm && !nameNorm) return !empIdNorm && !empUuidNorm && !empNameNorm;
    return false;
  };

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
      if (!matchesTargetEmp(rec.employeeId || rec.employee_id, rec.employeeName || rec.employee_name)) continue;
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

  const approvedLeavesInMonth: any[] = [];
  const explicitSandwichUnpaidDates = new Set<string>();
  const leaveDatesInRequestRange = new Map<string, { isUnpaid: boolean; isHalfDay: boolean; isWfh: boolean }>();

  if (Array.isArray(params.leaveRequests)) {
    for (const lr of params.leaveRequests) {
      if (!lr) continue;
      const statusNorm = String(lr.status || '').trim().toLowerCase();
      if (statusNorm !== 'approved') continue;
      if (!matchesTargetEmp(lr.employeeId || lr.employee_id, lr.employeeName || lr.employee_name)) continue;
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
  let fullPresentDaysCount = 0;
  let halfDaysCount = 0;
  let provisionalInProgressDays = 0;

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
        fullPresentDaysCount += 1;
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
        } else if (att || !isPunchLogAttendanceMode) {
          dayObj.dayPresent = 0.5;
          halfDaysCount += 1;
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
      const rawCheckIn = att.checkIn ?? att.check_in;
      const rawCheckOut = att.checkOut ?? att.check_out;
      const hasValidIn =
        Boolean(rawCheckIn) &&
        String(rawCheckIn).trim() !== '' &&
        String(rawCheckIn).trim() !== '--:--' &&
        !String(rawCheckIn).toLowerCase().includes('missed') &&
        !String(rawCheckIn).toLowerCase().includes('none');
      const hasCompletedOut =
        Boolean(rawCheckOut) &&
        String(rawCheckOut).trim() !== '' &&
        String(rawCheckOut).trim() !== '--:--' &&
        !String(rawCheckOut).toLowerCase().includes('progress') &&
        !String(rawCheckOut).toLowerCase().includes('missed') &&
        !String(rawCheckOut).toLowerCase().includes('none');
      const isInProgressPunch = hasValidIn && !hasCompletedOut && dayObj.dateStr === evaluationCutoffDate;

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
        hasCompletedOut &&
        (statusNorm === 'present' || statusNorm === 'late') &&
        workedHrsForDay > 0 &&
        workedHrsForDay < shiftHrsForDay * 0.7;

      if (statusNorm === 'half day' || statusNorm === 'half-day' || statusNorm === 'hd' || isHalfDayByHours) {
        dayObj.dayPresent = 0.5;
        halfDaysCount += 1;
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
        if (isInProgressPunch && params.finalizePayroll === true) {
          // Do not finalize payroll on an unfinalized in-progress punch before check-out
          provisionalInProgressDays += 1;
          pendingAttendanceDays += 1;
          dayObj.dayPresent = 0;
        } else {
          if (isInProgressPunch) {
            provisionalInProgressDays += 1;
          }
          dayObj.dayPresent = 1;
          fullPresentDaysCount += 1;
          actualPunchedDays += 1;
        }
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
        fullPresentDaysCount += 1;
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

  presentDays = Math.round(presentDays * 100) / 100;
  paidLeaveDays = Math.round(paidLeaveDays * 100) / 100;
  lopDays = lopEnabled ? Math.round(lopDays * 100) / 100 : 0;
  paidWeekOffDays = Math.round(paidWeekOffDays * 100) / 100;
  paidHolidayDays = Math.round(paidHolidayDays * 100) / 100;

  const paidDays = isPunchLogAttendanceMode
    ? Math.min(
        eligibleDays,
        Math.max(0, Math.round((presentDays + paidWeekOffDays + paidHolidayDays + paidLeaveDays) * 100) / 100)
      )
    : Math.max(0, Math.round((eligibleDays - lopDays) * 100) / 100);
  const prorationFactor = calendarDays > 0 ? paidDays / calendarDays : 1;

  const elapsedDayList = dayList.filter(d => d.isEligible && d.dateStr <= evaluationCutoffDate);
  const elapsedCalendarDays = elapsedDayList.length;
  const elapsedHolidays = elapsedDayList.filter(d => !d.isScheduledWorkingDay).length;
  const elapsedScheduledWorkingDays = elapsedDayList.filter(d => d.isScheduledWorkingDay).length;
  const confirmedPaidDays = Math.max(0, Math.round((paidDays - provisionalInProgressDays) * 100) / 100);

  return {
    calendarDays,
    eligibleDays,
    unemployedDays: Math.max(0, calendarDays - eligibleDays),
    scheduledWorkingDays,
    workingDays: scheduledWorkingDays,
    presentDays,
    fullPresentDays: fullPresentDaysCount,
    halfDays: halfDaysCount,
    workedDays: presentDays,
    elapsedCalendarDays,
    elapsedHolidays,
    elapsedScheduledWorkingDays,
    provisionalInProgressDays,
    confirmedPaidDays,
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

export type CanonicalCalendarDayStatus =
  | 'Present'
  | 'Late'
  | 'Half Day'
  | 'Paid Leave'
  | 'Unpaid Leave'
  | 'Pending Leave'
  | 'Holiday'
  | 'Absent'
  | 'Not Marked';

export interface EmployeeCalendarDayRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation?: string;
  avatar?: string;
  date: string;
  shiftDate: string;
  checkIn: string | null;
  checkOut: string | null;
  workingHours: number;
  status: CanonicalCalendarDayStatus;
  effectiveStatus: CanonicalCalendarDayStatus;
  isInProgress: boolean;
  isProvisional: boolean;
  isHoliday: boolean;
  isWeeklyOff: boolean;
  isScheduledWorkingDay: boolean;
  holidayLabel?: string;
  leaveRequestId?: string;
  leaveType?: string;
  leaveStatus?: string;
  method?: string;
  checkInPhoto?: string;
  checkOutPhoto?: string;
  checkInLocation?: string;
  checkOutLocation?: string;
  location?: {
    lat?: number;
    lng?: number;
    address?: string;
    inGeofence?: boolean;
  };
  lateStatus?: string;
  lateDurationMinutes?: number;
  approvedOtHours?: number;
  otHours?: number;
  overtimeHours?: number;
  calculatedOtHours?: number;
  otStatus?: string;
  otApprovalStatus?: string;
  workedDayEquivalent: number;
  paidDayEquivalent: number;
  provisionalDayEquivalent: number;
  lopDayEquivalent: number;
}

export interface EmployeeMonthlyAttendanceCalendarResult {
  monthKey: string;
  monthStart: string;
  monthEnd: string;
  cutoffDate: string;
  calendarDaysInMonth: number;
  calendarDaysElapsed: number;
  holidaysCount: number;
  scheduledWorkingDays: number;
  fullPresentDays: number;
  lateDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  pendingLeaveDays: number;
  absentDays: number;
  workedDays: number;
  paidDays: number;
  confirmedPaidDays: number;
  provisionalInProgressDays: number;
  lopDays: number;
  rows: EmployeeCalendarDayRow[];
}

export interface BuildEmployeeMonthlyAttendanceCalendarParams {
  month: string | number;
  year?: number;
  todayStr?: string;
  employee?: Partial<Employee> & Record<string, any>;
  employeeId?: string;
  employeeUuid?: string;
  employeeName?: string;
  department?: string;
  joiningDate?: string | null;
  exitDate?: string | null;
  weeklyOff?: string | string[] | null;
  weeklySchedules?: any[];
  holidays?: any[];
  employeeLocation?: string;
  attendanceRecords?: any[];
  leaveRequests?: any[];
  stdShiftHours?: number;
}

/**
 * Shared Authoritative Month-to-Date / Monthly Attendance Calendar Builder.
 * Produces one mutually-exclusive display row per calendar date (1st of month through cutoffDate inclusive in Asia/Kolkata)
 * and computes Full Present Days, Worked Days (with Half Day = 0.5), Paid Leave, Holidays, Scheduled Working Days, and Paid Days.
 */
export function buildEmployeeMonthlyAttendanceCalendar(
  params: BuildEmployeeMonthlyAttendanceCalendarParams
): EmployeeMonthlyAttendanceCalendarResult {
  const { monthNum, resolvedYear } = parseMonthAndYear(params.month, params.year);
  const yearNum = resolvedYear || Number(params.year) || new Date().getFullYear();
  const calendarDaysInMonth = getCalendarDaysInMonth(monthNum, yearNum);
  const monthPad = String(monthNum).padStart(2, '0');
  const monthKey = `${yearNum}-${monthPad}`;
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(calendarDaysInMonth).padStart(2, '0')}`;

  const todayIst = normalizeDateToISO(params.todayStr) || getIstTodayDateStr();

  const emp = params.employee || {};
  const canonicalEmpCode = String(params.employeeId || emp.employeeId || emp.id || '').trim();
  const canonicalEmpUuid = String(params.employeeUuid || emp.id || '').trim();
  const canonicalEmpName = String(
    params.employeeName ||
      emp.name ||
      (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : '') ||
      'Employee'
  ).trim();
  const canonicalDept = String(params.department || emp.department || 'General').trim();
  const canonicalLocation = String(params.employeeLocation || emp.workLocation || emp.branch || '').trim();
  const weeklyOffRule = params.weeklyOff ?? emp.shiftDetails?.weeklyOff;
  const stdShiftHours = Number(params.stdShiftHours || 9) || 9;

  const validEmpIds = new Set(
    [canonicalEmpCode, canonicalEmpUuid, emp.employeeId, emp.id]
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase())
  );
  const validEmpNames = new Set(
    [canonicalEmpName, emp.name, emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : '']
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase())
  );

  const matchesEmployee = (recEmpId?: any, recEmpName?: any): boolean => {
    if (validEmpIds.size === 0 && validEmpNames.size === 0) return true;
    const idNorm = String(recEmpId || '').trim().toLowerCase();
    if (idNorm && validEmpIds.has(idNorm)) return true;
    const nameNorm = String(recEmpName || '').trim().toLowerCase();
    if (nameNorm && validEmpNames.has(nameNorm)) return true;
    return false;
  };

  // Deduplicate attendance records for this employee in this month by local date
  const attByDate = new Map<string, any>();
  const companyHolidayDatesFromAtt = new Map<string, string>();
  let maxRecordedDate = '';

  if (Array.isArray(params.attendanceRecords)) {
    for (const rec of params.attendanceRecords) {
      if (!rec) continue;
      const dIso = normalizeDateToISO(rec.date || rec.shiftDate || rec.shift_date);
      if (!dIso || dIso < monthStart || dIso > monthEnd) continue;

      const rawSt = String(rec.status || '').trim().toLowerCase();
      if (rawSt === 'holiday') {
        companyHolidayDatesFromAtt.set(dIso, String(rec.method || rec.reason || 'Holiday'));
      }

      if (!matchesEmployee(rec.employeeId || rec.employee_id, rec.employeeName || rec.employee_name)) {
        continue;
      }
      if (dIso > maxRecordedDate) maxRecordedDate = dIso;

      const existing = attByDate.get(dIso);
      if (!existing) {
        attByDate.set(dIso, { ...rec, date: dIso, shiftDate: dIso });
        continue;
      }

      const existingIn = existing.checkIn ?? existing.check_in;
      const existingOut = existing.checkOut ?? existing.check_out;
      const recIn = rec.checkIn ?? rec.check_in;
      const recOut = rec.checkOut ?? rec.check_out;

      const existingHasIn = Boolean(existingIn && String(existingIn).trim() !== '' && String(existingIn).trim() !== '--:--');
      const existingHasOut = Boolean(existingOut && String(existingOut).trim() !== '' && String(existingOut).trim() !== '--:--');
      const recHasIn = Boolean(recIn && String(recIn).trim() !== '' && String(recIn).trim() !== '--:--');
      const recHasOut = Boolean(recOut && String(recOut).trim() !== '' && String(recOut).trim() !== '--:--');

      const existingHrs = Number(existing.workingHours ?? existing.working_hours ?? 0);
      const recHrs = Number(rec.workingHours ?? rec.working_hours ?? 0);

      const isRecManual =
        String(rec.method || '') === 'Manual Override' ||
        String(rec.method || '') === 'Manual Punch' ||
        Boolean(rec.reason);
      const isExistingManual =
        String(existing.method || '') === 'Manual Override' ||
        String(existing.method || '') === 'Manual Punch' ||
        Boolean(existing.reason);

      const preferRec =
        (isRecManual && !isExistingManual) ||
        (!isExistingManual && ((recHasOut && !existingHasOut) || recHrs > existingHrs));
      const base = preferRec ? { ...rec } : { ...existing };
      const finalCheckIn =
        existingHasIn && recHasIn
          ? preferRec
            ? recIn
            : existingIn
          : existingHasIn
          ? existingIn
          : recIn;
      const finalCheckOut =
        existingHasOut && recHasOut
          ? preferRec
            ? recOut
            : existingOut
          : existingHasOut
          ? existingOut
          : recOut;
      const finalHours =
        isRecManual && !isExistingManual
          ? recHrs
          : isExistingManual && !isRecManual
          ? existingHrs
          : Math.max(existingHrs, recHrs);

      const isGenericLoc = (val?: string | null) => {
        if (!val) return true;
        const low = String(val).trim().toLowerCase();
        return (
          !low ||
          low === 'hq office' ||
          low === 'plant hq' ||
          low === 'main plant hq' ||
          low === 'verified office geofence' ||
          low === 'daily field work (gps verified)' ||
          low === 'daily field work (flexible attendance)' ||
          low === 'field work (gps)' ||
          low === 'field work' ||
          low === 'location pending' ||
          low.startsWith('live gps (')
        );
      };
      const pickBestLoc = (...candidates: Array<string | undefined | null>) => {
        const real = candidates.find(c => c && !isGenericLoc(c));
        if (real) return real;
        return candidates.find(Boolean) || undefined;
      };

      attByDate.set(dIso, {
        ...base,
        date: dIso,
        shiftDate: dIso,
        checkIn: finalCheckIn ?? null,
        checkOut: finalCheckOut ?? null,
        workingHours: finalHours > 0 ? finalHours : Number(base.workingHours || 0),
        checkInPhoto: existing.checkInPhoto || rec.checkInPhoto,
        checkOutPhoto: rec.checkOutPhoto || existing.checkOutPhoto,
        checkInLocation: pickBestLoc(
          existing.checkInLocation,
          rec.checkInLocation,
          existing.location?.address,
          rec.location?.address
        ),
        checkOutLocation: pickBestLoc(
          rec.checkOutLocation,
          existing.checkOutLocation,
          rec.location?.address,
          existing.location?.address
        ),
      });
    }
  }

  // Index employee's leave requests (Approved and Pending) by calendar date within this month
  interface LeaveDayEntry {
    id: string;
    leaveType: string;
    status: 'Approved' | 'Pending' | 'Rejected';
    isUnpaid: boolean;
    isHalfDay: boolean;
    isWfh: boolean;
  }
  const approvedLeaveByDate = new Map<string, LeaveDayEntry>();
  const pendingLeaveByDate = new Map<string, LeaveDayEntry>();

  if (Array.isArray(params.leaveRequests)) {
    for (const lr of params.leaveRequests) {
      if (!lr) continue;
      if (!matchesEmployee(lr.employeeId || lr.employee_id, lr.employeeName || lr.employee_name)) continue;

      const rawStatus = String(lr.status || '').trim().toLowerCase();
      if (rawStatus !== 'approved' && rawStatus !== 'pending') continue;

      const sIso = normalizeDateToISO(lr.startDate || lr.start_date);
      const eIso = normalizeDateToISO(lr.endDate || lr.end_date || sIso);
      if (!sIso || !eIso) continue;
      if (eIso < monthStart || sIso > monthEnd) continue;

      const leaveType = String(lr.leaveType || lr.leave_type || 'Paid Leave').trim();
      const isUnpaid =
        isLeaveTypeUnpaidCheck(leaveType) ||
        (Number(lr.unpaidDaysCount) > 0 && Number(lr.paidDaysCount) === 0);
      const isWfh = isLeaveTypeWfhOrOnDuty(leaveType);
      const isHalfDay =
        Boolean(lr.isHalfDay) ||
        (sIso === eIso && Number(lr.daysCount ?? lr.days_count) === 0.5) ||
        String(lr.reason || '').toLowerCase().includes('[half day');

      const rangeStart = sIso > monthStart ? sIso : monthStart;
      const rangeEnd = eIso < monthEnd ? eIso : monthEnd;
      const [ys, ms, ds] = rangeStart.split('-').map(Number);
      const [ye, me, de] = rangeEnd.split('-').map(Number);
      const cur = new Date(ys, ms - 1, ds);
      const last = new Date(ye, me - 1, de);

      while (cur <= last) {
        const dStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const entry: LeaveDayEntry = {
          id: String(lr.id || `LV-${dStr}`),
          leaveType,
          status: rawStatus === 'approved' ? 'Approved' : 'Pending',
          isUnpaid,
          isHalfDay,
          isWfh,
        };
        if (rawStatus === 'approved') {
          approvedLeaveByDate.set(dStr, entry);
          if (dStr > maxRecordedDate) maxRecordedDate = dStr;
        } else if (!pendingLeaveByDate.has(dStr)) {
          pendingLeaveByDate.set(dStr, entry);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  // Determine cutoff date for month-to-date calendar
  let cutoffDate = monthEnd;
  if (todayIst >= monthStart && todayIst <= monthEnd) {
    cutoffDate = todayIst;
  } else if (todayIst < monthStart) {
    cutoffDate = maxRecordedDate >= monthStart && maxRecordedDate <= monthEnd ? maxRecordedDate : '';
  }

  const joiningIso = normalizeDateToISO(params.joiningDate ?? emp.joiningDate ?? emp.dateOfJoining);
  const exitIso = normalizeDateToISO(params.exitDate ?? emp.exitDate ?? emp.relievingDate ?? emp.lastWorkingDate);

  const effectiveStart = joiningIso && joiningIso > monthStart ? joiningIso : monthStart;
  const effectiveEnd = exitIso && exitIso < cutoffDate ? exitIso : cutoffDate;

  if (!cutoffDate || effectiveStart > effectiveEnd) {
    return {
      monthKey,
      monthStart,
      monthEnd,
      cutoffDate: cutoffDate || monthStart,
      calendarDaysInMonth,
      calendarDaysElapsed: 0,
      holidaysCount: 0,
      scheduledWorkingDays: 0,
      fullPresentDays: 0,
      lateDays: 0,
      halfDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      pendingLeaveDays: 0,
      absentDays: 0,
      workedDays: 0,
      paidDays: 0,
      confirmedPaidDays: 0,
      provisionalInProgressDays: 0,
      lopDays: 0,
      rows: [],
    };
  }

  const startDayNum = Number(effectiveStart.slice(8, 10)) || 1;
  const endDayNum = Number(effectiveEnd.slice(8, 10)) || calendarDaysInMonth;

  const rows: EmployeeCalendarDayRow[] = [];
  let calendarDaysElapsed = 0;
  let holidaysCount = 0;
  let scheduledWorkingDays = 0;
  let fullPresentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let pendingLeaveDays = 0;
  let absentDays = 0;
  let workedDays = 0;
  let paidDays = 0;
  let provisionalInProgressDays = 0;
  let lopDays = 0;

  for (let day = startDayNum; day <= endDayNum; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
    const localDate = new Date(yearNum, monthNum - 1, day, 12, 0, 0);
    calendarDaysElapsed += 1;

    const att = attByDate.get(dateStr);
    const approvedLeave = approvedLeaveByDate.get(dateStr);
    const pendingLeave = pendingLeaveByDate.get(dateStr);

    const weekOffInfo = isDateEmployeeWeeklyOff(localDate, weeklyOffRule, params.weeklySchedules);
    const companyHolInfo = isDateCompanyPaidHoliday(dateStr, params.holidays, canonicalLocation);
    const attStatusNorm = String(att?.status || '').trim().toLowerCase();
    const isAttMarkedHoliday =
      attStatusNorm === 'holiday' ||
      attStatusNorm === 'week off' ||
      attStatusNorm === 'weekoff' ||
      attStatusNorm === 'wo';
    const isCompanyAttHoliday = companyHolidayDatesFromAtt.has(dateStr);

    const isWeeklyOff = weekOffInfo.isWeeklyOff;
    const isCompanyHoliday = companyHolInfo.isHoliday || isAttMarkedHoliday || isCompanyAttHoliday;
    const isHoliday = isWeeklyOff || isCompanyHoliday;
    const isScheduledWorkingDay = !isHoliday;

    if (isHoliday) {
      holidaysCount += 1;
    } else {
      scheduledWorkingDays += 1;
    }

    const holidayLabel = companyHolInfo.holidayName ||
      companyHolidayDatesFromAtt.get(dateStr) ||
      (isAttMarkedHoliday ? String(att?.method || 'Holiday') : undefined) ||
      (isWeeklyOff ? 'Week Off' : undefined);

    const rawCheckIn = att?.checkIn ?? att?.check_in ?? null;
    const rawCheckOut = att?.checkOut ?? att?.check_out ?? null;
    const hasCheckIn =
      Boolean(rawCheckIn) &&
      String(rawCheckIn).trim() !== '' &&
      String(rawCheckIn).trim() !== '--:--' &&
      !String(rawCheckIn).toLowerCase().includes('missed') &&
      !String(rawCheckIn).toLowerCase().includes('none') &&
      !String(rawCheckIn).toLowerCase().includes('absent');
    const hasCheckOut =
      Boolean(rawCheckOut) &&
      String(rawCheckOut).trim() !== '' &&
      String(rawCheckOut).trim() !== '--:--' &&
      !String(rawCheckOut).toLowerCase().includes('progress') &&
      !String(rawCheckOut).toLowerCase().includes('missed') &&
      !String(rawCheckOut).toLowerCase().includes('none');

    // Case 1: Holiday / Weekly Off (mutually exclusive as Holiday unless worked on holiday)
    if (isHoliday && !hasCheckIn) {
      paidDays += 1;
      rows.push({
        id: att?.id || `HOL-${canonicalEmpCode || 'EMP'}-${dateStr}`,
        employeeId: canonicalEmpCode,
        employeeName: canonicalEmpName,
        department: canonicalDept,
        designation: emp.designation || '',
        avatar: emp.avatar || '',
        date: dateStr,
        shiftDate: dateStr,
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: 'Holiday',
        effectiveStatus: 'Holiday',
        isInProgress: false,
        isProvisional: false,
        isHoliday: true,
        isWeeklyOff,
        isScheduledWorkingDay: false,
        holidayLabel: holidayLabel || 'Holiday',
        method: holidayLabel || 'Holiday',
        workedDayEquivalent: 0,
        paidDayEquivalent: 1,
        provisionalDayEquivalent: 0,
        lopDayEquivalent: 0,
      });
      continue;
    }

    // Case 2: Approved Full-Day Leave on a Scheduled Working Day (with no physical punch)
    if (!hasCheckIn && (approvedLeave || attStatusNorm === 'on leave' || attStatusNorm === 'leave')) {
      const isWfhLeave =
        approvedLeave?.isWfh ||
        attStatusNorm === 'work from home' ||
        attStatusNorm === 'wfh';
      const isUnpaidLeave =
        approvedLeave !== undefined
          ? approvedLeave.isUnpaid
          : isLeaveTypeUnpaidCheck(att?.leaveType || att?.reason);
      const isHalfDayLeave = Boolean(approvedLeave?.isHalfDay);

      if (isWfhLeave) {
        fullPresentDays += 1;
        workedDays += 1;
        paidDays += 1;
        rows.push({
          id: att?.id || `WFH-${canonicalEmpCode || 'EMP'}-${dateStr}`,
          employeeId: canonicalEmpCode,
          employeeName: canonicalEmpName,
          department: canonicalDept,
          designation: emp.designation || '',
          avatar: emp.avatar || '',
          date: dateStr,
          shiftDate: dateStr,
          checkIn: rawCheckIn || '09:30 AM',
          checkOut: rawCheckOut || '06:30 PM',
          workingHours: Number(att?.workingHours || 8),
          status: 'Present',
          effectiveStatus: 'Present',
          isInProgress: false,
          isProvisional: false,
          isHoliday: false,
          isWeeklyOff: false,
          isScheduledWorkingDay: true,
          leaveRequestId: approvedLeave?.id,
          leaveType: approvedLeave?.leaveType || 'Work From Home',
          leaveStatus: 'Approved',
          method: 'Work From Home',
          workedDayEquivalent: 1,
          paidDayEquivalent: 1,
          provisionalDayEquivalent: 0,
          lopDayEquivalent: 0,
        });
        continue;
      }

      if (isUnpaidLeave) {
        const leaveUnits = isHalfDayLeave ? 0.5 : 1;
        unpaidLeaveDays += leaveUnits;
        lopDays += leaveUnits;
        rows.push({
          id: att?.id || `LV-UNPAID-${canonicalEmpCode || 'EMP'}-${dateStr}`,
          employeeId: canonicalEmpCode,
          employeeName: canonicalEmpName,
          department: canonicalDept,
          designation: emp.designation || '',
          avatar: emp.avatar || '',
          date: dateStr,
          shiftDate: dateStr,
          checkIn: null,
          checkOut: null,
          workingHours: 0,
          status: 'Unpaid Leave',
          effectiveStatus: 'Unpaid Leave',
          isInProgress: false,
          isProvisional: false,
          isHoliday: false,
          isWeeklyOff: false,
          isScheduledWorkingDay: true,
          leaveRequestId: approvedLeave?.id,
          leaveType: approvedLeave?.leaveType || att?.leaveType || 'Unpaid Leave',
          leaveStatus: 'Approved',
          method: 'Approved Leave',
          workedDayEquivalent: 0,
          paidDayEquivalent: 0,
          provisionalDayEquivalent: 0,
          lopDayEquivalent: leaveUnits,
        });
        continue;
      }

      // Approved Paid Leave (e.g. Nov 7, 2026) — blank check-in/check-out, 0 working/OT hours, never classified as Present
      const paidUnits = isHalfDayLeave ? 0.5 : 1;
      paidLeaveDays += paidUnits;
      paidDays += paidUnits;
      if (isHalfDayLeave) {
        lopDays += 0.5;
      }
      rows.push({
        id: att?.id || `LV-PAID-${canonicalEmpCode || 'EMP'}-${dateStr}`,
        employeeId: canonicalEmpCode,
        employeeName: canonicalEmpName,
        department: canonicalDept,
        designation: emp.designation || '',
        avatar: emp.avatar || '',
        date: dateStr,
        shiftDate: dateStr,
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: 'Paid Leave',
        effectiveStatus: 'Paid Leave',
        isInProgress: false,
        isProvisional: false,
        isHoliday: false,
        isWeeklyOff: false,
        isScheduledWorkingDay: true,
        leaveRequestId: approvedLeave?.id,
        leaveType: approvedLeave?.leaveType || att?.leaveType || 'Paid Leave',
        leaveStatus: 'Approved',
        method: 'Approved Paid Leave',
        workedDayEquivalent: 0,
        paidDayEquivalent: paidUnits,
        provisionalDayEquivalent: 0,
        lopDayEquivalent: isHalfDayLeave ? 0.5 : 0,
      });
      continue;
    }

    // Case 3: Physical Attendance Punch (or Work From Home attendance record)
    if (att && (hasCheckIn || attStatusNorm === 'work from home' || attStatusNorm === 'wfh')) {
      let workHrs = Number(att.workingHours ?? att.working_hours ?? 0);
      if (workHrs <= 0 && hasCheckIn && hasCheckOut) {
        const session = resolveOvernightAttendanceSession({
          attendanceDate: dateStr,
          checkIn: rawCheckIn,
          checkOut: rawCheckOut,
          unpaidBreakMinutes: Number((att as any).breakDurationMinutes ?? (att as any).breakMinutes ?? 0),
          deductBreakAlways: Number((att as any).breakDurationMinutes ?? (att as any).breakMinutes ?? 0) > 0,
          otThresholdHours: stdShiftHours,
          allowAutoRollSameDateIsoCheckOut: true,
        });
        workHrs = session.isValid ? session.workingHours : 0;
      } else if (workHrs < 0) {
        workHrs = 0;
      }
      const isInProgress = hasCheckIn && !hasCheckOut && dateStr === todayIst;
      const isHalfDay =
        !isInProgress &&
        (attStatusNorm === 'half day' ||
          attStatusNorm === 'half-day' ||
          attStatusNorm === 'hd' ||
          Boolean(approvedLeave?.isHalfDay) ||
          (hasCheckOut && workHrs > 0 && workHrs < stdShiftHours * 0.7 && (attStatusNorm === 'present' || attStatusNorm === 'late')));

      const isLateArrival =
        !isHalfDay &&
        (attStatusNorm === 'late' ||
          (att.lateStatus && att.lateStatus !== 'On Time' && att.lateStatus !== 'N/A') ||
          Number(att.lateDurationMinutes || 0) > 0);

      if (isHoliday) {
        // Worked on a Holiday: holiday is already counted in holidaysCount (paidDays += 1), preserve punch & OT hours
        paidDays += 1;
        rows.push({
          ...att,
          id: att.id || `ATT-${canonicalEmpCode || 'EMP'}-${dateStr}`,
          employeeId: canonicalEmpCode,
          employeeName: canonicalEmpName,
          department: canonicalDept,
          date: dateStr,
          shiftDate: dateStr,
          checkIn: rawCheckIn,
          checkOut: rawCheckOut,
          workingHours: workHrs,
          status: 'Holiday',
          effectiveStatus: 'Holiday',
          isInProgress,
          isProvisional: isInProgress,
          isHoliday: true,
          isWeeklyOff,
          isScheduledWorkingDay: false,
          holidayLabel: holidayLabel || 'Holiday',
          workedDayEquivalent: 0,
          paidDayEquivalent: 1,
          provisionalDayEquivalent: 0,
          lopDayEquivalent: 0,
        });
        continue;
      }

      if (isHalfDay) {
        halfDays += 1;
        workedDays += 0.5;
        const pairedPaidLeave = approvedLeave && !approvedLeave.isUnpaid ? 0.5 : 0;
        if (pairedPaidLeave > 0) {
          paidLeaveDays += 0.5;
        }
        const dayPaid = 0.5 + pairedPaidLeave;
        const dayLop = pairedPaidLeave > 0 ? 0 : 0.5;
        paidDays += dayPaid;
        lopDays += dayLop;

        rows.push({
          ...att,
          id: att.id || `ATT-${canonicalEmpCode || 'EMP'}-${dateStr}`,
          employeeId: canonicalEmpCode,
          employeeName: canonicalEmpName,
          department: canonicalDept,
          date: dateStr,
          shiftDate: dateStr,
          checkIn: rawCheckIn,
          checkOut: rawCheckOut,
          workingHours: workHrs,
          status: 'Half Day',
          effectiveStatus: 'Half Day',
          isInProgress: false,
          isProvisional: false,
          isHoliday: false,
          isWeeklyOff: false,
          isScheduledWorkingDay: true,
          workedDayEquivalent: 0.5,
          paidDayEquivalent: dayPaid,
          provisionalDayEquivalent: 0,
          lopDayEquivalent: dayLop,
        });
        continue;
      }

      // Full-Day Present (or Late arrival on a full working day)
      fullPresentDays += 1;
      workedDays += 1;
      paidDays += 1;
      if (isLateArrival) {
        lateDays += 1;
      }
      if (isInProgress) {
        provisionalInProgressDays += 1;
      }

      const displayStatus: CanonicalCalendarDayStatus = isLateArrival ? 'Late' : 'Present';
      rows.push({
        ...att,
        id: att.id || `ATT-${canonicalEmpCode || 'EMP'}-${dateStr}`,
        employeeId: canonicalEmpCode,
        employeeName: canonicalEmpName,
        department: canonicalDept,
        date: dateStr,
        shiftDate: dateStr,
        checkIn: rawCheckIn,
        checkOut: rawCheckOut,
        workingHours: isInProgress ? 0 : workHrs,
        status: displayStatus,
        effectiveStatus: displayStatus,
        isInProgress,
        isProvisional: isInProgress,
        isHoliday: false,
        isWeeklyOff: false,
        isScheduledWorkingDay: true,
        workedDayEquivalent: 1,
        paidDayEquivalent: 1,
        provisionalDayEquivalent: isInProgress ? 1 : 0,
        lopDayEquivalent: 0,
      });
      continue;
    }

    // Case 4: Pending Leave Request (unapproved) on a Scheduled Working Day
    if (pendingLeave) {
      pendingLeaveDays += 1;
      absentDays += 1;
      lopDays += 1;
      rows.push({
        id: `LV-PENDING-${canonicalEmpCode || 'EMP'}-${dateStr}`,
        employeeId: canonicalEmpCode,
        employeeName: canonicalEmpName,
        department: canonicalDept,
        designation: emp.designation || '',
        avatar: emp.avatar || '',
        date: dateStr,
        shiftDate: dateStr,
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: 'Pending Leave',
        effectiveStatus: 'Pending Leave',
        isInProgress: false,
        isProvisional: false,
        isHoliday: false,
        isWeeklyOff: false,
        isScheduledWorkingDay: true,
        leaveRequestId: pendingLeave.id,
        leaveType: pendingLeave.leaveType,
        leaveStatus: 'Pending',
        method: 'Pending Approval',
        workedDayEquivalent: 0,
        paidDayEquivalent: 0,
        provisionalDayEquivalent: 0,
        lopDayEquivalent: 1,
      });
      continue;
    }

    // Case 5: Scheduled Working Day with no punch and no leave -> Absent (or Not Marked if today)
    const absentStatus: CanonicalCalendarDayStatus = dateStr === todayIst && !att ? 'Not Marked' : 'Absent';
    absentDays += 1;
    lopDays += 1;
    rows.push({
      id: att?.id || `ABS-${canonicalEmpCode || 'EMP'}-${dateStr}`,
      employeeId: canonicalEmpCode,
      employeeName: canonicalEmpName,
      department: canonicalDept,
      designation: emp.designation || '',
      avatar: emp.avatar || '',
      date: dateStr,
      shiftDate: dateStr,
      checkIn: null,
      checkOut: null,
      workingHours: 0,
      status: absentStatus,
      effectiveStatus: absentStatus,
      isInProgress: false,
      isProvisional: false,
      isHoliday: false,
      isWeeklyOff: false,
      isScheduledWorkingDay: true,
      method: 'System Auto',
      workedDayEquivalent: 0,
      paidDayEquivalent: 0,
      provisionalDayEquivalent: 0,
      lopDayEquivalent: 1,
    });
  }

  // Sort rows descending by date (latest date at top)
  rows.sort((a, b) => b.date.localeCompare(a.date));

  workedDays = Math.round(workedDays * 100) / 100;
  paidDays = Math.round(paidDays * 100) / 100;
  paidLeaveDays = Math.round(paidLeaveDays * 100) / 100;
  lopDays = Math.round(lopDays * 100) / 100;
  const confirmedPaidDays = Math.max(0, Math.round((paidDays - provisionalInProgressDays) * 100) / 100);

  return {
    monthKey,
    monthStart,
    monthEnd,
    cutoffDate: effectiveEnd,
    calendarDaysInMonth,
    calendarDaysElapsed,
    holidaysCount,
    scheduledWorkingDays,
    fullPresentDays,
    lateDays,
    halfDays,
    paidLeaveDays,
    unpaidLeaveDays,
    pendingLeaveDays,
    absentDays,
    workedDays,
    paidDays,
    confirmedPaidDays,
    provisionalInProgressDays,
    lopDays,
    rows,
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
  const breakMins = shift.breakDurationMinutes ?? 0;
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
  const rawSpanMins = checkoutTimelineMins - inMins!;
  const isInvalidOvernightSpan = outMins! < inMins! && rawSpanMins > MAX_OVERNIGHT_SESSION_MINUTES;
  const grossMins = isInvalidOvernightSpan ? 0 : Math.max(0, rawSpanMins);

  // Deduct break only if configured and worked duration exceeds standard half-shift
  const applicableBreakMins = (breakMins > 0 && grossMins > (breakMins + 120)) ? breakMins : 0;
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
  const earlyCheckoutMinutes = (!isInvalidOvernightSpan && checkoutTimelineMins < (shiftEndTimelineMins - earlyThreshold))
    ? (shiftEndTimelineMins - checkoutTimelineMins)
    : 0;

  // Potential OT calculation
  let potentialOtHours = 0;
  if (!isInvalidOvernightSpan && isOtEligible && otPolicy?.enabled !== false) {
    // OT Hours = Actual Eligible Working Hours - Required Working Hours
    const rawOtHours = Math.max(0, workedHours - reqHours);
    const minOtDurationMins = otPolicy?.minimumOtDurationMinutes ?? 30;
    const minOtHours = minOtDurationMins / 60;

    if (rawOtHours >= minOtHours) {
      const enforceCap = Boolean((otPolicy as any)?.enforceDailyOtCap);
      const maxDaily = otPolicy?.maximumDailyOtHours;
      potentialOtHours = (enforceCap && maxDaily && maxDaily > 0) ? Math.min(rawOtHours, maxDaily) : rawOtHours;
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
    params.overtimePolicy?.regularMultiplier ??
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
      const breakMins = Number((att as any).breakMinutes ?? (att as any).breakDurationMinutes ?? 0);
      const session = resolveOvernightAttendanceSession({
        attendanceDate: String(att.shiftDate || att.date),
        checkIn: att.checkIn,
        checkOut: att.checkOut,
        unpaidBreakMinutes: breakMins,
        deductBreakAlways: false,
        otThresholdHours: shiftHours,
        allowAutoRollSameDateIsoCheckOut: true,
      });
      workedHours = session.isValid ? session.workingHours : 0;
    } else if (workedHours < 0) {
      workedHours = 0;
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

    const enforceCap = Boolean((overtimePolicy as any)?.enforceDailyOtCap || (elig as any)?.enforceDailyOtCap);
    const maxCapVal = Number(elig.maxDailyOt || overtimePolicy?.maximumDailyOtHours || 0);
    const cappedExtraHours = (enforceCap && maxCapVal > 0) ? Math.min(rawExtraHours, maxCapVal) : rawExtraHours;
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

    let rawWorkHrs = Number(rec?.workingHours ?? (rec as any)?.workHours ?? 0);
    if (rawWorkHrs <= 0 && rec?.checkIn && rec?.checkOut) {
      const breakMins = Number((rec as any)?.breakDurationMinutes ?? (rec as any)?.breakMinutes ?? 0);
      const session = resolveOvernightAttendanceSession({
        attendanceDate: dateKey,
        checkIn: rec.checkIn,
        checkOut: rec.checkOut,
        unpaidBreakMinutes: breakMins,
        deductBreakAlways: breakMins > 0,
        otThresholdHours: stdShiftHours,
        allowAutoRollSameDateIsoCheckOut: true,
      });
      rawWorkHrs = session.isValid ? session.workingHours : 0;
    } else if (rawWorkHrs < 0) {
      rawWorkHrs = 0;
    }
    const workHrs = Math.round((rawWorkHrs + Number.EPSILON) * 100) / 100;
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

export const MAX_OVERNIGHT_SESSION_MINUTES = 18 * 60; // 18 hours maximum permissible single attendance session
export const DEFAULT_COMPANY_TIMEZONE = 'Asia/Kolkata';

export function toTimezoneWallClockDate(instant: Date = new Date(), timeZone: string = DEFAULT_COMPANY_TIMEZONE): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(instant);
    const map: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        map[part.type] = parseInt(part.value, 10);
      }
    }
    const hour = map.hour === 24 ? 0 : map.hour;
    return new Date(
      map.year,
      (map.month || 1) - 1,
      map.day || 1,
      hour || 0,
      map.minute || 0,
      map.second || 0,
      instant.getMilliseconds()
    );
  } catch {
    return new Date(instant.getTime());
  }
}

function toWallDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeCalendarDateStr(raw?: string | Date | null, timeZone: string = DEFAULT_COMPANY_TIMEZONE): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return '';
    return toWallDateStr(toTimezoneWallClockDate(raw, timeZone));
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(str)) {
    const [d, m, y] = str.split(/[/-]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (str.includes('T') || (str.includes('-') && str.includes(':'))) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return toWallDateStr(toTimezoneWallClockDate(parsed, timeZone));
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return '';
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const clean = normalizeCalendarDateStr(dateStr);
  if (!clean) return dateStr;
  const [y, m, d] = clean.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  const ry = utc.getUTCFullYear();
  const rm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(utc.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export function formatDurationHoursAndMinutes(totalMinutes: number): string {
  const safeMins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hrs = Math.floor(safeMins / 60);
  const mins = safeMins % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

export function parseTimeOrIsoInTimezone(
  raw: string | Date | null | undefined,
  anchorDateStr: string,
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): {
  instant: Date;
  wallDateStr: string;
  hours: number;
  minutes: number;
  seconds: number;
  hasExplicitDate: boolean;
  display12: string;
} | null {
  if (!raw) return null;
  const cleanAnchor = normalizeCalendarDateStr(anchorDateStr, timeZone);
  if (!cleanAnchor) return null;

  const buildKolInstant = (ymd: string, h: number, m: number, s: number): Date | null => {
    const [yy, mm, dd] = ymd.split('-').map(Number);
    if (!yy || !mm || !dd) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') {
      const d = new Date(`${yy}-${pad(mm)}-${pad(dd)}T${pad(h)}:${pad(m)}:${pad(s)}+05:30`);
      return isNaN(d.getTime()) ? null : d;
    }
    const utcGuess = new Date(Date.UTC(yy, mm - 1, dd, h, m, s));
    const wallAtGuess = toTimezoneWallClockDate(utcGuess, timeZone);
    const diffMs = utcGuess.getTime() - Date.UTC(
      wallAtGuess.getFullYear(),
      wallAtGuess.getMonth(),
      wallAtGuess.getDate(),
      wallAtGuess.getHours(),
      wallAtGuess.getMinutes(),
      wallAtGuess.getSeconds()
    );
    return new Date(utcGuess.getTime() + diffMs);
  };

  const to12Hr = (h24: number, m: number): string => {
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    const wall = toTimezoneWallClockDate(raw, timeZone);
    const wallDateStr = toWallDateStr(wall);
    return {
      instant: new Date(raw.getTime()),
      wallDateStr,
      hours: wall.getHours(),
      minutes: wall.getMinutes(),
      seconds: wall.getSeconds(),
      hasExplicitDate: true,
      display12: to12Hr(wall.getHours(), wall.getMinutes()),
    };
  }

  const str = String(raw).trim();
  if (!str || str === '--:--' || str === '—' || str === '-' || str.toLowerCase().includes('progress') || str.toLowerCase().includes('missed') || str.toLowerCase().includes('none')) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(str)) {
    const hasOffset = /[Zz]|[+-]\d{2}:?\d{2}$/.test(str);
    const normalizedIso = hasOffset ? str.replace(' ', 'T') : `${str.replace(' ', 'T')}+05:30`;
    const parsed = new Date(normalizedIso);
    if (!isNaN(parsed.getTime())) {
      const wall = toTimezoneWallClockDate(parsed, timeZone);
      const wallDateStr = toWallDateStr(wall);
      return {
        instant: parsed,
        wallDateStr,
        hours: wall.getHours(),
        minutes: wall.getMinutes(),
        seconds: wall.getSeconds(),
        hasExplicitDate: true,
        display12: to12Hr(wall.getHours(), wall.getMinutes()),
      };
    }
  }

  const normalizedTime = str.replace(/\./g, ':');
  const match = normalizedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|A|P)?$/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  const mer = match[4]?.toUpperCase();

  if (isNaN(h) || isNaN(m) || isNaN(s) || m < 0 || m > 59 || s < 0 || s > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    const isPM = mer.startsWith('P');
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
  } else if (h < 0 || h > 23) {
    return null;
  }

  const instant = buildKolInstant(cleanAnchor, h, m, s);
  if (!instant) return null;

  return {
    instant,
    wallDateStr: cleanAnchor,
    hours: h,
    minutes: m,
    seconds: s,
    hasExplicitDate: false,
    display12: to12Hr(h, m),
  };
}

export interface OvernightSessionResolution {
  isValid: boolean;
  errorCode?:
    | 'MISSING_CHECK_IN'
    | 'MISSING_CHECK_OUT'
    | 'INVALID_REVERSED_TIMESTAMPS'
    | 'EXCEEDS_MAX_SESSION_LENGTH'
    | 'OVERLAPS_NEXT_SHIFT';
  errorMessage?: string;
  attendanceDate: string;
  checkInDate: string;
  checkOutDate: string | null;
  checkInIso: string | null;
  checkOutIso: string | null;
  checkInDisplay: string | null;
  checkOutDisplay: string | null;
  isOvernight: boolean;
  elapsedMinutes: number;
  breakDeductedMinutes: number;
  netWorkedMinutes: number;
  workingHours: number;
  formattedWorkingDuration: string;
  otMinutes: number;
  otHours: number;
  formattedOtDuration: string;
}

export function resolveOvernightAttendanceSession(params: {
  attendanceDate: string;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  checkOutDate?: string | null;
  unpaidBreakMinutes?: number;
  deductBreakAlways?: boolean;
  otThresholdHours?: number;
  otEligible?: boolean;
  minOtDurationMinutes?: number;
  maxDailyOtHours?: number;
  enforceDailyOtCap?: boolean;
  otRoundingMinutes?: number;
  maxSessionMinutes?: number;
  nextDayCheckIn?: string | Date | null;
  allowAutoRollSameDateIsoCheckOut?: boolean;
  timeZone?: string;
}): OvernightSessionResolution {
  const timeZone = params.timeZone || DEFAULT_COMPANY_TIMEZONE;
  const attendanceDate =
    normalizeCalendarDateStr(params.attendanceDate, timeZone) ||
    toWallDateStr(toTimezoneWallClockDate(new Date(), timeZone));
  const maxSessionMinutes =
    params.maxSessionMinutes !== undefined && params.maxSessionMinutes > 0
      ? params.maxSessionMinutes
      : MAX_OVERNIGHT_SESSION_MINUTES;

  const emptyResult = (
    errorCode: OvernightSessionResolution['errorCode'],
    errorMessage: string,
    inParsed?: ReturnType<typeof parseTimeOrIsoInTimezone> | null
  ): OvernightSessionResolution => ({
    isValid: false,
    errorCode,
    errorMessage,
    attendanceDate,
    checkInDate: inParsed?.wallDateStr || attendanceDate,
    checkOutDate: null,
    checkInIso: inParsed?.instant ? inParsed.instant.toISOString() : null,
    checkOutIso: null,
    checkInDisplay: inParsed?.display12 || null,
    checkOutDisplay: null,
    isOvernight: false,
    elapsedMinutes: 0,
    breakDeductedMinutes: 0,
    netWorkedMinutes: 0,
    workingHours: 0,
    formattedWorkingDuration: '0h 00m',
    otMinutes: 0,
    otHours: 0,
    formattedOtDuration: '0h 00m',
  });

  const inParsed = parseTimeOrIsoInTimezone(params.checkIn, attendanceDate, timeZone);
  if (!inParsed) {
    return emptyResult('MISSING_CHECK_IN', 'Valid check-in time is required.');
  }

  const explicitOutAnchor = params.checkOutDate
    ? normalizeCalendarDateStr(params.checkOutDate, timeZone) || attendanceDate
    : inParsed.wallDateStr;
  const outParsedInitial = parseTimeOrIsoInTimezone(params.checkOut, explicitOutAnchor, timeZone);
  if (!outParsedInitial) {
    return emptyResult('MISSING_CHECK_OUT', 'Check-out time is not yet recorded.', inParsed);
  }

  let resolvedOut = outParsedInitial;
  const rawDiffMs = resolvedOut.instant.getTime() - inParsed.instant.getTime();

  if (rawDiffMs < 0) {
    const hasExplicitEarlierDate =
      (Boolean(params.checkOutDate) && normalizeCalendarDateStr(params.checkOutDate, timeZone) < inParsed.wallDateStr) ||
      (outParsedInitial.hasExplicitDate && outParsedInitial.wallDateStr < inParsed.wallDateStr);

    const canEvaluateNextDayRoll =
      !hasExplicitEarlierDate &&
      (!outParsedInitial.hasExplicitDate ||
        (params.allowAutoRollSameDateIsoCheckOut !== false && outParsedInitial.wallDateStr === inParsed.wallDateStr));

    if (!canEvaluateNextDayRoll) {
      return emptyResult(
        'INVALID_REVERSED_TIMESTAMPS',
        'Check-out timestamp is earlier than check-in timestamp.',
        inParsed
      );
    }

    const nextDayStr = addDaysToDateStr(inParsed.wallDateStr, 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const nextDayTimeStr = `${pad(outParsedInitial.hours)}:${pad(outParsedInitial.minutes)}:${pad(outParsedInitial.seconds)}`;
    const candidateNextDayOut = parseTimeOrIsoInTimezone(nextDayTimeStr, nextDayStr, timeZone);
    if (!candidateNextDayOut) {
      return emptyResult('INVALID_REVERSED_TIMESTAMPS', 'Unable to resolve overnight check-out timestamp.', inParsed);
    }

    const candidateElapsedMinutes = Math.round(
      (candidateNextDayOut.instant.getTime() - inParsed.instant.getTime()) / 60_000
    );

    if (candidateElapsedMinutes <= 0 || candidateElapsedMinutes > maxSessionMinutes) {
      return emptyResult(
        'INVALID_REVERSED_TIMESTAMPS',
        `Check-out time (${outParsedInitial.display12}) is earlier than check-in time (${inParsed.display12}) and rolling to the next day (${formatDurationHoursAndMinutes(candidateElapsedMinutes)}) exceeds the maximum permissible session duration (${Math.round(maxSessionMinutes / 60)} hours).`,
        inParsed
      );
    }

    resolvedOut = candidateNextDayOut;
  }

  const elapsedMinutes = Math.round((resolvedOut.instant.getTime() - inParsed.instant.getTime()) / 60_000);
  if (elapsedMinutes < 0) {
    return emptyResult('INVALID_REVERSED_TIMESTAMPS', 'Check-out timestamp cannot be earlier than check-in timestamp.', inParsed);
  }
  if (elapsedMinutes > maxSessionMinutes) {
    return emptyResult(
      'EXCEEDS_MAX_SESSION_LENGTH',
      `Attendance session duration (${formatDurationHoursAndMinutes(elapsedMinutes)}) exceeds the maximum permissible session duration (${Math.round(maxSessionMinutes / 60)} hours).`,
      inParsed
    );
  }

  if (params.nextDayCheckIn) {
    const nextDayAnchor = addDaysToDateStr(inParsed.wallDateStr, 1);
    const nextDayInParsed = parseTimeOrIsoInTimezone(params.nextDayCheckIn, nextDayAnchor, timeZone);
    if (nextDayInParsed && resolvedOut.instant.getTime() > nextDayInParsed.instant.getTime()) {
      return emptyResult(
        'OVERLAPS_NEXT_SHIFT',
        `Overnight check-out (${resolvedOut.display12} on ${resolvedOut.wallDateStr}) overlaps with next shift check-in (${nextDayInParsed.display12} on ${nextDayInParsed.wallDateStr}).`,
        inParsed
      );
    }
  }

  const rawBreakMins = Math.max(0, Math.round(Number(params.unpaidBreakMinutes) || 0));
  const breakDeductedMinutes =
    rawBreakMins > 0 && (params.deductBreakAlways || elapsedMinutes > rawBreakMins + 120)
      ? Math.min(elapsedMinutes, rawBreakMins)
      : 0;

  const netWorkedMinutes = Math.max(0, elapsedMinutes - breakDeductedMinutes);
  const workingHours = Math.round((netWorkedMinutes / 60 + Number.EPSILON) * 100) / 100;

  const thresholdHours =
    params.otThresholdHours !== undefined && Number(params.otThresholdHours) > 0
      ? Number(params.otThresholdHours)
      : 9;
  const thresholdMinutes = Math.round(thresholdHours * 60);
  const otEligible = params.otEligible !== false;
  const minOtDurationMinutes =
    params.minOtDurationMinutes !== undefined && Number(params.minOtDurationMinutes) >= 0
      ? Number(params.minOtDurationMinutes)
      : 0;

  let otMinutes = 0;
  if (otEligible && netWorkedMinutes > thresholdMinutes) {
    const rawOtMinutes = netWorkedMinutes - thresholdMinutes;
    if (rawOtMinutes >= minOtDurationMinutes) {
      otMinutes = rawOtMinutes;
      if (params.otRoundingMinutes && params.otRoundingMinutes > 1) {
        const r = Math.round(params.otRoundingMinutes);
        otMinutes = Math.floor(otMinutes / r) * r;
      }
      if (params.enforceDailyOtCap && params.maxDailyOtHours && params.maxDailyOtHours > 0) {
        const capMinutes = Math.round(params.maxDailyOtHours * 60);
        otMinutes = Math.min(otMinutes, capMinutes);
      }
    }
  }

  const otHours = Math.round((otMinutes / 60 + Number.EPSILON) * 100) / 100;
  const isOvernight = resolvedOut.wallDateStr > inParsed.wallDateStr;

  return {
    isValid: true,
    attendanceDate,
    checkInDate: inParsed.wallDateStr,
    checkOutDate: resolvedOut.wallDateStr,
    checkInIso: inParsed.instant.toISOString(),
    checkOutIso: resolvedOut.instant.toISOString(),
    checkInDisplay: inParsed.display12,
    checkOutDisplay: resolvedOut.display12,
    isOvernight,
    elapsedMinutes,
    breakDeductedMinutes,
    netWorkedMinutes,
    workingHours,
    formattedWorkingDuration: formatDurationHoursAndMinutes(netWorkedMinutes),
    otMinutes,
    otHours,
    formattedOtDuration: formatDurationHoursAndMinutes(otMinutes),
  };
}

/**
 * Resolves accurate formatted working and OT durations for an attendance record.
 * Calculates from original punch-in and punch-out timestamps (including seconds, overnight shifts,
 * and existing break rules) when available. Falls back to stored decimal hours if timestamps
 * are not available.
 * 
 * Example: 09:51 AM to 06:40 PM -> 529 minutes -> "8h 49m" (stored as 8.82 decimal hours).
 */
export function formatRecordWorkingAndOtDurations(
  rec: any,
  options?: {
    assignedShift?: any;
    overtimePolicy?: any;
    timeZone?: string;
  }
): {
  workingDuration: string;
  otDuration: string;
  workingMinutes: number;
  otMinutes: number;
} {
  if (!rec) {
    return {
      workingDuration: '0h 00m',
      otDuration: '0h 00m',
      workingMinutes: 0,
      otMinutes: 0,
    };
  }

  const hasIn = Boolean(
    rec.checkIn &&
    rec.checkIn !== '--:--' &&
    rec.checkIn !== '—' &&
    rec.checkIn !== '-' &&
    String(rec.checkIn).trim() !== ''
  );
  const hasOut = Boolean(
    rec.checkOut &&
    rec.checkOut !== '--:--' &&
    rec.checkOut !== '—' &&
    rec.checkOut !== '-' &&
    String(rec.checkOut).trim() !== '' &&
    !String(rec.checkOut).toLowerCase().includes('progress')
  );

  // If check-in exists but check-out is missing or in progress
  if (hasIn && !hasOut) {
    const isExplicitProgress = String(rec.checkOut || '').toLowerCase().includes('progress') || rec.status === 'Present';
    return {
      workingDuration: isExplicitProgress ? 'In Progress' : '0h 00m',
      otDuration: '0h 00m',
      workingMinutes: 0,
      otMinutes: 0,
    };
  }

  // If both punch-in and punch-out are recorded, calculate directly from timestamps
  if (hasIn && hasOut) {
    const attendanceDate = normalizeCalendarDateStr(rec.shiftDate || rec.date || new Date());
    const breakMins = Number(rec.breakDurationMinutes ?? rec.breakMinutes ?? 0);
    const session = resolveOvernightAttendanceSession({
      attendanceDate,
      checkIn: rec.checkIn,
      checkOut: rec.checkOut,
      checkOutDate: rec.checkOutDate || null,
      unpaidBreakMinutes: breakMins,
      deductBreakAlways: breakMins > 0,
      allowAutoRollSameDateIsoCheckOut: true,
      timeZone: options?.timeZone || DEFAULT_COMPANY_TIMEZONE,
    });

    if (session.isValid) {
      const explicitOt = Number(
        rec.approvedOtHours ??
        rec.overtimeHours ??
        rec.otHours ??
        (rec.dailyOt ? rec.dailyOt.otHrs : 0) ??
        0
      );
      const otDuration =
        explicitOt > 0
          ? formatHoursAndMinutes(explicitOt)
          : session.formattedOtDuration || '0h 00m';

      return {
        workingDuration: session.formattedWorkingDuration,
        otDuration,
        workingMinutes: session.netWorkedMinutes,
        otMinutes: explicitOt > 0 ? Math.round(explicitOt * 60) : session.otMinutes,
      };
    }
  }

  // Fallback to stored decimal hours if timestamps cannot be resolved
  const rawWorkingHours = Number(rec.workingHours ?? rec.working_hours ?? 0);
  const explicitOt = Number(
    rec.approvedOtHours ??
    rec.overtimeHours ??
    rec.otHours ??
    (rec.dailyOt ? rec.dailyOt.otHrs : 0) ??
    0
  );

  return {
    workingDuration: formatHoursAndMinutes(rawWorkingHours),
    otDuration: formatHoursAndMinutes(explicitOt),
    workingMinutes: Math.round(Math.max(0, rawWorkingHours) * 60),
    otMinutes: Math.round(Math.max(0, explicitOt) * 60),
  };
}

