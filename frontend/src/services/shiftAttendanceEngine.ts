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
    gracePeriodMins: 15,
    assignedEmployeeCount: 0,
    assignments: [],
    color: '#0E7490'
  };

  if (!employee || !shifts || shifts.length === 0) {
    return defaultShift;
  }

  const empShiftName = (employee.workShift || '').trim().toLowerCase();
  const empId = employee.employeeId || employee.id;

  // 1. Direct assignment in shift.assignments
  const assigned = shifts.find(s => 
    s.assignments?.some(a => (typeof a === 'string' ? a === empId : a.employeeId === empId))
  );
  if (assigned) return assigned;

  // 2. Name matching with employee.workShift
  if (empShiftName) {
    const matched = shifts.find(s => 
      s.shiftName.toLowerCase() === empShiftName ||
      s.shiftName.toLowerCase().includes(empShiftName) ||
      empShiftName.includes(s.shiftName.toLowerCase())
    );
    if (matched) return matched;
  }

  return shifts[0] || defaultShift;
}

/**
 * Calculates start and end Date objects for a given shift on a specific calendar date.
 */
export function calculateShiftDateTimes(shiftDateStr: string, shift: Shift): {
  startDateTime: Date;
  endDateTime: Date;
  earlyCheckInDateTime: Date;
  isNightShift: boolean;
} {
  const [year, month, day] = shiftDateStr.split('-').map(Number);
  const startComp = parseShiftTime(shift.startTime, '09:00');
  const endComp = parseShiftTime(shift.endTime, '18:00');

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

  return {
    startDateTime,
    endDateTime,
    earlyCheckInDateTime,
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
}): ShiftWindowEvaluation {
  const now = params.now ? new Date(params.now) : new Date();
  const todayStr = formatDateISO(now);
  const employee = params.employee;
  const empId = employee?.employeeId || employee?.id || 'EMP-001';

  const assignedShift = resolveEmployeeAssignedShift(employee, params.shifts);
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
      const { isNightShift, endDateTime } = calculateShiftDateTimes(yesterdayStr, assignedShift);
      if (isNightShift) {
        // Active night shift from yesterday running into today morning (with 4h grace)
        return now.getTime() <= endDateTime.getTime() + 4 * 3600 * 1000;
      }
    }
    return false;
  }) || null;

  if (activeAttendance) {
    const shiftDate = normalizeToYYYYMMDD(activeAttendance.shiftDate) || normalizeToYYYYMMDD(activeAttendance.date) || todayStr;
    const { startDateTime, endDateTime, earlyCheckInDateTime, isNightShift } = calculateShiftDateTimes(shiftDate, assignedShift);

    return {
      state: 'CHECKED_IN',
      canCheckIn: false,
      canCheckOut: true,
      activeAttendance,
      completedAttendance: null,
      assignedShift,
      shiftDate,
      shiftStartDateTime: startDateTime,
      shiftEndDateTime: endDateTime,
      earlyCheckInDateTime,
      statusTitle: 'Active Attendance',
      statusBadge: 'Checked In',
      shiftTimingDisplay,
      availabilityDisplay: `Checked in at ${activeAttendance.checkIn}`,
      countdownText: 'Shift In Progress',
      message: 'You are currently checked in. Check-out is available when your shift ends.',
      isNightShift,
      isNextDayShift: false
    };
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
    const { startDateTime, endDateTime, earlyCheckInDateTime, isNightShift } = calculateShiftDateTimes(todayStr, assignedShift);
    const earlyHours = earlyCheckInDateTime.getHours();
    const earlyMins = earlyCheckInDateTime.getMinutes();
    const earlyAmpm = earlyHours >= 12 ? 'PM' : 'AM';
    const earlyDispHours = earlyHours % 12 || 12;
    const earlyTimeStr = `${String(earlyDispHours).padStart(2, '0')}:${String(earlyMins).padStart(2, '0')} ${earlyAmpm}`;

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
      statusTitle: 'Check-In Available',
      statusBadge: 'Available Now',
      shiftTimingDisplay,
      availabilityDisplay: `Your shift starts at ${startComp.display12}`,
      countdownText: 'Early Check In is available',
      message: `Your shift starts at ${startComp.display12}. Early Check In is available.`,
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
    isNightShift
  } = calculateShiftDateTimes(nextDateStr, assignedShift);

  const nextEarlyHours = nextEarlyCheckInDateTime.getHours();
  const nextEarlyMins = nextEarlyCheckInDateTime.getMinutes();
  const nextEarlyAmpm = nextEarlyHours >= 12 ? 'PM' : 'AM';
  const nextEarlyDispHours = nextEarlyHours % 12 || 12;
  const nextEarlyTimeStr = `${String(nextEarlyDispHours).padStart(2, '0')}:${String(nextEarlyMins).padStart(2, '0')} ${nextEarlyAmpm}`;

  const friendlyEarlyDisplay = formatFriendlyShiftTime(nextEarlyCheckInDateTime, now, nextEarlyTimeStr);

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
