// ============================================================================
// VRM Enterprise HRMS — Shift-Based Attendance & Check-In Window Engine
// Enforces 3-Hour Early Check-In Window, Shift Closure, and 5-State Lifecycle
// ============================================================================

import { AttendanceRecord, AttendanceShiftState, Employee, HolidayItem, LeaveRequest, Shift } from '../types/hrms';
import { WeeklyScheduleItem } from '../types/hrms';
import { isDateWeeklyOffBySchedule } from '../utils/weeklyScheduleUtils';
import { normalizeToYYYYMMDD } from '../utils/dateUtils';

export interface ShiftTimeComponents {
  hours: number;     // 0 - 23
  minutes: number;   // 0 - 59
  display12: string; // e.g. "09:00 AM", "06:00 PM"
}

export interface ShiftWindowEvaluation {
  state: AttendanceShiftState;
  canCheckIn: boolean;
  canCheckOut: boolean;
  activeAttendance: AttendanceRecord | null;
  completedAttendance: AttendanceRecord | null;
  assignedShift: Shift;
  shiftDate: string;             // 'YYYY-MM-DD' representing the shift cycle date
  shiftStartDateTime: Date;
  shiftEndDateTime: Date;
  earlyCheckInDateTime: Date;    // shiftStartDateTime - 3 hours
  graceEndDateTime: Date;        // shiftStartDateTime + gracePeriodMins
  gracePeriodMins: number;
  shiftStartDisplay: string;     // e.g. "09:00 AM"
  shiftEndDisplay: string;       // e.g. "06:00 PM"
  checkInOpenDisplay: string;    // e.g. "06:00 AM"
  lateAfterDisplay: string;      // e.g. "09:40 AM"
  isWithinGrace: boolean;
  isLateCheckIn: boolean;
  expectedStatus: 'Present' | 'Late';
  timeZone: string;
  statusTitle: string;
  statusBadge: string;
  shiftTimingDisplay: string;    // e.g. "Shift: 09:00 AM – 06:00 PM"
  availabilityDisplay: string;   // e.g. "Check In available from 06:00 AM"
  countdownText: string;
  message: string;
  isNightShift: boolean;
  isNextDayShift: boolean;
}

/**
 * Parses time string (e.g. "09:00", "18:00", "09:00 AM", "10:00 PM", "22:00")
 * into normalized 24-hour hours, minutes, and formatted 12-hour AM/PM display.
 */
export function parseShiftTime(timeStr?: string | null, fallback = '09:00'): ShiftTimeComponents {
  const clean = (timeStr || fallback).trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);

  let hours = 9;
  let minutes = 0;

  if (match) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const meridian = match[3];

    if (meridian) {
      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;
    }
  }

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const display12 = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;

  return { hours, minutes, display12 };
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a specific date is a weekly off day for the employee or company.
 */
export function isDateWeeklyOff(
  date: Date,
  weeklySchedules?: WeeklyScheduleItem[],
  customWorkingDays?: string[]
): boolean {
  return isDateWeeklyOffBySchedule(date, weeklySchedules, customWorkingDays);
}

/**
 * Checks if a specific date is a public corporate holiday.
 */
export function isDateHoliday(date: Date, holidays?: HolidayItem[]): boolean {
  if (!holidays || holidays.length === 0) return false;
  const dateStr = formatDateISO(date);
  return holidays.some(h => h.date === dateStr);
}

/**
 * Checks if an employee has an approved full-day leave on a specific date.
 */
export function isDateApprovedLeave(date: Date, empId: string, leaves?: LeaveRequest[]): boolean {
  if (!leaves || leaves.length === 0) return false;
  const dateStr = formatDateISO(date);
  return leaves.some(l => {
    if (l.employeeId !== empId || l.status !== 'Approved') return false;
    const dur = (l as any).leaveDuration;
    return dateStr >= l.startDate && dateStr <= l.endDate && dur !== 'First Half' && dur !== 'Second Half';
  });
}

/**
 * Resolves an employee's assigned Shift model from master shifts list.
 */
