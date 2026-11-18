/**
 * Current-month helpers (Asia/Kolkata local time, not UTC) so dashboards/labels always follow
 * the real calendar month instead of a hard-coded month.
 */

import {
  getIstTodayDateStr,
  isDateCompanyPaidHoliday,
  isDateEmployeeWeeklyOff,
} from '../services/attendanceCalculationEngine';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DD" in Asia/Kolkata timezone (avoids the UTC shift of toISOString()). */
export const getLocalDateStr = (d: Date = new Date()): string => getIstTodayDateStr(d);

export interface MonthInfo {
  year: number;
  /** 0-based month index */
  monthIndex: number;
  /** "YYYY-MM" */
  monthKey: string;
  /** "YYYY-MM-01" */
  monthStart: string;
  /** "YYYY-MM-<last day>" */
  monthEnd: string;
  /** Local "YYYY-MM-DD" for today */
  todayStr: string;
  /** "Oct" */
  monthShort: string;
  /** "October" */
  monthLong: string;
  /** "Oct 2026" */
  label: string;
  /** "OCT 2026" */
  labelUpper: string;
  /** "October 2026" */
  fullLabel: string;
  daysInMonth: number;
  /** Working days in the whole month (excluding weekly offs & company holidays) */
  workingDays: number;
  /** Working days from the 1st up to and including today (excluding weekly offs & company holidays) */
  elapsedWorkingDays: number;
  /** Elapsed calendar days up to today */
  elapsedCalendarDays: number;
  /** Elapsed holidays & weekly offs up to today */
  elapsedHolidays: number;
}

export interface GetMonthInfoOptions {
  holidays?: any[];
  weeklyOff?: string | string[] | null;
  weeklySchedules?: any[];
  employeeLocation?: string;
}

export const getMonthInfo = (ref: Date = new Date(), options?: GetMonthInfoOptions): MonthInfo => {
  const istToday = getIstTodayDateStr(ref);
  const [istYear, istMonthNum, istDay] = istToday.split('-').map(Number);
  const year = istYear || ref.getFullYear();
  const monthIndex = istMonthNum ? istMonthNum - 1 : ref.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = istDay || ref.getDate();
  const monthKey = `${year}-${pad(monthIndex + 1)}`;

  let workingDays = 0;
  let elapsedWorkingDays = 0;
  let elapsedHolidays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${monthKey}-${pad(day)}`;
    const localDate = new Date(year, monthIndex, day, 12, 0, 0);
    const isWeeklyOff = isDateEmployeeWeeklyOff(localDate, options?.weeklyOff, options?.weeklySchedules).isWeeklyOff;
    const isHoliday = isDateCompanyPaidHoliday(dateStr, options?.holidays, options?.employeeLocation).isHoliday;
    if (isWeeklyOff || isHoliday) {
      if (day <= today) elapsedHolidays++;
      continue;
    }
    workingDays++;
    if (day <= today) elapsedWorkingDays++;
  }

  return {
    year,
    monthIndex,
    monthKey,
    monthStart: `${monthKey}-01`,
    monthEnd: `${monthKey}-${pad(daysInMonth)}`,
    todayStr: istToday,
    monthShort: MONTH_SHORT[monthIndex],
    monthLong: MONTH_LONG[monthIndex],
    label: `${MONTH_SHORT[monthIndex]} ${year}`,
    labelUpper: `${MONTH_SHORT[monthIndex].toUpperCase()} ${year}`,
    fullLabel: `${MONTH_LONG[monthIndex]} ${year}`,
    daysInMonth,
    workingDays,
    elapsedWorkingDays,
    elapsedCalendarDays: Math.min(today, daysInMonth),
    elapsedHolidays,
  };
};

/** True when a "YYYY-MM-DD..." date string falls in the given month. */
export const isDateInMonth = (dateStr: string | undefined | null, info: MonthInfo): boolean =>
  !!dateStr && String(dateStr).slice(0, 7) === info.monthKey;

/** Number of non-Sunday days of a leave range that fall inside the month (up to today). */
export const countLeaveDaysInMonth = (
  startDate: string | undefined,
  endDate: string | undefined,
  info: MonthInfo,
  uptoToday = true
): number => {
  if (!startDate) return 0;
  const start = startDate.slice(0, 10);
  const end = (endDate || startDate).slice(0, 10);
  const rangeStart = start > info.monthStart ? start : info.monthStart;
  const limit = uptoToday && info.todayStr < info.monthEnd ? info.todayStr : info.monthEnd;
  const rangeEnd = end < limit ? end : limit;
  if (rangeStart > rangeEnd) return 0;

  const [ys, ms, ds] = rangeStart.split('-').map(Number);
  const [ye, me, de] = rangeEnd.split('-').map(Number);
  const cursor = new Date(ys, ms - 1, ds);
  const last = new Date(ye, me - 1, de);
  let count = 0;
  while (cursor <= last) {
    if (cursor.getDay() !== 0) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};
