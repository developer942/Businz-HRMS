import { ShiftRecord, AttendanceLogRecord, ShiftWindowState, ShiftWindowEvaluation } from '../types/hrms.js';

export const PRE_SHIFT_CHECKIN_BUFFER_MINUTES = 180; // Strictly 3 hours before shift start
export const DEFAULT_COMPANY_TIMEZONE = 'Asia/Kolkata';

/**
 * Converts an authoritative server instant (`Date`) into a wall-clock `Date` object
 * in the configured IANA timezone (default `Asia/Kolkata`), so `.getFullYear()`, `.getMonth()`,
 * `.getDate()`, `.getHours()`, `.getMinutes()`, `.getSeconds()` reflect the company timezone
 * regardless of the OS timezone of the server container.
 */
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

/**
 * Formats a 24h HH:mm time string or Date into 12-hour AM/PM display (e.g., "09:00 AM").
 */
export function formatMinutesOrDateToAmPm(date: Date): string {
  const h24 = date.getHours();
  const m = date.getMinutes();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatTimeStrToAmPm(timeStr: string): string {
  const { hours, minutes } = parseShiftTime(timeStr);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

/**
 * Parses HH:mm or HH:mm AM/PM into { hours, minutes } in 24h format
 */
export function parseShiftTime(timeStr: string): { hours: number; minutes: number } {
  if (!timeStr) return { hours: 9, minutes: 0 };
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  const timePart = clean.replace(/AM|PM/g, '').trim();
  const [hStr, mStr] = timePart.split(':');
  let hours = parseInt(hStr, 10) || 0;
  const minutes = parseInt(mStr, 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return { hours, minutes };
}

/**
 * Formats Date object to YYYY-MM-DD
 */
export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates shift start, shift end, 3-hour early check-in open time, and grace cutoff
 * for a given shiftDate (YYYY-MM-DD) and ShiftRecord.
 * Handles overnight shifts (where endTime <= startTime).
 */
export function calculateShiftDateTimes(
  shiftDateStr: string,
  shift: ShiftRecord,
  earlyWindowMinutes = PRE_SHIFT_CHECKIN_BUFFER_MINUTES,
  policyGraceMinutes?: number
): {
  shiftStartDateTime: Date;
  shiftEndDateTime: Date;
  earlyCheckInDateTime: Date;
  graceEndDateTime: Date;
  effectiveGraceMins: number;
  isNightShift: boolean;
} {
  const [year, month, day] = shiftDateStr.split('-').map(Number);
  const start = parseShiftTime(shift.startTime);
  const end = parseShiftTime(shift.endTime);

  const shiftStartDateTime = new Date(year, month - 1, day, start.hours, start.minutes, 0, 0);
  const shiftEndDateTime = new Date(year, month - 1, day, end.hours, end.minutes, 0, 0);

  let isNightShift = false;
  if (shiftEndDateTime.getTime() <= shiftStartDateTime.getTime()) {
    shiftEndDateTime.setDate(shiftEndDateTime.getDate() + 1);
    isNightShift = true;
  }

  const earlyCheckInDateTime = new Date(shiftStartDateTime.getTime() - earlyWindowMinutes * 60 * 1000);
  const effectiveGraceMins =
    policyGraceMinutes !== undefined && Number.isFinite(policyGraceMinutes) && policyGraceMinutes >= 0
      ? policyGraceMinutes
      : shift.gracePeriodMins ?? 40;
  const graceEndDateTime = new Date(shiftStartDateTime.getTime() + effectiveGraceMins * 60 * 1000);

  return {
    shiftStartDateTime,
    shiftEndDateTime,
    earlyCheckInDateTime,
    graceEndDateTime,
    effectiveGraceMins,
    isNightShift,
  };
}

/**
 * Authoritative Backend Shift Window Evaluator.
 * Enforces:
 * - Check-in opens strictly 3 hours before assigned shift start.
 * - Never blocks check-in at shift start or after grace period.
 * - Allows late check-in throughout the shift attendance window.
 * - Uses Late Policy grace period to determine whether check-in is Present or Late.
 * - Handles overnight shifts, multiple shifts, holidays, and approved leaves.
 */
export function evaluateBackendShiftAttendance(params: {
  employeeId: string;
  assignedShift: ShiftRecord;
  attendanceLogs: AttendanceLogRecord[];
  now?: Date;
  earlyWindowMinutes?: number;
  policyGraceMinutes?: number;
  timeZone?: string;
  useTimeZoneWallClock?: boolean;
  holidayInfo?: { isHoliday: boolean; holidayName?: string };
  leaveInfo?: { isOnApprovedLeave: boolean; leaveType?: string };
}): ShiftWindowEvaluation {
  const {
    employeeId,
    assignedShift,
    attendanceLogs,
    now: nowInput,
    earlyWindowMinutes = PRE_SHIFT_CHECKIN_BUFFER_MINUTES,
    policyGraceMinutes,
    timeZone = DEFAULT_COMPANY_TIMEZONE,
    useTimeZoneWallClock = false,
    holidayInfo,
    leaveInfo,
  } = params;

  const rawNow = nowInput || new Date();
  const now = useTimeZoneWallClock ? toTimezoneWallClockDate(rawNow, timeZone) : rawNow;

  const todayStr = toDateStr(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toDateStr(yesterdayDate);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrowDate);

  const empIdLower = String(employeeId || '').trim().toLowerCase();
  const empLogs = attendanceLogs.filter(
    (r) => String(r.employeeId || '').trim().toLowerCase() === empIdLower
  );

  const hasValidIn = (r?: AttendanceLogRecord) =>
    Boolean(r?.checkIn && r.checkIn !== '--:--' && r.checkIn.trim() !== '');
  const hasValidOut = (r?: AttendanceLogRecord) =>
    Boolean(r?.checkOut && r.checkOut !== '--:--' && r.checkOut.trim() !== '');

  const pickBestRecordForDate = (targetDate: string): AttendanceLogRecord | undefined => {
    const matches = empLogs.filter((r) => (r.shiftDate || r.date) === targetDate || r.date === targetDate);
    if (matches.length <= 1) return matches[0];
    return (
      matches.find((r) => hasValidIn(r) && !hasValidOut(r)) ||
      matches.find((r) => hasValidIn(r) && hasValidOut(r)) ||
      matches.find((r) => hasValidIn(r)) ||
      matches[0]
    );
  };

  // 1. Check if employee has an open check-in from yesterday (overnight shift still in progress)
  const yesterdayRecord = pickBestRecordForDate(yesterdayStr);
  const todayRecord = pickBestRecordForDate(todayStr);

  let targetShiftDateStr = todayStr;
  let activeRecord: AttendanceLogRecord | undefined = todayRecord;

  if (yesterdayRecord && hasValidIn(yesterdayRecord) && !hasValidOut(yesterdayRecord) && (!todayRecord || !hasValidIn(todayRecord))) {
    const yTimes = calculateShiftDateTimes(yesterdayStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    const todayTimes = calculateShiftDateTimes(todayStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    const [yYear, yMonth, yDay] = yesterdayStr.split('-').map(Number);
    const yInParsed = parseShiftTime(yesterdayRecord.checkIn || assignedShift.startTime);
    const yCheckInWall = new Date(yYear, (yMonth || 1) - 1, yDay || 1, yInParsed.hours, yInParsed.minutes, 0, 0);
    const elapsedSinceYesterdayInMs = now.getTime() - yCheckInWall.getTime();
    const maxOvernightElapsedMs = MAX_OVERNIGHT_SESSION_MINUTES * 60 * 1000;

    if (yTimes.isNightShift) {
      const maxCheckoutCutoff = new Date(yTimes.shiftEndDateTime.getTime() + 8 * 60 * 60 * 1000);
      if (now.getTime() <= maxCheckoutCutoff.getTime() && elapsedSinceYesterdayInMs <= maxOvernightElapsedMs) {
        targetShiftDateStr = yesterdayStr;
        activeRecord = yesterdayRecord;
      }
    } else {
      // Day shift working extended overnight overtime past midnight (e.g., 10:04 AM to 01:00 AM next day):
      // Keep yesterday's unclosed session active for punch-out until today's early check-in window opens (and within 18h max session).
      const maxCheckoutCutoffMs = Math.min(
        yCheckInWall.getTime() + maxOvernightElapsedMs,
        todayTimes.earlyCheckInDateTime.getTime() - 60 * 1000
      );
      if (elapsedSinceYesterdayInMs > 0 && now.getTime() <= maxCheckoutCutoffMs) {
        targetShiftDateStr = yesterdayStr;
        activeRecord = yesterdayRecord;
      }
    }
  } else if (!todayRecord) {
    // Also check if assignedShift is an overnight shift that started yesterday and is STILL within its active shift window right now
    const yTimes = calculateShiftDateTimes(yesterdayStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    const yesterdayCompleted = Boolean(yesterdayRecord && hasValidIn(yesterdayRecord) && hasValidOut(yesterdayRecord));
    if (
      yTimes.isNightShift &&
      !yesterdayCompleted &&
      now.getTime() >= yTimes.earlyCheckInDateTime.getTime() &&
      now.getTime() <= yTimes.shiftEndDateTime.getTime()
    ) {
      targetShiftDateStr = yesterdayStr;
      activeRecord = yesterdayRecord;
    }
  }

  // 2. If today's shift is already completed (checked in AND checked out), advance to tomorrow's shift
  if (activeRecord && hasValidIn(activeRecord) && hasValidOut(activeRecord)) {
    const nextTimes = calculateShiftDateTimes(tomorrowStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    const diffMs = Math.max(0, nextTimes.earlyCheckInDateTime.getTime() - now.getTime());
    const countdownSeconds = Math.floor(diffMs / 1000);

    return {
      state: 'WAITING_FOR_NEXT_SHIFT',
      canCheckIn: false,
      canCheckOut: false,
      assignedShift,
      shiftDate: tomorrowStr,
      shiftStartDateTime: nextTimes.shiftStartDateTime.toISOString(),
      shiftEndDateTime: nextTimes.shiftEndDateTime.toISOString(),
      earlyCheckInDateTime: nextTimes.earlyCheckInDateTime.toISOString(),
      graceEndDateTime: nextTimes.graceEndDateTime.toISOString(),
      countdownSeconds,
      isWithinGrace: false,
      isLateCheckIn: false,
      activeAttendance: activeRecord,
      message: `Completed today's shift (${assignedShift.shiftName}). Next check-in opens tomorrow at ${formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime)}.`,
      shiftStartDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftStartDateTime),
      shiftEndDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftEndDateTime),
      checkInOpenDisplay: formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime),
      gracePeriodMins: nextTimes.effectiveGraceMins,
      lateAfterDisplay: formatMinutesOrDateToAmPm(nextTimes.graceEndDateTime),
      expectedStatus: 'Present',
      timeZone,
      isHoliday: Boolean(holidayInfo?.isHoliday),
      holidayName: holidayInfo?.holidayName,
      isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
      leaveType: leaveInfo?.leaveType,
    };
  }

  const times = calculateShiftDateTimes(targetShiftDateStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);

  // 3. If employee is currently Checked In (and not Checked Out)
  if (activeRecord && hasValidIn(activeRecord) && !hasValidOut(activeRecord)) {
    return {
      state: 'CHECKED_IN',
      canCheckIn: false,
      canCheckOut: true,
      assignedShift,
      shiftDate: targetShiftDateStr,
      shiftStartDateTime: times.shiftStartDateTime.toISOString(),
      shiftEndDateTime: times.shiftEndDateTime.toISOString(),
      earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
      graceEndDateTime: times.graceEndDateTime.toISOString(),
      countdownSeconds: 0,
      isWithinGrace: false,
      isLateCheckIn: false,
      activeAttendance: activeRecord,
      message: `Checked in at ${activeRecord.checkIn}. Shift ends at ${formatMinutesOrDateToAmPm(times.shiftEndDateTime)}.`,
      shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
      shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
      checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
      gracePeriodMins: times.effectiveGraceMins,
      lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
      expectedStatus: (activeRecord.status === 'Late' ? 'Late' : 'Present'),
      timeZone,
      isHoliday: Boolean(holidayInfo?.isHoliday),
      holidayName: holidayInfo?.holidayName,
      isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
      leaveType: leaveInfo?.leaveType,
    };
  }

  // 4. Employee has NOT checked in yet for targetShiftDateStr:
  // A) Before the 3-hour early check-in window -> UPCOMING (Blocked as too early)
  if (now.getTime() < times.earlyCheckInDateTime.getTime()) {
    const diffMs = Math.max(0, times.earlyCheckInDateTime.getTime() - now.getTime());
    const countdownSeconds = Math.floor(diffMs / 1000);

    return {
      state: 'UPCOMING',
      canCheckIn: false,
      canCheckOut: false,
      assignedShift,
      shiftDate: targetShiftDateStr,
      shiftStartDateTime: times.shiftStartDateTime.toISOString(),
      shiftEndDateTime: times.shiftEndDateTime.toISOString(),
      earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
      graceEndDateTime: times.graceEndDateTime.toISOString(),
      countdownSeconds,
      isWithinGrace: false,
      isLateCheckIn: false,
      message: `Check-in for ${assignedShift.shiftName} opens at ${formatMinutesOrDateToAmPm(times.earlyCheckInDateTime)} (3 hours before ${formatMinutesOrDateToAmPm(times.shiftStartDateTime)} shift start).`,
      shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
      shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
      checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
      gracePeriodMins: times.effectiveGraceMins,
      lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
      expectedStatus: 'Present',
      timeZone,
      isHoliday: Boolean(holidayInfo?.isHoliday),
      holidayName: holidayInfo?.holidayName,
      isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
      leaveType: leaveInfo?.leaveType,
    };
  }

  // B) Within the active shift attendance window (from 3h before shiftStart up to shiftEnd + 4h buffer,
  //    or before next day's 3-hour early check-in window opens)
  const postShiftCheckInCutoff = new Date(times.shiftEndDateTime.getTime() + 2 * 60 * 60 * 1000);
  if (now.getTime() <= postShiftCheckInCutoff.getTime()) {
    const isWithinGrace = now.getTime() <= times.graceEndDateTime.getTime();
    const isLateCheckIn = now.getTime() > times.graceEndDateTime.getTime();
    const expectedStatus = isLateCheckIn ? 'Late' : 'Present';

    let statusMsg = `Check-in open for ${assignedShift.shiftName}.`;
    if (now.getTime() < times.shiftStartDateTime.getTime()) {
      statusMsg = `Early check-in open for ${assignedShift.shiftName} (Starts at ${formatMinutesOrDateToAmPm(times.shiftStartDateTime)}).`;
    } else if (isWithinGrace) {
      statusMsg = `Within ${times.effectiveGraceMins}-min grace window (until ${formatMinutesOrDateToAmPm(times.graceEndDateTime)}) — will be marked Present.`;
    } else {
      statusMsg = `Past ${formatMinutesOrDateToAmPm(times.graceEndDateTime)} grace cutoff — check-in is allowed and will be marked Late.`;
    }

    return {
      state: 'CHECK_IN_AVAILABLE',
      canCheckIn: true,
      canCheckOut: false,
      assignedShift,
      shiftDate: targetShiftDateStr,
      shiftStartDateTime: times.shiftStartDateTime.toISOString(),
      shiftEndDateTime: times.shiftEndDateTime.toISOString(),
      earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
      graceEndDateTime: times.graceEndDateTime.toISOString(),
      countdownSeconds: 0,
      isWithinGrace,
      isLateCheckIn,
      message: statusMsg,
      shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
      shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
      checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
      gracePeriodMins: times.effectiveGraceMins,
      lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
      expectedStatus,
      timeZone,
      isHoliday: Boolean(holidayInfo?.isHoliday),
      holidayName: holidayInfo?.holidayName,
      isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
      leaveType: leaveInfo?.leaveType,
    };
  }

  // C) Past today's shift window -> waiting for tomorrow's shift
  const nextTimes = calculateShiftDateTimes(tomorrowStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
  const diffMs = Math.max(0, nextTimes.earlyCheckInDateTime.getTime() - now.getTime());
  const countdownSeconds = Math.floor(diffMs / 1000);

  return {
    state: 'WAITING_FOR_NEXT_SHIFT',
    canCheckIn: false,
    canCheckOut: false,
    assignedShift,
    shiftDate: tomorrowStr,
    shiftStartDateTime: nextTimes.shiftStartDateTime.toISOString(),
    shiftEndDateTime: nextTimes.shiftEndDateTime.toISOString(),
    earlyCheckInDateTime: nextTimes.earlyCheckInDateTime.toISOString(),
    graceEndDateTime: nextTimes.graceEndDateTime.toISOString(),
    countdownSeconds,
    isWithinGrace: false,
    isLateCheckIn: false,
    message: `Shift window for today has closed. Next check-in opens at ${formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime)}.`,
    shiftStartDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftStartDateTime),
    shiftEndDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftEndDateTime),
    checkInOpenDisplay: formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime),
    gracePeriodMins: nextTimes.effectiveGraceMins,
    lateAfterDisplay: formatMinutesOrDateToAmPm(nextTimes.graceEndDateTime),
    expectedStatus: 'Present',
    timeZone,
    isHoliday: Boolean(holidayInfo?.isHoliday),
    holidayName: holidayInfo?.holidayName,
    isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
    leaveType: leaveInfo?.leaveType,
  };
}

export const MAX_OVERNIGHT_SESSION_MINUTES = 18 * 60; // 18 hours maximum permissible single attendance session

/**
 * Deterministically adds calendar days to a YYYY-MM-DD date string (handles month-end, leap-year, year-end).
 */
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

export function normalizeCalendarDateStr(raw?: string | Date | null, timeZone: string = DEFAULT_COMPANY_TIMEZONE): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return '';
    const wall = toTimezoneWallClockDate(raw, timeZone);
    return toDateStr(wall);
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
      return toDateStr(toTimezoneWallClockDate(parsed, timeZone));
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return '';
}

export function formatDurationHoursAndMinutes(totalMinutes: number): string {
  const safeMins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hrs = Math.floor(safeMins / 60);
  const mins = safeMins % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

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
 * Extracts wall-clock { hours, minutes, seconds, hasExplicitDate, calendarDate } in Asia/Kolkata
 * or parses a wall-clock time string ("10:04 AM", "01:00 AM", "22:00:00").
 */
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
    // Authoritative Asia/Kolkata (+05:30) instant construction
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
    const wallDateStr = toDateStr(wall);
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
  if (!str || str === '--:--' || str === '—' || str === '-' || str.toLowerCase().includes('progress') || str.toLowerCase().includes('missed')) {
    return null;
  }

  // Case 1: Full ISO or SQL timestamp with explicit date part (e.g. "2026-11-05T04:34:00.000Z" or "2026-11-05 10:04:00+05:30")
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(str)) {
    const hasOffset = /[Zz]|[+-]\d{2}:?\d{2}$/.test(str);
    const normalizedIso = hasOffset ? str.replace(' ', 'T') : `${str.replace(' ', 'T')}+05:30`;
    const parsed = new Date(normalizedIso);
    if (!isNaN(parsed.getTime())) {
      const wall = toTimezoneWallClockDate(parsed, timeZone);
      const wallDateStr = toDateStr(wall);
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

  // Case 2: Wall-clock time string ("10:04 AM", "01:00 AM", "22:00", "10:04:00")
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

/**
 * Authoritative Timezone-Aware Overnight Attendance & Overtime Resolver.
 * - Preserves actual check-in/check-out calendar dates in Asia/Kolkata.
 * - Associates a valid overnight punch-out on the following date (e.g. 01:00 AM on 06/11/2026)
 *   with the original punch-in and attendance/shift date (05/11/2026 10:04 AM -> 14h 56m / 14.93 hrs).
 * - Never blindly adds 24 hours to invalid or reversed same-day timestamps: validates chronological order,
 *   permissible session length (<= 18 hours by default), and non-overlap with next day's shift check-in.
 * - Never produces negative working hours or negative overtime.
 * - Calculates overtime using the employee's applicable threshold, break deduction rules, minimum OT duration,
 *   rounding, and daily cap rules.
 */
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
  const attendanceDate = normalizeCalendarDateStr(params.attendanceDate, timeZone) || toDateStr(toTimezoneWallClockDate(new Date(), timeZone));
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
    // Check if check-out can legitimately roll to the following calendar day (inParsed.wallDateStr + 1 day)
    // Valid when:
    // 1. checkOut was supplied as a time-of-day string (!outParsedInitial.hasExplicitDate) without an earlier explicit checkOutDate, OR
    // 2. allowAutoRollSameDateIsoCheckOut is enabled and outParsedInitial had the exact same wall-clock date in Asia/Kolkata as checkIn
    //    (caused by legacy localDateTimeToIso anchoring an overnight punch-out time like 01:00 AM to the check-in date).
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

    // Do NOT blindly add 24 hours to reversed same-day timestamps (e.g., 09:32 AM to 07:30 AM = 21h 58m, or 10:00 PM to 07:30 PM = 21h 30m)
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

  // Validate non-overlap with next day's shift check-in if provided
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