export function resolveEmployeeAssignedShift(
  employee: Employee | null | undefined,
  shifts: Shift[]
): Shift {
  const defaultShift: Shift = {
    id: 'SH-01',
    shiftName: 'Shift 1 (09:00 AM - 06:00 PM)',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMins: 45,
    workingHours: 8.25,
    gracePeriodMins: 40,
    assignedEmployeeCount: 0,
    assignments: [],
    color: '#0E7490'
  };

  if (!employee || !shifts || shifts.length === 0) {
    return defaultShift;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingShift = (employee as any).upcomingShift || (employee as any).shiftDetails?.upcomingShift;
  const upcomingEffectiveFrom = (employee as any).upcomingShiftEffectiveFrom || (employee as any).shiftDetails?.upcomingShiftEffectiveFrom;
  const hasEffectiveUpcoming = Boolean(
    upcomingShift && upcomingEffectiveFrom && String(upcomingEffectiveFrom).slice(0, 10) <= todayStr
  );
  const empId = employee.employeeId || employee.id;

  // 1. If an upcoming shift change has become effective today, honor it first
  if (hasEffectiveUpcoming) {
    const upClean = activeShiftNameClean(String(upcomingShift));
    const upMatch = shifts.find(
      s =>
        s.id.toLowerCase() === upClean ||
        activeShiftNameClean(s.shiftName) === upClean ||
        s.shiftName.trim().toLowerCase() === String(upcomingShift).trim().toLowerCase() ||
        activeShiftNameClean(s.shiftName).includes(upClean) ||
        upClean.includes(activeShiftNameClean(s.shiftName))
    );
    if (upMatch) return upMatch;
  }

  // 2. Prioritize active assignment in shift.assignments (PostgreSQL public.shift_assignments)
  const assigned = shifts.find(s =>
    s.assignments?.some((a: any) => {
      const aEmpId = typeof a === 'string' ? a : a?.employeeId;
      if (!aEmpId) return false;
      const aNorm = String(aEmpId).trim().toLowerCase();
      const empIdNorm = String(empId || '').trim().toLowerCase();
      const uuidNorm = String(employee.id || '').trim().toLowerCase();
      if (aNorm !== empIdNorm && aNorm !== uuidNorm) return false;
      if (typeof a === 'object' && a !== null) {
        const effFrom = a.effectiveFrom || a.effective_from;
        const effTo = a.effectiveTo || a.effective_to;
        if (effFrom && String(effFrom).slice(0, 10) > todayStr) return false;
        if (effTo && String(effTo).slice(0, 10) < todayStr) return false;
      }
      return true;
    })
  );
  if (assigned) return assigned;

  // 3. Fallback to employee.workShift / assignedShift label
  const activeShiftLabel = String(employee.workShift || (employee as any).shiftDetails?.assignedShift || '');
  const empShiftName = activeShiftNameClean(activeShiftLabel);
  if (empShiftName) {
    const exactMatch = shifts.find(s =>
      s.id.toLowerCase() === empShiftName ||
      activeShiftNameClean(s.shiftName) === empShiftName ||
      s.shiftName.trim().toLowerCase() === activeShiftLabel.trim().toLowerCase()
    );
    if (exactMatch) return exactMatch;

    const partialMatch = shifts.find(s => {
      const sClean = activeShiftNameClean(s.shiftName);
      return sClean.includes(empShiftName) || empShiftName.includes(sClean);
    });
    if (partialMatch) return partialMatch;
  }

  return shifts[0] || defaultShift;
}

function activeShiftNameClean(raw: string): string {
  return String(raw || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
}

function formatDateTime12Hr(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Calculates start and end Date objects for a given shift on a specific calendar date.
 */
export function calculateShiftDateTimes(shiftDateStr: string, shift: Shift, gracePeriodMinutes?: number): {
  startDateTime: Date;
  endDateTime: Date;
  earlyCheckInDateTime: Date;
  graceEndDateTime: Date;
  gracePeriodMins: number;
  shiftStartDisplay: string;
  shiftEndDisplay: string;
  checkInOpenDisplay: string;
  lateAfterDisplay: string;
  isNightShift: boolean;
} {
  const [year, month, day] = shiftDateStr.split('-').map(Number);
  const startComp = parseShiftTime(shift.startTime, '09:00');
  const endComp = parseShiftTime(shift.endTime, '18:00');
  const gracePeriodMins = Math.max(0, Number(gracePeriodMinutes ?? shift.gracePeriodMins ?? 40));

  const startDateTime = new Date(year, month - 1, day, startComp.hours, startComp.minutes, 0, 0);

  // Check if shift crosses midnight (Night Shift)
  const isNightShift = 
    endComp.hours < startComp.hours || 
    (endComp.hours === startComp.hours && endComp.minutes <= startComp.minutes);

  let endDateTime: Date;
  if (isNightShift) {
    // Ends on the following calendar day
    endDateTime = new Date(year, month - 1, day + 1, endComp.hours, endComp.minutes, 0, 0);
  } else {
    endDateTime = new Date(year, month - 1, day, endComp.hours, endComp.minutes, 0, 0);
  }

  // Exactly 3 hours prior to shift start
  const earlyCheckInDateTime = new Date(startDateTime.getTime() - 3 * 60 * 60 * 1000);
  const graceEndDateTime = new Date(startDateTime.getTime() + gracePeriodMins * 60 * 1000);

  return {
    startDateTime,
    endDateTime,
    earlyCheckInDateTime,
    graceEndDateTime,
    gracePeriodMins,
    shiftStartDisplay: startComp.display12,
    shiftEndDisplay: endComp.display12,
    checkInOpenDisplay: formatDateTime12Hr(earlyCheckInDateTime),
    lateAfterDisplay: formatDateTime12Hr(graceEndDateTime),
    isNightShift
  };
}

/**
 * Formats time countdown e.g. "Starts in 2h 15m" or "Starts in 45m"
 */
export function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'Available now';
  const totalMins = Math.ceil(diffMs / (60 * 1000));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * Format date time for display in "06:00 AM" or "Mon, 22 Sep 06:00 AM"
 */
export function formatFriendlyShiftTime(targetDate: Date, nowDate: Date, display12: string): string {
  const isSameDay = 
    targetDate.getFullYear() === nowDate.getFullYear() &&
    targetDate.getMonth() === nowDate.getMonth() &&
    targetDate.getDate() === nowDate.getDate();

  const tomorrow = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1);
  const isTomorrow = 
    targetDate.getFullYear() === tomorrow.getFullYear() &&
    targetDate.getMonth() === tomorrow.getMonth() &&
    targetDate.getDate() === tomorrow.getDate();

  if (isSameDay) {
    return display12;
  }
  if (isTomorrow) {
    return `Tomorrow ${display12}`;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[targetDate.getDay()];
  const monthName = months[targetDate.getMonth()];
  const dayNum = targetDate.getDate();

  return `${dayName}, ${dayNum} ${monthName} ${display12}`;
}

/**
 * Formats a duration in seconds or milliseconds into HH:MM:SS countdown format
 */
export function formatShiftCountdown(diffSecondsOrMs: number): string {
  const seconds = diffSecondsOrMs > 100000 ? Math.floor(diffSecondsOrMs / 1000) : Math.floor(diffSecondsOrMs);
  if (seconds <= 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Master evaluation function: Calculates the 5-state lifecycle for an employee's attendance.
 */
export function evaluateShiftAttendance(params: {
  employee: Employee | null | undefined;
  shifts: Shift[];
  attendanceRecords: AttendanceRecord[];
  now?: Date;
  holidays?: HolidayItem[];
  weeklySchedules?: WeeklyScheduleItem[];
  leaves?: LeaveRequest[];
  gracePeriodMinutes?: number;
  timeZone?: string;
}): ShiftWindowEvaluation {
  const now = params.now ? new Date(params.now) : new Date();
  const timeZone = params.timeZone || 'Asia/Kolkata';
  const todayStr = formatDateISO(now);
  const employee = params.employee;
  const empId = employee?.employeeId || employee?.id || 'EMP-001';

  const assignedShift = resolveEmployeeAssignedShift(employee, params.shifts);
  const effectiveGraceMins = Math.max(0, Number(params.gracePeriodMinutes ?? assignedShift.gracePeriodMins ?? 40));
  const startComp = parseShiftTime(assignedShift.startTime, '09:00');
  const endComp = parseShiftTime(assignedShift.endTime, '18:00');
  const shiftTimingDisplay = `Shift: ${startComp.display12} – ${endComp.display12}`;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStr = formatDateISO(yesterday);

  // 1. Check for an ACTIVE unclosed check-in (checkOut is NULL or empty)
  // An active attendance can strictly belong ONLY to today or yesterday's night shift!
  // Any unclosed check-ins from past dates must NEVER hijack today's check-in.
  const activeAttendance = params.attendanceRecords.find(a => {
    if (a.employeeId !== empId) return false;
    const hasCheckIn = Boolean(a.checkIn && a.checkIn.trim() !== '' && a.checkIn !== '--:--');
    const hasNoCheckOut = !a.checkOut || a.checkOut.trim() === '' || a.checkOut === '--:--';
    if (!hasCheckIn || !hasNoCheckOut) return false;

    const recDate = normalizeToYYYYMMDD(a.shiftDate) || normalizeToYYYYMMDD(a.date);
    if (recDate === todayStr) {
      return true;
    }
    if (recDate === yesterdayStr) {
      const { isNightShift, endDateTime } = calculateShiftDateTimes(yesterdayStr, assignedShift, effectiveGraceMins);
      if (isNightShift) {
        // Active night shift from yesterday running into today morning (with 4h grace)
        return now.getTime() <= endDateTime.getTime() + 4 * 3600 * 1000;
      }
    }
    return false;
  }) || null;

  if (activeAttendance) {
    const shiftDate = normalizeToYYYYMMDD(activeAttendance.shiftDate) || normalizeToYYYYMMDD(activeAttendance.date) || todayStr;
    const {
      startDateTime,
      endDateTime,
      earlyCheckInDateTime,
      graceEndDateTime,
      gracePeriodMins,
      shiftStartDisplay,
      shiftEndDisplay,
      checkInOpenDisplay,
      lateAfterDisplay,
      isNightShift
    } = calculateShiftDateTimes(shiftDate, assignedShift, effectiveGraceMins);

    const checkInComp = parseShiftTime(activeAttendance.checkIn, '09:00');
    const [sy, sm, sd] = shiftDate.split('-').map(Number);
    let checkInDateTime = new Date(sy, (sm || 1) - 1, sd || 1, checkInComp.hours, checkInComp.minutes, 0, 0);
    if ((activeAttendance as any).checkInTimestamp && typeof (activeAttendance as any).checkInTimestamp === 'number') {
      checkInDateTime = new Date((activeAttendance as any).checkInTimestamp);
    } else if (typeof window !== 'undefined') {
      try {
        const savedEpoch = localStorage.getItem(`vrm_punch_in_epoch_${empId}_${shiftDate}`);
        if (savedEpoch && !isNaN(Number(savedEpoch))) {
          checkInDateTime = new Date(Number(savedEpoch));
        }
      } catch {}
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const elapsedSinceCheckInMs = now.getTime() - checkInDateTime.getTime();
    const isWithinOneHourCooldown = elapsedSinceCheckInMs >= 0 && elapsedSinceCheckInMs < ONE_HOUR_MS;
    const remainingCooldownMins = isWithinOneHourCooldown
      ? Math.max(1, Math.ceil((ONE_HOUR_MS - elapsedSinceCheckInMs) / 60000))
      : 0;
    const isLatePunch = activeAttendance.status === 'Late' || checkInDateTime.getTime() > graceEndDateTime.getTime();

    return {
      state: 'CHECKED_IN',
      canCheckIn: false,
      canCheckOut: !isWithinOneHourCooldown,
      activeAttendance,
      completedAttendance: null,
      assignedShift,
      shiftDate,
      shiftStartDateTime: startDateTime,
      shiftEndDateTime: endDateTime,
      earlyCheckInDateTime,
      graceEndDateTime,
      gracePeriodMins,
      shiftStartDisplay,
      shiftEndDisplay,
      checkInOpenDisplay,
      lateAfterDisplay,
      isWithinGrace: !isLatePunch,
      isLateCheckIn: isLatePunch,
      expectedStatus: isLatePunch ? 'Late' : 'Present',
      timeZone,
      statusTitle: 'Active Attendance',
      statusBadge: 'Checked In',
      shiftTimingDisplay,
      availabilityDisplay: `Checked in at ${activeAttendance.checkIn}`,
      countdownText: isWithinOneHourCooldown ? `Punch Out in ${remainingCooldownMins}m` : 'Shift In Progress',
      message: isWithinOneHourCooldown
        ? `Punch In and Punch Out cannot be done at the same time. Punch Out available in ${remainingCooldownMins} min (1-hour delay required).`
        : 'You are currently checked in. Check-out is available when your shift ends.',
      isNightShift,
      isNextDayShift: false
    };
  }

  // 1b. Check if yesterday's overnight shift is STILL running right now (and not yet checked in or completed)
  const yesterdayTiming = calculateShiftDateTimes(yesterdayStr, assignedShift, effectiveGraceMins);
  if (yesterdayTiming.isNightShift && now.getTime() <= yesterdayTiming.endDateTime.getTime()) {
    const yesterdayCompleted = params.attendanceRecords.find(a => {
      if (a.employeeId !== empId) return false;
      const recShiftDate = normalizeToYYYYMMDD(a.shiftDate) || normalizeToYYYYMMDD(a.date);
      return recShiftDate === yesterdayStr && Boolean(a.checkOut && a.checkOut.trim() !== '' && a.checkOut !== '--:--');
    }) || null;

    if (!yesterdayCompleted) {
      const isLateNow = now.getTime() > yesterdayTiming.graceEndDateTime.getTime();
      return {
        state: 'CHECK_IN_AVAILABLE',
        canCheckIn: true,
        canCheckOut: false,
        activeAttendance: null,
        completedAttendance: null,
        assignedShift,
        shiftDate: yesterdayStr,
        shiftStartDateTime: yesterdayTiming.startDateTime,
        shiftEndDateTime: yesterdayTiming.endDateTime,
        earlyCheckInDateTime: yesterdayTiming.earlyCheckInDateTime,
        graceEndDateTime: yesterdayTiming.graceEndDateTime,
        gracePeriodMins: yesterdayTiming.gracePeriodMins,
        shiftStartDisplay: yesterdayTiming.shiftStartDisplay,
        shiftEndDisplay: yesterdayTiming.shiftEndDisplay,
        checkInOpenDisplay: yesterdayTiming.checkInOpenDisplay,
        lateAfterDisplay: yesterdayTiming.lateAfterDisplay,
        isWithinGrace: !isLateNow,
        isLateCheckIn: isLateNow,
        expectedStatus: isLateNow ? 'Late' : 'Present',
        timeZone,
        statusTitle: isLateNow ? 'Late Check-In Open' : 'Check-In Available',
        statusBadge: isLateNow ? 'Late Window' : 'Available Now',
        shiftTimingDisplay,
        availabilityDisplay: isLateNow
          ? `Overnight shift in progress (Late after ${yesterdayTiming.lateAfterDisplay})`
          : `Overnight shift starts at ${yesterdayTiming.shiftStartDisplay}`,
        countdownText: isLateNow ? 'Late Check-In Open' : 'Check-In Open',
        message: isLateNow
          ? `Overnight shift started at ${yesterdayTiming.shiftStartDisplay} (Grace ended at ${yesterdayTiming.lateAfterDisplay}). Check-in will be marked Late.`
          : `Overnight shift starts at ${yesterdayTiming.shiftStartDisplay}. Check-in is open.`,
        isNightShift: true,
        isNextDayShift: false
      };
    }
  }

  // 2. Check if today's shift has already been COMPLETED (checkOut is present)
  const todayCompleted = params.attendanceRecords.find(a => {
    if (a.employeeId !== empId) return false;
    const recShiftDate = normalizeToYYYYMMDD(a.shiftDate) || normalizeToYYYYMMDD(a.date);
    return recShiftDate === todayStr && Boolean(a.checkOut && a.checkOut.trim() !== '' && a.checkOut !== '--:--');
  }) || null;

  // Also check if today is a non-working day (Weekly Off, Holiday, Approved Leave)
  const isTodayOff = isDateWeeklyOff(now, params.weeklySchedules, (employee as any)?.workingDays);
  const isTodayHoliday = isDateHoliday(now, params.holidays);
  const isTodayLeave = isDateApprovedLeave(now, empId, params.leaves);
  const isTodayWorkable = !isTodayOff && !isTodayHoliday && !isTodayLeave;

  // 3. If today's shift is workable and NOT completed yet:
  if (isTodayWorkable && !todayCompleted) {
    const {
      startDateTime,
      endDateTime,
      earlyCheckInDateTime,
      graceEndDateTime,
      gracePeriodMins,
      shiftStartDisplay,
      shiftEndDisplay,
      checkInOpenDisplay,
      lateAfterDisplay,
      isNightShift
    } = calculateShiftDateTimes(todayStr, assignedShift, effectiveGraceMins);
    const earlyTimeStr = checkInOpenDisplay;

    // A. Check if current time is BEFORE the 3-hour early check-in window
    if (now.getTime() < earlyCheckInDateTime.getTime()) {
      const diffMs = earlyCheckInDateTime.getTime() - now.getTime();
      return {
        state: 'UPCOMING',
        canCheckIn: false,
        canCheckOut: false,
        activeAttendance: null,
        completedAttendance: null,
        assignedShift,
        shiftDate: todayStr,
        shiftStartDateTime: startDateTime,
        shiftEndDateTime: endDateTime,
        earlyCheckInDateTime,
        graceEndDateTime,
        gracePeriodMins,
        shiftStartDisplay,
        shiftEndDisplay,
        checkInOpenDisplay,
        lateAfterDisplay,
        isWithinGrace: true,
        isLateCheckIn: false,
        expectedStatus: 'Present',
        timeZone,
        statusTitle: 'Next Shift',
        statusBadge: 'Upcoming',
        shiftTimingDisplay,
        availabilityDisplay: `Check In available from ${earlyTimeStr}`,
        countdownText: `Opens in ${formatCountdown(diffMs)}`,
        message: `Check In available from ${earlyTimeStr}`,
        isNightShift,
        isNextDayShift: false
      };
    }

    // B. Check if current time is within or after the 3-hour window
    const isBeforeShiftStart = now.getTime() < startDateTime.getTime();
    const isWithinGrace = now.getTime() <= graceEndDateTime.getTime();
    const isLateCheckIn = now.getTime() > graceEndDateTime.getTime();

    return {
      state: 'CHECK_IN_AVAILABLE',
      canCheckIn: true,
      canCheckOut: false,
      activeAttendance: null,
      completedAttendance: null,
      assignedShift,
      shiftDate: todayStr,
      shiftStartDateTime: startDateTime,
      shiftEndDateTime: endDateTime,
      earlyCheckInDateTime,
      graceEndDateTime,
      gracePeriodMins,
      shiftStartDisplay,
      shiftEndDisplay,
      checkInOpenDisplay,
      lateAfterDisplay,
      isWithinGrace,
      isLateCheckIn,
      expectedStatus: isLateCheckIn ? 'Late' : 'Present',
      timeZone,
      statusTitle: isLateCheckIn ? 'Late Check-In Open' : 'Check-In Available',
      statusBadge: isLateCheckIn ? 'Late Window' : 'Available Now',
      shiftTimingDisplay,
      availabilityDisplay: isLateCheckIn
        ? `Grace ended at ${lateAfterDisplay} • Check-in marked Late`
        : isBeforeShiftStart
          ? `Your shift starts at ${startComp.display12}`
          : `Within ${gracePeriodMins}m grace until ${lateAfterDisplay}`,
      countdownText: isLateCheckIn
        ? 'Late Check-In Open'
        : isBeforeShiftStart
          ? 'Early Check In is available'
          : 'On-Time Window Open',
      message: isLateCheckIn
        ? `Your shift started at ${startComp.display12} (Grace ended at ${lateAfterDisplay}). Check-in is allowed and will be marked Late.`
        : isBeforeShiftStart
          ? `Your shift starts at ${startComp.display12}. Early Check In is available.`
          : `Shift started at ${startComp.display12}. On-time check-in available until ${lateAfterDisplay}.`,
      isNightShift,
      isNextDayShift: false
    };
  }

  // 4. Either today's shift was completed, OR today is an off day / holiday / leave.
  // We must find the employee's NEXT ASSIGNED SHIFT on the next workable working day!
  let nextWorkDate: Date | null = null;
  let nextDateStr = '';

  for (let offset = 1; offset <= 14; offset++) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0);
    const candidateStr = formatDateISO(candidate);

    const off = isDateWeeklyOff(candidate, params.weeklySchedules, (employee as any)?.workingDays);
    const holiday = isDateHoliday(candidate, params.holidays);
    const leave = isDateApprovedLeave(candidate, empId, params.leaves);

    if (!off && !holiday && !leave) {
      nextWorkDate = candidate;
      nextDateStr = candidateStr;
      break;
    }
  }

  // Fallback to tomorrow if no candidate found
  if (!nextWorkDate) {
    nextWorkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
    nextDateStr = formatDateISO(nextWorkDate);
  }

  const {
    startDateTime: nextStartDateTime,
    endDateTime: nextEndDateTime,
    earlyCheckInDateTime: nextEarlyCheckInDateTime,
    graceEndDateTime: nextGraceEndDateTime,
    gracePeriodMins: nextGracePeriodMins,
    shiftStartDisplay: nextShiftStartDisplay,
    shiftEndDisplay: nextShiftEndDisplay,
    checkInOpenDisplay: nextCheckInOpenDisplay,
    lateAfterDisplay: nextLateAfterDisplay,
    isNightShift
  } = calculateShiftDateTimes(nextDateStr, assignedShift, effectiveGraceMins);

  const friendlyEarlyDisplay = formatFriendlyShiftTime(nextEarlyCheckInDateTime, now, nextCheckInOpenDisplay);

  // Check if now is already within the 3-hour window for the next shift
  if (now.getTime() >= nextEarlyCheckInDateTime.getTime()) {
    return {
      state: 'CHECK_IN_AVAILABLE',
      canCheckIn: true,
      canCheckOut: false,
      activeAttendance: null,
      completedAttendance: todayCompleted,
      assignedShift,
      shiftDate: nextDateStr,
      shiftStartDateTime: nextStartDateTime,
      shiftEndDateTime: nextEndDateTime,
      earlyCheckInDateTime: nextEarlyCheckInDateTime,
      graceEndDateTime: nextGraceEndDateTime,
      gracePeriodMins: nextGracePeriodMins,
      shiftStartDisplay: nextShiftStartDisplay,
      shiftEndDisplay: nextShiftEndDisplay,
      checkInOpenDisplay: nextCheckInOpenDisplay,
      lateAfterDisplay: nextLateAfterDisplay,
      isWithinGrace: true,
      isLateCheckIn: false,
      expectedStatus: 'Present',
      timeZone,
      statusTitle: 'Check-In Available',
      statusBadge: 'Available Now',
      shiftTimingDisplay,
      availabilityDisplay: `Your shift starts at ${startComp.display12}`,
      countdownText: 'Early Check In is available',
      message: `Your shift starts at ${startComp.display12}. Early Check In is available.`,
      isNightShift,
      isNextDayShift: true
    };
  }

  // Next early window has NOT started yet
  const diffMs = nextEarlyCheckInDateTime.getTime() - now.getTime();
  const isCompletedToday = Boolean(todayCompleted);

  return {
    state: isCompletedToday ? 'COMPLETED' : 'WAITING_FOR_NEXT_SHIFT',
    canCheckIn: false,
    canCheckOut: false,
    activeAttendance: null,
    completedAttendance: todayCompleted,
    assignedShift,
    shiftDate: nextDateStr,
    shiftStartDateTime: nextStartDateTime,
    shiftEndDateTime: nextEndDateTime,
    earlyCheckInDateTime: nextEarlyCheckInDateTime,
    graceEndDateTime: nextGraceEndDateTime,
    gracePeriodMins: nextGracePeriodMins,
    shiftStartDisplay: nextShiftStartDisplay,
    shiftEndDisplay: nextShiftEndDisplay,
    checkInOpenDisplay: nextCheckInOpenDisplay,
    lateAfterDisplay: nextLateAfterDisplay,
    isWithinGrace: true,
    isLateCheckIn: false,
    expectedStatus: 'Present',
    timeZone,
    statusTitle: isCompletedToday ? 'Attendance Completed' : 'Next Shift',
    statusBadge: isCompletedToday ? 'Completed' : 'Waiting',
    shiftTimingDisplay,
    availabilityDisplay: `Next Check In available from ${friendlyEarlyDisplay}`,
    countdownText: `Opens in ${formatCountdown(diffMs)}`,
    message: isCompletedToday 
      ? `Shift completed. Next Check In available from ${friendlyEarlyDisplay}`
      : `Check In available from ${friendlyEarlyDisplay}`,
    isNightShift,
    isNextDayShift: true
  };
}
